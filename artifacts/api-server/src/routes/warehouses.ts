import { Router } from "express";
import { db } from "@workspace/db";
import { warehousesTable } from "@workspace/db";

const router = Router();

router.get("/warehouses", async (req, res) => {
  try {
    const warehouses = await db.select().from(warehousesTable).orderBy(warehousesTable.name);
    res.json(
      warehouses.map((w) => ({
        id: w.id,
        name: w.name,
        location: w.location,
        createdAt: w.createdAt.toISOString(),
      })),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to list warehouses");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
