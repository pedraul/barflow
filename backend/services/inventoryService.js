import { query } from '../config/database.js'

export async function adjustStock(branchId, productId, change, note = 'Manual adjustment') {
  await query(
    `INSERT INTO branch_stock (branch_id, product_id, quantity, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (branch_id, product_id) DO UPDATE SET quantity = GREATEST(0, branch_stock.quantity + $3), updated_at = NOW()`,
    [branchId, productId, change]
  )
  const { rows } = await query(
    `INSERT INTO stock_movements (branch_id, product_id, movement_type, quantity_change, note)
     VALUES ($1, $2, 'adjustment', $3, $4) RETURNING id`,
    [branchId, productId, change, note]
  )
  return rows[0]
}

export async function listStock() {
  const { rows } = await query(
    `SELECT bs.branch_id, b.name AS branch, bs.product_id, p.name AS product, bs.quantity, bs.updated_at
     FROM branch_stock bs JOIN branches b ON b.id = bs.branch_id JOIN products p ON p.id = bs.product_id
     ORDER BY b.name, p.name`
  )
  return rows
}
