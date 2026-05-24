import { Router } from "express";
import { db, pool } from "@workspace/db";
import { reservationsTable, stockLevelsTable, productsTable, warehousesTable } from "@workspace/db";
import { eq, and, lt, inArray } from "drizzle-orm";
import { CreateReservationBody, ConfirmReservationParams, ReleaseReservationParams, GetReservationParams } from "@workspace/api-zod";
import { randomUUID } from "crypto";

const router = Router();

const RESERVATION_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

async function getReservationWithDetails(id: string) {
  const rows = await db
    .select({
      id: reservationsTable.id,
      productId: reservationsTable.productId,
      productName: productsTable.name,
      productSku: productsTable.sku,
      warehouseId: reservationsTable.warehouseId,
      warehouseName: warehousesTable.name,
      quantity: reservationsTable.quantity,
      status: reservationsTable.status,
      expiresAt: reservationsTable.expiresAt,
      createdAt: reservationsTable.createdAt,
      updatedAt: reservationsTable.updatedAt,
    })
    .from(reservationsTable)
    .innerJoin(productsTable, eq(reservationsTable.productId, productsTable.id))
    .innerJoin(warehousesTable, eq(reservationsTable.warehouseId, warehousesTable.id))
    .where(eq(reservationsTable.id, id));
  return rows[0] ?? null;
}

function formatReservation(r: NonNullable<Awaited<ReturnType<typeof getReservationWithDetails>>>) {
  return {
    id: r.id,
    productId: r.productId,
    productName: r.productName,
    productSku: r.productSku,
    warehouseId: r.warehouseId,
    warehouseName: r.warehouseName,
    quantity: r.quantity,
    status: r.status,
    expiresAt: r.expiresAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

// POST /reservations — race-condition-safe using SELECT FOR UPDATE
router.post("/reservations", async (req, res) => {
  const parsed = CreateReservationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { productId, warehouseId, quantity } = parsed.data;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Lock the specific stock_level row so concurrent requests are serialized.
    // Only one transaction can hold the lock at a time — the loser waits,
    // then sees the updated reservedUnits and correctly returns 409.
    const lockResult = await client.query<{
      id: string;
      total_units: number;
      reserved_units: number;
    }>(
      `SELECT id, total_units, reserved_units
       FROM stock_levels
       WHERE product_id = $1 AND warehouse_id = $2
       FOR UPDATE`,
      [productId, warehouseId],
    );

    if (lockResult.rows.length === 0) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "No stock entry found for this product/warehouse combination" });
      return;
    }

    const row = lockResult.rows[0]!;
    const available = row.total_units - row.reserved_units;

    if (available < quantity) {
      await client.query("ROLLBACK");
      res.status(409).json({
        error: `Insufficient stock. Requested ${quantity}, available ${available}.`,
      });
      return;
    }

    // Decrement available stock by incrementing reservedUnits
    await client.query(
      `UPDATE stock_levels SET reserved_units = reserved_units + $1, updated_at = NOW()
       WHERE id = $2`,
      [quantity, row.id],
    );

    const reservationId = randomUUID();
    const expiresAt = new Date(Date.now() + RESERVATION_WINDOW_MS);

    await client.query(
      `INSERT INTO reservations (id, product_id, warehouse_id, quantity, status, expires_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'pending', $5, NOW(), NOW())`,
      [reservationId, productId, warehouseId, quantity, expiresAt],
    );

    await client.query("COMMIT");

    const reservation = await getReservationWithDetails(reservationId);
    if (!reservation) {
      res.status(500).json({ error: "Failed to fetch created reservation" });
      return;
    }

    res.status(201).json(formatReservation(reservation));
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    req.log.error({ err }, "Failed to create reservation");
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
});

// GET /reservations/:id
router.get("/reservations/:id", async (req, res) => {
  const parsed = GetReservationParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid reservation ID" });
    return;
  }

  const reservation = await getReservationWithDetails(parsed.data.id);
  if (!reservation) {
    res.status(404).json({ error: "Reservation not found" });
    return;
  }

  res.json(formatReservation(reservation));
});

