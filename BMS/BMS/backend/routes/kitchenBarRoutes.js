import { Router } from 'express'
import { query } from '../config/database.js'
import { logAudit, getClientIp } from '../utils/audit.js'
import authMiddleware from '../middleware/authMiddleware.js'

const router = Router()

/**
 * GET /api/kitchen/orders
 * Food orders routed to the kitchen (station = 'kitchen' or 'both').
 * Includes all sources (waiter + qr) so food is always sent to the kitchen.
 */
router.get('/orders', authMiddleware, async (req, res) => {
  try {
    const currentBusinessId = req.user.businessId
    const { rows } = await query(
      `SELECT o.id, o.order_number, o.table_number, o.status, o.source, o.station, o.created_at, o.user_id,
              (
                SELECT COALESCE(json_agg(json_build_object(
                  'productId', p.id,
                  'name', p.name,
                  'quantity', oi.quantity,
                  'price', oi.unit_price,
                  'lineTotal', oi.line_total,
                  'imageUrl', p.image_url
                )), '[]')
                FROM order_items oi
                JOIN products p ON p.id = oi.product_id
                WHERE oi.order_id = o.id
              ) AS items
       FROM orders o
       WHERE LOWER(o.station) IN ('kitchen', 'both')
         AND o.status IN ('Open', 'Preparing', 'Ready')
         AND o.business_id = $1
       ORDER BY 
         CASE o.status 
           WHEN 'Open' THEN 1
           WHEN 'Preparing' THEN 2 
           WHEN 'Ready' THEN 3 
         END,
         o.created_at ASC`,
      [currentBusinessId]
    )

     res.json(rows.map(mapKitchenBarOrder))
   } catch (error) {
     res.status(500).json({ error: error.message })
   }
 })

/**
 * GET /api/bar/orders
 * Drink orders routed to the bar (station = 'bar' or 'both').
 * Includes all sources (waiter + qr) so drinks are always sent to the bar.
 */
router.get('/bar-orders', authMiddleware, async (req, res) => {
  try {
    const currentBusinessId = req.user.businessId
    const { rows } = await query(
      `SELECT o.id, o.order_number, o.table_number, o.status, o.source, o.station, o.created_at, o.user_id,
              (
                SELECT COALESCE(json_agg(json_build_object(
                  'productId', p.id,
                  'name', p.name,
                  'quantity', oi.quantity,
                  'price', oi.unit_price,
                  'lineTotal', oi.line_total,
                  'imageUrl', p.image_url
                )), '[]')
                FROM order_items oi
                JOIN products p ON p.id = oi.product_id
                WHERE oi.order_id = o.id
              ) AS items
       FROM orders o
       WHERE LOWER(o.station) IN ('bar', 'both')
         AND o.status IN ('Open', 'Preparing', 'Ready')
         AND o.business_id = $1
       ORDER BY
         CASE o.status
           WHEN 'Open' THEN 1
           WHEN 'Preparing' THEN 2
           WHEN 'Ready' THEN 3
         END,
         o.created_at ASC`,
      [currentBusinessId]
    )

    res.json(rows.map(mapKitchenBarOrder))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * PATCH /api/kitchen/orders/:id/start
 * Kitchen/Bar starts preparing an order
 */
router.patch('/orders/:id/start', authMiddleware, async (req, res) => {
  const { id } = req.params
  try {
    await query(
      `UPDATE orders SET status = 'Preparing' WHERE id = $1 AND status = 'Open'`,
      [id]
    )

    await query(
      `INSERT INTO order_status_history (order_id, status, changed_by, note)
       VALUES ($1, 'Preparing', 'kitchen_bar', 'Started preparing')`,
      [id]
    )

await logAudit({
      userId: req.user?.id,
      actorName: req.user?.full_name || req.user?.email || 'Kitchen/Bar',
      action: `Started preparing order ${id}`,
      targetModule: 'Orders',
      ipAddress: getClientIp(req),
      businessId: req.user?.businessId,
    })

    res.json({ id, status: 'Preparing' })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * PATCH /api/kitchen/orders/:id/ready
 * Kitchen/Bar marks order as ready for serving
 */
router.patch('/orders/:id/ready', authMiddleware, async (req, res) => {
  const { id } = req.params
  try {
    await query(
      `UPDATE orders SET status = 'Ready' WHERE id = $1 AND status = 'Preparing'`,
      [id]
    )

    await query(
      `INSERT INTO order_status_history (order_id, status, changed_by, note)
       VALUES ($1, 'Ready', 'kitchen_bar', 'Order ready for serving')`,
      [id]
    )

await logAudit({
      userId: req.user?.id,
      actorName: req.user?.full_name || req.user?.email || 'Kitchen/Bar',
      action: `Marked order ${id} as ready`,
      targetModule: 'Orders',
      ipAddress: getClientIp(req),
      businessId: req.user?.businessId,
    })

    res.json({ id, status: 'Ready' })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * GET /api/kitchen/completed
 * Get completed orders (history)
 */
router.get('/completed', authMiddleware, async (req, res) => {
  try {
    const currentBusinessId = req.user.businessId
    const { rows } = await query(
      `SELECT o.id, o.order_number, o.table_number, o.status, o.total_amount, o.created_at, o.completed_at,
              (
                SELECT COALESCE(json_agg(json_build_object(
                  'name', p.name,
                  'quantity', oi.quantity
                )), '[]')
                FROM order_items oi
                JOIN products p ON p.id = oi.product_id
                WHERE oi.order_id = o.id
              ) AS items
       FROM orders o
       WHERE o.source = 'qr' AND o.status IN ('Served', 'Paid') AND o.business_id = $1
       ORDER BY o.completed_at DESC
       LIMIT 50`,
      [currentBusinessId]
    )

    res.json(rows.map(mapKitchenBarOrder))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

function mapKitchenBarOrder(o) {
  return {
    id: o.id,
    orderNumber: o.order_number,
    tableNumber: o.table_number,
    status: o.status,
    source: o.source,
    station: o.station,
    waiterId: o.user_id || null,
    total: Number(o.total_amount || 0),
    items: (o.items || []).map((item) => ({
      productId: item.productId,
      name: item.name,
      quantity: Number(item.quantity),
      price: Number(item.price || 0),
      lineTotal: Number(item.lineTotal || item.price * item.quantity || 0),
      imageUrl: item.imageUrl || '',
    })),
    createdAt: new Date(o.created_at).toLocaleString(),
    completedAt: o.completed_at ? new Date(o.completed_at).toLocaleString() : null,
  }
}

export default router
