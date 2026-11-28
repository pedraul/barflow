import { Router } from 'express'
import { query } from '../config/database.js'
import { mapOrder } from './helpers.js'
import { logAudit, getClientIp } from '../utils/audit.js'
import { createOrderCore, restockOrderItems, addItemsToOrder } from '../services/orderService.js'
import authMiddleware from '../middleware/authMiddleware.js'
import { getBranchContext } from '../middleware/branchContext.js'

const router = Router()

// Shared SELECT that joins order items so the response always includes `items`
function ordersSelect(where = '', params = []) {
  return {
    text: `
      SELECT o.*, order_waiter.full_name AS waiter_name, (
        SELECT COALESCE(json_agg(json_build_object(
          'productId', oi.product_id,
          'name', p.name,
          'quantity', oi.quantity,
          'price', oi.unit_price,
          'lineTotal', oi.line_total
        )), '[]')
        FROM order_items oi JOIN products p ON p.id = oi.product_id
        WHERE oi.order_id = o.id
      ) AS items
      FROM orders o
      LEFT JOIN users order_waiter ON order_waiter.id = o.user_id
      ${where}
      ORDER BY o.created_at DESC
    `,
    params,
  }
}

// GET /api/orders?status=&source=&branchId=&from=&to=&table=
// Returns orders for the current user's business only.
router.get('/', authMiddleware, async (req, res) => {
  const { status, source, branchId, from, to, table } = req.query
  try {
    let scope
    try {
      scope = await getBranchContext(req, { requestedBranchId: branchId, allowOwnerAll: true })
    } catch (error) {
      if (String(req.user?.role || '').toLowerCase() !== 'waiter' || branchId || !req.user?.businessId) {
        throw error
      }
      const { rows: branches } = await query(
        `SELECT id FROM branches
         WHERE business_id = $1 AND COALESCE(is_active, TRUE) = TRUE
         ORDER BY (LOWER(name) = 'main branch') DESC, created_at ASC
         LIMIT 1`,
        [req.user.businessId]
      )
      if (!branches.length) throw error
      scope = { businessId: req.user.businessId, branchId: branches[0].id }
      await query(
        'UPDATE users SET branch_id = $1 WHERE id = $2 AND business_id = $3',
        [scope.branchId, req.user.id, req.user.businessId]
      )
    }
    const clauses = [`o.business_id = $${1}`]
    const params = [scope.businessId]
    let idx = 2
    if (scope.branchId) {
      clauses.push(`o.branch_id = $${idx++}`)
      params.push(scope.branchId)
    }
    if (status) {
      clauses.push(`o.status = $${idx++}`)
      params.push(status)
    }
    if (source) {
      clauses.push(`o.source = $${idx++}`)
      params.push(source)
    }
    if (branchId && !scope.branchId && String(branchId).toLowerCase() !== 'all') {
      clauses.push(`o.branch_id = $${idx++}`)
      params.push(branchId)
    }
    if (table) {
      clauses.push(`o.table_name = $${idx++}`)
      params.push(table)
    }
    if (from) {
      clauses.push(`o.created_at >= $${idx++}`)
      params.push(from)
    }
    if (to) {
      clauses.push(`o.created_at <= $${idx++}`)
      params.push(to)
    }
    const where = `WHERE ${clauses.join(' AND ')}`
    const { text, params: p } = ordersSelect(where, params)
    const { rows } = await query(text, p)
    res.json(rows.map(mapOrder))
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message })
  }
})

// GET /api/orders/tables
// Read-only list of the dining tables in the caller's branch, so waiters can
// pick the table an order is for. (Declared before /:id so it isn't shadowed.)
router.get('/tables', authMiddleware, async (req, res) => {
  try {
    const scope = await getBranchContext(req, { requestedBranchId: req.query.branchId, allowOwnerAll: false })
    const { rows } = await query(
      `SELECT id, table_number
       FROM dining_tables
       WHERE business_id = $1 AND branch_id = $2
       ORDER BY table_number`,
      [scope.businessId, scope.branchId]
    )
    res.json(rows.map((row) => ({ id: row.id, tableNumber: row.table_number })))
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message })
  }
})

// GET /api/orders/:id
// Full order detail (header + line items) for any authenticated role.
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const scope = await getBranchContext(req, { requestedBranchId: req.query.branchId, allowOwnerAll: true })
    const { rows } = await query(
      `SELECT o.*, order_waiter.full_name AS waiter_name, (
         SELECT COALESCE(json_agg(json_build_object(
           'productId', oi.product_id,
           'name', p.name,
           'quantity', oi.quantity,
           'price', oi.unit_price,
           'lineTotal', oi.line_total
         )), '[]')
         FROM order_items oi JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id = o.id
       ) AS items
       FROM orders o
       LEFT JOIN users order_waiter ON order_waiter.id = o.user_id
       WHERE o.id = $1 AND o.business_id = $2
         AND ($3::uuid IS NULL OR o.branch_id = $3)`,
      [req.params.id, scope.businessId, scope.branchId]
    )
    if (!rows.length) {
      return res.status(404).json({ error: 'Order not found' })
    }
    res.json(mapOrder(rows[0]))
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message })
  }
})

