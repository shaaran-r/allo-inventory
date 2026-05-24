# Allo Inventory

Inventory reservation system for multi-warehouse retail brands — lets customers hold stock for 10 minutes during checkout to prevent race conditions on limited items.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/web run dev` — run the frontend (port 22333)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- Frontend: React + Vite + Tailwind + shadcn/ui + wouter
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- **DB schema**: `lib/db/src/schema/` — `products.ts`, `warehouses.ts`, `stock-levels.ts`, `reservations.ts`
- **OpenAPI spec**: `lib/api-spec/openapi.yaml`
- **Generated hooks**: `lib/api-client-react/src/generated/api.ts`
- **Generated Zod schemas**: `lib/api-zod/src/generated/api.ts`
- **API routes**: `artifacts/api-server/src/routes/`
- **Frontend pages**: `artifacts/web/src/pages/`

## Architecture decisions

- **Row-level locking for reservations**: `POST /api/reservations` uses `SELECT ... FOR UPDATE` inside a transaction on the `stock_levels` row. This serializes concurrent requests for the same SKU — exactly one wins, the other gets a 409. No Redis needed.
- **Soft inventory model**: `stock_levels` tracks `total_units` and `reserved_units` separately. Available = total − reserved. On confirm, both are decremented (permanent sale). On release, only `reserved_units` is decremented.
- **Background expiry worker**: A `setInterval` loop in the Express server runs every 60 seconds, sweeping for expired pending reservations using `FOR UPDATE SKIP LOCKED` to be safe under multiple server replicas.
- **Lazy expiry on confirm**: If a confirm request arrives for an expired reservation, the server detects expiry in-request and releases it immediately (returns 410), without waiting for the background sweep.
- **Contract-first**: OpenAPI spec gates codegen which gates the frontend. Zod schemas are generated for server-side validation, React Query hooks for client-side data fetching.

## Product

- Product listing page: all products with available stock per warehouse, "Reserve Units" button
- Reservation checkout page: countdown timer, confirm/cancel actions, 409/410 error visibility
- Race-condition-free: two simultaneous requests for the last unit → exactly one 201, one 409

## Gotchas

- Always run `pnpm --filter @workspace/api-spec run codegen` after changing `openapi.yaml`
- Always run `pnpm --filter @workspace/db run push` after changing schema files
- The expiry worker logs to stdout (not pino logger) — check workflow stdout for `[expiry-worker]` lines
- `FOR UPDATE SKIP LOCKED` in the expiry sweep means it's safe to run multiple workers simultaneously

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
