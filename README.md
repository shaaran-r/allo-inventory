# Allo Inventory — Take-Home Exercise

Live URL: https://allo-engineering--newsharanraj.replit.app/

---

## What This Is

An inventory reservation system for multi-warehouse retail. The core problem: payment flows (3DS, UPI, wallet redirects) can take several minutes. During that window, the same unit must not be sold to two customers simultaneously. This app solves that with a timed reservation: units are held for 10 minutes at checkout, then released automatically if payment doesn't complete.

---

## Running Locally

### Prerequisites

- Node.js 18+
- A hosted Postgres database (Neon or Supabase free tier)
- (Optional) Upstash Redis, only needed if idempotency is enabled

### Environment Variables

Create a `.env` file at the project root:

```env
DATABASE_URL="postgresql://..."        # Neon / Supabase connection string
DIRECT_URL="postgresql://..."          # For Prisma migrations (non-pooled URL on Neon)
CRON_SECRET="any-random-string"        # Protects the expiry cron endpoint
```

### Setup

```bash
npm install

# Run migrations
npx prisma migrate deploy

# Seed the database with warehouses, products, and stock
npx prisma db seed

# Start the dev server
npm run dev
```

App runs at `http://localhost:3000`.

---

## Data Model

```
Product        { id, name, sku, description, imageUrl }
Warehouse      { id, name, location }
Stock          { productId, warehouseId, totalUnits, reservedUnits }
Reservation    { id, productId, warehouseId, qty, status, expiresAt, idempotencyKey? }
```

`availableUnits` is always derived as `totalUnits - reservedUnits` — it is never stored directly, which means it can never drift out of sync.

---

## API

| Method | Path | Behaviour |
|--------|------|-----------|
| GET | `/api/products` | List products with available stock per warehouse |
| GET | `/api/warehouses` | List all warehouses |
| POST | `/api/reservations` | Reserve units. Returns 409 if insufficient stock |
| POST | `/api/reservations/:id/confirm` | Confirm reservation (payment succeeded). Returns 410 if expired |
| POST | `/api/reservations/:id/release` | Release reservation early (cancelled or failed) |
| GET | `/api/cron/expire` | Internal — releases all expired pending reservations |

---

## How Concurrency Safety Works

This is the core of the exercise. The reservation endpoint uses a **single atomic SQL UPDATE** rather than a read-then-write pattern:

```sql
UPDATE "Stock"
SET reserved_units = reserved_units + $qty
WHERE product_id = $productId
  AND warehouse_id = $warehouseId
  AND (total_units - reserved_units) >= $qty
```

If two requests arrive simultaneously for the last unit, Postgres serialises them at the row level. Exactly one UPDATE will match the `>= qty` condition and return `rowsAffected = 1`. The other will match 0 rows. The handler treats 0 rows updated as a 409 — no stock available.

This means correctness is guaranteed by the database engine, not by application-level locking or Redis. There is no TOCTOU (time-of-check/time-of-use) gap because the check and the write are the same statement.

---

## How Expiry Works in Production

Reservations carry an `expiresAt` timestamp set to 10 minutes from creation.

### Cron job (primary mechanism)

A Vercel Cron job fires every minute and hits `/api/cron/expire`. That handler runs the following in a single transaction:

```sql
-- 1. Give stock back
UPDATE "Stock" s
SET reserved_units = reserved_units - r.qty
FROM "Reservation" r
WHERE r.status = 'pending'
  AND r.expires_at < NOW()
  AND r.product_id = s.product_id
  AND r.warehouse_id = s.warehouse_id;

-- 2. Mark reservations released
UPDATE "Reservation"
SET status = 'released'
WHERE status = 'pending'
  AND expires_at < NOW();
```

Both updates are wrapped in a transaction so stock and reservation status never diverge.

### Lazy cleanup (belt and suspenders)

When `/api/reservations/:id` is read (e.g. by the countdown page polling for status), the handler also checks whether the reservation is expired and releases it inline if the cron hasn't run yet. This keeps the UI accurate even in the worst case (cron up to 1 minute late).

### Trade-off

Vercel Cron fires at most once per minute, so a reservation can remain "held" for up to 1 minute past its `expiresAt`. For a 10-minute window this is acceptable. A sub-minute SLA would require a dedicated background worker (e.g. BullMQ on a long-running server) or a Postgres `pg_cron` extension.

---

## Idempotency (Bonus)

The `POST /api/reservations` and `POST /api/reservations/:id/confirm` endpoints support an optional `Idempotency-Key` header.

On first request: the key is stored alongside the reservation in the `idempotencyKey` column. On retry with the same key: the handler finds the existing reservation by key and returns it immediately, skipping the stock decrement entirely. This means a client can safely retry on network timeout without double-booking.

Keys are scoped to the reservation table — a key used for a reservation cannot accidentally match a confirm. There is no TTL on keys in this implementation (see trade-offs below).

---

## Trade-offs and What I'd Do Differently

**No Redis**
Postgres atomic updates are sufficient for concurrency correctness at this scale. Redis would add value for a rate-limiting layer or a distributed idempotency cache shared across many app servers with sub-millisecond reads — neither is necessary here.

**Cron granularity**
As noted above, Vercel Cron is 1-minute resolution. In production I'd look at Postgres `pg_cron` (runs inside the DB, no network hop) or a persistent worker with a priority queue (BullMQ / Inngest) for precise expiry.

**Idempotency key TTL**
Keys are kept forever in this implementation. Production would prune keys older than 24 hours to keep the table small and prevent reuse across sessions.

**No authentication**
Reservations are not tied to a user session. In production, the reservation would be linked to a customer ID and the confirm/release endpoints would verify ownership. Without this, any client can release any reservation by ID.

**Polling vs WebSockets**
The countdown page polls the server every 5 seconds to check reservation status. For a production system with many concurrent checkouts, server-sent events or a WebSocket connection would reduce load and improve perceived responsiveness.

**Error messages**
409 (out of stock) and 410 (reservation expired) errors are surfaced to the user in the UI. Other API errors fall back to a generic message. In production I'd add structured error codes so the frontend can give more specific guidance.

---

## Seed Data

The seed script creates:

- 3 warehouses (Delhi, Mumbai, Bangalore)
- 6 products across categories (electronics, apparel)
- Stock entries for each product/warehouse combination with realistic unit counts

Run `npx prisma db seed` to reset and re-seed at any time.
