-- The initial branch-stock migration populated legacy quantities only for the
-- main branch. Restore branch-owned products whose zero row has not changed
-- since that migration, applying any later stock movements to the legacy base.
WITH stock_baseline AS (
  SELECT bs.branch_id,
         bs.product_id,
         GREATEST(
           0,
           COALESCE(p.quantity, 0) + COALESCE(SUM(sm.quantity_change), 0)
         ) AS repaired_quantity
  FROM branch_stock bs
  JOIN products p
    ON p.id = bs.product_id
   AND p.branch_id = bs.branch_id
  JOIN schema_migrations initial_migration
    ON initial_migration.filename = '20260930_initialize_branch_stock.sql'
  LEFT JOIN stock_movements sm
    ON sm.branch_id = bs.branch_id
   AND sm.product_id = bs.product_id
   AND sm.created_at > initial_migration.applied_at
  WHERE COALESCE(bs.quantity, 0) = 0
    AND COALESCE(p.quantity, 0) > 0
    AND bs.updated_at <= initial_migration.applied_at
  GROUP BY bs.branch_id, bs.product_id, p.quantity
)
UPDATE branch_stock bs
SET quantity = stock_baseline.repaired_quantity,
    updated_at = NOW()
FROM stock_baseline
WHERE bs.branch_id = stock_baseline.branch_id
  AND bs.product_id = stock_baseline.product_id;
