import { query } from '../config/database.js'

const mapOrder = (o) => ({
  id: o.id,
  orderNumber: o.order_number,
  customer: o.table_name || 'Walk-in',
  items: (o.items || []).map((item) => ({ name: item.name, quantity: Number(item.quantity), price: Number(item.price) })),
  total: Number(o.total_amount) || 0,
  status: o.status,
  createdAt: new Date(o.created_at).toLocaleString(),
  source: o.source || 'waiter',
})

let cachedBusinessId = null
async function getBusinessId() {
  if (cachedBusinessId) return cachedBusinessId
  const { rows } = await query('SELECT id FROM businesses LIMIT 1')
  cachedBusinessId = rows[0]?.id
  return cachedBusinessId
}

export async function listOrders(_req, res) {
  try {
    const { rows } = await query(
      `SELECT o.*, (
         SELECT COALESCE(json_agg(json_build_object('name', p.name, 'quantity', oi.quantity, 'price', oi.unit_price)), '[]')
         FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = o.id
       ) AS items FROM orders o ORDER BY o.created_at DESC`
    )
    res.json(rows.map(mapOrder))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function createOrder(req, res) {
  const { customer, items = [], total = 0, status = 'Open', source = 'waiter' } = req.body
  const businessId = req.user?.businessId
  const branchResult = await query('SELECT id FROM branches WHERE business_id = $1 LIMIT 1', [businessId])
  const branchId = branchResult.rows[0]?.id
  if (!businessId || !branchId) {
    return res.status(400).json({ error: 'Business or branch not found for your account.' })
  }
  try {
    const { rows } = await query(
      `INSERT INTO orders (business_id, branch_id, table_name, total_amount, status) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [businessId, branchId, customer, total, status]
    )
    const orderId = rows[0].id
    for (const item of items) {
      const product = await query('SELECT id FROM products WHERE business_id = $1 AND name = $2 LIMIT 1', [businessId, item.name])
      const productId = product.rows[0]?.id
      if (!productId) continue
      await query(
        `INSERT INTO order_items (order_id, product_id, quantity, unit_price, line_total) VALUES ($1, $2, $3, $4, $5)`,
        [orderId, productId, item.quantity, item.price, item.quantity * item.price]
      )
    }
    res.status(201).json({ id: orderId })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function updateOrder(req, res) {
  const { status } = req.body
  try {
    await query('UPDATE orders SET status = $1 WHERE id = $2', [status, req.params.id])
    res.json({ id: req.params.id, status })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function deleteOrder(req, res) {
  try {
    await query('DELETE FROM orders WHERE id = $1', [req.params.id])
    res.json({ id: req.params.id })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}