// POST /api/orders
// Generic order creation used by the Waiter flow (source defaults to 'waiter').
router.post('/', authMiddleware, async (req, res) => {
  const {
    customer,
    customerName,
    items = [],
    status = 'Open',
    source = 'waiter',
    orderType,
    paymentMethod,
    branchId: requestedBranchId,
  } = req.body

  let scope
  try {
    scope = await getBranchContext(req, { requestedBranchId, allowOwnerAll: false })
  } catch (error) {
    return res.status(error.statusCode || 403).json({ error: error.message })
  }
  const businessId = scope.businessId
  const branchId = scope.branchId

  try {
    // Quick dedupe protection: if the same waiter submits the same items
    // for the same table within a short window, return the existing order
    // to avoid duplicates from rapid clicks or retries.
    try {
      const productIds = items.map((i) => i.productId).filter(Boolean)
      if (productIds.length === items.length && items.length > 0) {
        const { rows: recent } = await query(
          `SELECT id FROM orders
           WHERE table_name = $1 AND user_id = $2 AND business_id = $3 AND branch_id = $4
             AND status IN ('Open','Preparing','Pending')
             AND created_at > NOW() - INTERVAL '10 seconds'
           ORDER BY created_at DESC LIMIT 1`,
          [customer, req.user?.id, businessId, branchId]
        )
        if (recent.length) {
          const recentOrderId = recent[0].id
          const { rows: existingItems } = await query('SELECT product_id, quantity FROM order_items WHERE order_id = $1', [recentOrderId])
          const incomingMap = new Map(items.map((it) => [Number(it.productId), Number(it.quantity)]))
          const existingMap = new Map(existingItems.map((it) => [Number(it.product_id), Number(it.quantity)]))
          let identical = true
          if (incomingMap.size !== existingMap.size) identical = false
          if (identical) {
            for (const [k, v] of incomingMap.entries()) {
              if (existingMap.get(k) !== v) { identical = false; break }
            }
          }
          if (identical) {
            const { rows: orderRows } = await query('SELECT * FROM orders WHERE id = $1', [recentOrderId])
            const existingOrder = orderRows[0]
            return res.status(200).json({ id: existingOrder.id, orderNumber: existingOrder.order_number, duplicatePrevented: true })
          }
        }
      }
    } catch (err) {
      console.error('Waiter dedupe check failed', err.message)
    }

    const created = await createOrderCore({
      businessId,
      branchId,
      tableName: customer,
      customerName: customerName || null,
      source,
      status,
      orderType,
      paymentMethod,
      items,
      req,
    })

    res.status(201).json(created)
  } catch (error) {
    const status = error.statusCode === 400 ? 400 : 500
    res.status(status).json({ error: error.message })
  }
})

