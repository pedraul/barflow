-- Add customer_name column to orders to store waiter-entered customer names

ALTER TABLE IF EXISTS orders
  ADD COLUMN IF NOT EXISTS customer_name VARCHAR(255);

-- Optionally backfill from table_name if table_name stored names in some cases
-- UPDATE orders SET customer_name = table_name WHERE customer_name IS NULL AND table_name IS NOT NULL;