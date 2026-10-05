ALTER TABLE products
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS orders
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS payments
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS salary_payments
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS refunds
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS transfers
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS withdrawals
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;

WITH primary_branches AS (
  SELECT DISTINCT ON (business_id)
         b.id,
         b.business_id
  FROM branches b
  WHERE COALESCE((to_jsonb(b)->>'is_active')::boolean, TRUE) = TRUE
  ORDER BY b.business_id,
           COALESCE((to_jsonb(b)->>'is_main')::boolean, FALSE) DESC,
           (LOWER(b.name) = 'main branch') DESC,
           b.created_at ASC,
           b.id ASC
)
UPDATE products p
SET branch_id = pb.id
FROM primary_branches pb
WHERE p.business_id = pb.business_id
  AND p.branch_id IS NULL;

WITH primary_branches AS (
  SELECT DISTINCT ON (b.business_id)
         b.id,
         b.business_id
  FROM branches b
  WHERE COALESCE((to_jsonb(b)->>'is_active')::boolean, TRUE) = TRUE
  ORDER BY b.business_id,
           COALESCE((to_jsonb(b)->>'is_main')::boolean, FALSE) DESC,
           (LOWER(b.name) = 'main branch') DESC,
           b.created_at ASC,
           b.id ASC
)
UPDATE orders o
SET branch_id = pb.id
FROM primary_branches pb
WHERE o.business_id = pb.business_id
  AND o.branch_id IS NULL;

UPDATE payments p
SET branch_id = o.branch_id
FROM orders o
WHERE p.order_id = o.id AND p.branch_id IS NULL;

UPDATE refunds r
SET branch_id = o.branch_id
FROM orders o
WHERE r.order_id = o.id AND r.branch_id IS NULL;

UPDATE salary_payments s
SET branch_id = u.branch_id
FROM users u
WHERE s.user_id = u.id AND s.branch_id IS NULL;

UPDATE transfers t
SET branch_id = u.branch_id
FROM users u
WHERE t.from_user = u.id AND t.branch_id IS NULL;

UPDATE withdrawals w
SET branch_id = u.branch_id
FROM users u
WHERE w.initiated_by = u.id AND w.branch_id IS NULL;

CREATE INDEX IF NOT EXISTS products_business_branch_idx
  ON products (business_id, branch_id);

CREATE INDEX IF NOT EXISTS payments_business_branch_idx
  ON payments (business_id, branch_id);

CREATE INDEX IF NOT EXISTS salary_payments_business_branch_idx
  ON salary_payments (business_id, branch_id);

CREATE INDEX IF NOT EXISTS refunds_business_branch_idx
  ON refunds (business_id, branch_id);
