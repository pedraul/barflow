ALTER TABLE products
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;

WITH primary_branches AS (
  SELECT DISTINCT ON (business_id)
         id,
         business_id
  FROM branches
  WHERE COALESCE(is_active, TRUE) = TRUE
  ORDER BY business_id,
           COALESCE(is_main, FALSE) DESC,
           (LOWER(name) = 'main branch') DESC,
           created_at ASC,
           id ASC
)
UPDATE products p
SET branch_id = pb.id
FROM primary_branches pb
WHERE p.business_id = pb.business_id
  AND p.branch_id IS NULL;

CREATE INDEX IF NOT EXISTS products_business_branch_idx
  ON products (business_id, branch_id);
