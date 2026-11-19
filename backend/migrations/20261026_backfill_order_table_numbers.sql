UPDATE orders
SET table_number = table_name::integer
WHERE table_number IS NULL
  AND table_name::text ~ '^[0-9]+$'
  AND table_name::numeric <= 2147483647;