// POST /reservations/:id/confirm
router.post("/reservations/:id/confirm", async (req, res) => {
  const parsed = ConfirmReservationParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid reservation ID" });
    return;
  }

  const { id } = parsed.data;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const result = await client.query<{
      id: string;
      product_id: string;
      warehouse_id: string;
      quantity: number;
      status: string;
      expires_at: Date;
    }>(
      `SELECT id, product_id, warehouse_id, quantity, status, expires_at
       FROM reservations WHERE id = $1
       FOR UPDATE`,
      [id],
    );

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Reservation not found" });
      return;
    }

    const reservation = result.rows[0]!;

    if (reservation.status !== "pending") {
      await client.query("ROLLBACK");
      res.status(409).json({ error: `Reservation is already ${reservation.status}` });
      return;
    }

    if (new Date() > reservation.expires_at) {
      // Release the hold since it expired
      await client.query(
        `UPDATE stock_levels SET reserved_units = GREATEST(0, reserved_units - $1), updated_at = NOW()
         WHERE product_id = $2 AND warehouse_id = $3`,
        [reservation.quantity, reservation.product_id, reservation.warehouse_id],
      );
      await client.query(
        `UPDATE reservations SET status = 'released', updated_at = NOW() WHERE id = $1`,
        [id],
      );
      await client.query("COMMIT");
      res.status(410).json({ error: "Reservation has expired" });
      return;
    }

    // Confirm: permanently decrement total_units and release the reserved hold
    await client.query(
      `UPDATE stock_levels
       SET total_units = GREATEST(0, total_units - $1),
           reserved_units = GREATEST(0, reserved_units - $1),
           updated_at = NOW()
       WHERE product_id = $2 AND warehouse_id = $3`,
      [reservation.quantity, reservation.product_id, reservation.warehouse_id],
    );

    await client.query(
      `UPDATE reservations SET status = 'confirmed', updated_at = NOW() WHERE id = $1`,
      [id],
    );

    await client.query("COMMIT");

    const updated = await getReservationWithDetails(id);
    res.json(formatReservation(updated!));
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    req.log.error({ err }, "Failed to confirm reservation");
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
});

// POST /reservations/:id/release
router.post("/reservations/:id/release", async (req, res) => {
  const parsed = ReleaseReservationParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid reservation ID" });
    return;
  }

  const { id } = parsed.data;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const result = await client.query<{
      id: string;
      product_id: string;
      warehouse_id: string;
      quantity: number;
      status: string;
    }>(
      `SELECT id, product_id, warehouse_id, quantity, status
       FROM reservations WHERE id = $1
       FOR UPDATE`,
      [id],
    );

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Reservation not found" });
      return;
    }

    const reservation = result.rows[0]!;

    if (reservation.status !== "pending") {
      await client.query("ROLLBACK");
      res.status(409).json({ error: `Reservation is already ${reservation.status}` });
      return;
    }

    // Release: restore the reserved units
    await client.query(
      `UPDATE stock_levels
       SET reserved_units = GREATEST(0, reserved_units - $1), updated_at = NOW()
       WHERE product_id = $2 AND warehouse_id = $3`,
      [reservation.quantity, reservation.product_id, reservation.warehouse_id],
    );

    await client.query(
      `UPDATE reservations SET status = 'released', updated_at = NOW() WHERE id = $1`,
      [id],
    );

    await client.query("COMMIT");

    const updated = await getReservationWithDetails(id);
    res.json(formatReservation(updated!));
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    req.log.error({ err }, "Failed to release reservation");
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
});

// Background expiry worker — runs every 60 seconds
export function startExpiryWorker() {
  async function runExpiry() {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Find pending reservations that have expired
      const expired = await client.query<{
        id: string;
        product_id: string;
        warehouse_id: string;
        quantity: number;
      }>(
        `SELECT id, product_id, warehouse_id, quantity
         FROM reservations
         WHERE status = 'pending' AND expires_at < NOW()
         FOR UPDATE SKIP LOCKED`,
      );

      for (const r of expired.rows) {
        await client.query(
          `UPDATE stock_levels
           SET reserved_units = GREATEST(0, reserved_units - $1), updated_at = NOW()
           WHERE product_id = $2 AND warehouse_id = $3`,
          [r.quantity, r.product_id, r.warehouse_id],
        );
        await client.query(
          `UPDATE reservations SET status = 'released', updated_at = NOW() WHERE id = $1`,
          [r.id],
        );
      }

      await client.query("COMMIT");

      if (expired.rows.length > 0) {
        console.log(`[expiry-worker] Released ${expired.rows.length} expired reservations`);
      }
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("[expiry-worker] Error during expiry sweep:", err);
    } finally {
      client.release();
    }
  }

  // Run immediately on startup, then every 60 seconds
  runExpiry();
  setInterval(runExpiry, 60_000);
}

export default router;
