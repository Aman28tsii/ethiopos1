-- D2: prevent duplicate orders from different idempotency keys.
-- client_order_id is a client-generated UUID representing one logical order.
-- A retry of the same logical order carries the same UUID; the unique index
-- rejects the second INSERT, the backend returns HTTP 409 with the existing order.

BEGIN;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_order_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_orders_client_order_id
ON orders (client_order_id)
WHERE client_order_id IS NOT NULL;

COMMIT;