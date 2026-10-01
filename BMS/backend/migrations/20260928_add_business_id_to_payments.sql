ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id) ON DELETE CASCADE;

UPDATE payments p
SET business_id = o.business_id,
    branch_id = COALESCE(p.branch_id, o.branch_id)
FROM orders o
WHERE p.order_id = o.id
  AND (p.business_id IS NULL OR p.branch_id IS NULL);

CREATE INDEX IF NOT EXISTS payments_business_branch_paid_at_idx
  ON payments (business_id, branch_id, paid_at DESC);