router.patch('/:id', authMiddleware, async (req, res) => {
  const { status } = req.body
  try {
    const scope = await getBranchContext(req)
    const result = await query(
      'UPDATE orders SET status = $1 WHERE id = $2 AND business_id = $3 AND ($4::uuid IS NULL OR branch_id = $4) RETURNING id',
      [status, req.params.id, scope.businessId, scope.branchId]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Order not found in your branch.' })

    await logAudit({
      userId: req.user?.id,
      actorName: req.user?.full_name || req.user?.email || 'System',
      action: `Updated order ${req.params.id} status to ${status}`,
      targetModule: 'Orders',
      ipAddress: getClientIp(req),
      businessId: req.user?.businessId,
    })

    res.json({ id: req.params.id, status })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * POST /api/orders/:id/add-items
 * Add additional items to an existing order. Items are added to order_items,
 * stock is deducted, and order totals are recalculated.
 * Body: { items: [{ productId, name, quantity, price }] }
 */
router.post('/:id/add-items', authMiddleware, async (req, res) => {
  const { id } = req.params
  const { items } = req.body

  if (!items || !Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'items array with products is required' })
  }

  try {
    const scope = await getBranchContext(req)
    const result = await addItemsToOrder({
      orderId: id,
      items,
      req,
      businessId: scope.businessId,
      branchId: scope.branchId,
    })

    await logAudit({
      userId: req.user?.id,
      actorName: req.user?.full_name || req.user?.email || 'System',
      action: `Added ${items.length} item(s) to order ${id}`,
      targetModule: 'Orders',
      ipAddress: getClientIp(req),
      businessId: req.user?.businessId,
    })

    res.json(result)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * PATCH /api/orders/:id/restock
 * Controlled inventory adjustment: restock selected items from an order,
 * update order totals, and record audit trail.
 * Body: { items: [{ productId, quantityToRestock }], reason: string }
 */
router.patch('/:id/restock', authMiddleware, async (req, res) => {
  const { id } = req.params
  const { items, reason } = req.body

  if (!items || !Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'items array with modifications is required' })
  }
  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'Reason for restocking is required' })
  }

  try {
    const scope = await getBranchContext(req)
    const result = await restockOrderItems({
      orderId: id,
      items,
      reason: reason.trim(),
      req,
      businessId: scope.businessId,
      branchId: scope.branchId,
    })

    await logAudit({
      userId: req.user?.id,
      actorName: req.user?.full_name || req.user?.email || 'System',
      action: `Restocked ${items.length} item(s) from order ${id}: ${reason.trim()}`,
      targetModule: 'Orders',
      ipAddress: getClientIp(req),
      businessId: req.user?.businessId,
    })

    res.json({ id, ...result })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const scope = await getBranchContext(req)
    const result = await query(
      'DELETE FROM orders WHERE id = $1 AND business_id = $2 AND branch_id = $3 RETURNING id',
      [req.params.id, scope.businessId, scope.branchId]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Order not found in your branch.' })

    await logAudit({
      userId: req.user?.id,
      actorName: req.user?.full_name || req.user?.email || 'System',
      action: `Deleted order ${req.params.id}`,
      targetModule: 'Orders',
      ipAddress: getClientIp(req),
      businessId: req.user?.businessId,
    })

    res.json({ id: req.params.id })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * GET /api/orders/waiter/history
 * Waiter's own order history with optional date filtering
 * Query: period=today|week|month|all&from=&to=
 */
router.get('/waiter/history', authMiddleware, async (req, res) => {
  try {
    const scope = await getBranchContext(req, { requestedBranchId: req.query.branchId, allowOwnerAll: true })
    const userId = req.user.id
    const { period = 'all', from, to } = req.query

    const dateClauses = []
    const params = [userId, scope.businessId, scope.branchId]
    let idx = 4

    if (from) {
      dateClauses.push(`o.created_at >= $${idx++}`)
      params.push(from)
    }
    if (to) {
      dateClauses.push(`o.created_at < $${idx++}`)
      params.push(to)
    }
    if (!from && !to && period !== 'all') {
      const now = new Date()
      let start = new Date()
      if (period === 'today') {
        start.setHours(0, 0, 0, 0)
      } else if (period === 'week') {
        start.setDate(now.getDate() - 7)
        start.setHours(0, 0, 0, 0)
      } else if (period === 'month') {
        start.setMonth(now.getMonth() - 1)
        start.setHours(0, 0, 0, 0)
      }
      dateClauses.push(`o.created_at >= $${idx++}`)
      params.push(start.toISOString())
    }

    const dateFilter = dateClauses.length ? `AND ${dateClauses.join(' AND ')}` : ''

    const { rows } = await query(
      `SELECT o.id, o.order_number, o.table_number, o.table_name, o.status, o.total_amount, o.created_at, o.source,
              u.full_name AS waiter_name,
              (
                SELECT COALESCE(json_agg(json_build_object(
                  'productId', p.id,
                  'name', p.name,
                  'quantity', oi.quantity,
                  'price', oi.unit_price,
                  'lineTotal', oi.line_total
                )), '[]')
                FROM order_items oi
                JOIN products p ON p.id = oi.product_id
                WHERE oi.order_id = o.id
              ) AS items
       FROM orders o
       LEFT JOIN users u ON u.id = o.user_id
       WHERE o.user_id = $1 AND o.source = 'waiter' AND o.business_id = $2
         AND ($3::uuid IS NULL OR o.branch_id = $3)
         ${dateFilter}
       ORDER BY o.created_at DESC`,
      params
    )

    const orders = rows.map((o) => ({
      id: o.id,
      orderNumber: o.order_number,
      // Older orders kept the number only in table_name.
      tableNumber: o.table_number ?? (/^\d+$/.test(String(o.table_name || '').trim()) ? Number(o.table_name) : null),
      tableName: o.table_name || '',
      customer: o.table_name || '',
      waiterName: o.waiter_name || '',
      status: o.status,
      source: o.source,
      total: Number(o.total_amount) || 0,
      items: (o.items || []).map((item) => ({
        productId: item.productId,
        name: item.name,
        quantity: Number(item.quantity),
        price: Number(item.price),
        lineTotal: Number(item.lineTotal || item.price * item.quantity),
      })),
      createdAt: new Date(o.created_at).toISOString(),
    }))

    const totalRevenue = orders.reduce((s, o) => s + o.total, 0)

    const orderIds = orders.map((o) => o.id)
    let refundTotal = 0
    if (orderIds.length) {
      const { rows: refundRows } = await query(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM refunds WHERE order_id = ANY($1::uuid[]) AND status = 'approved'`,
        [orderIds]
      )
      refundTotal = Number(refundRows[0]?.total) || 0
    }
    const netRevenue = totalRevenue - refundTotal

    res.json({ orders, totalRevenue: netRevenue, totalOrders: orders.length })
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message })
  }
})

export default router
