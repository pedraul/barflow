import { Router } from 'express'
import { query } from '../config/database.js'
import { initiatePayment, verifyPayment } from '../services/paymentService.js'
import { createOrderCore, addItemsToOrder } from '../services/orderService.js'
import { logAudit, getClientIp } from '../utils/audit.js'
import authMiddleware from '../middleware/authMiddleware.js'

const router = Router()

/**
 * GET /api/customer/menu?table=5&businessId=xxx
 * Returns menu items grouped by category for the QR menu
 */
router.get('/menu', async (req, res) => {
  const tableNumber = req.query.table || '1'
  const businessId = req.query.businessId || req.user?.businessId
  const branchId = req.query.branchId || null
  try {
    if (!businessId) {
      return res.json({ tableNumber, categories: [] })
    }

    const { rows: branchRows } = await query(
      `SELECT id FROM branches
       WHERE business_id = $1 AND is_active = TRUE
         AND ($2::uuid IS NULL OR id = $2::uuid)
       ORDER BY is_main DESC, created_at ASC LIMIT 1`,
      [businessId, branchId]
    )
    const resolvedBranchId = branchRows[0]?.id
    if (!resolvedBranchId) {
      return res.status(400).json({ error: 'No active branch is configured for this QR menu.' })
    }

    const { rows } = await query(
      `SELECT p.id, p.name, p.category, p.selling_price, p.image_url, p.stock_unit,
          COALESCE(bs.quantity, 0) AS quantity
       FROM products p
       LEFT JOIN branch_stock bs ON bs.product_id = p.id AND bs.branch_id = $2::uuid
       WHERE p.is_active = TRUE AND p.business_id = $1 AND p.branch_id = $2
       ORDER BY p.category, p.name`,
      [businessId, resolvedBranchId]
    )

    const grouped = new Map()
    for (const product of rows) {
      const category = String(product.category || '').trim().replace(/\s+/g, ' ') || 'Other'
      const key = category.toLocaleLowerCase()
      if (!grouped.has(key)) grouped.set(key, { name: category, items: [] })
      grouped.get(key).items.push({
        id: product.id,
        name: product.name,
        price: Number(product.selling_price),
        imageUrl: product.image_url || '',
        unit: product.stock_unit,
        quantity: Number(product.quantity) || 0,
      })
    }

    res.json({
      tableNumber,
      branchId: resolvedBranchId,
      categories: [...grouped.values()],
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * POST /api/customer/order
 * Place an order from the QR menu
 * Body: { tableNumber, items: [{productId, quantity, name, price}], sessionToken }
 */
router.post('/order', async (req, res) => {
  const { tableNumber, items = [], sessionToken, businessId, branchId: requestedBranchId } = req.body
  try {
    const resolvedBusinessId = businessId || (req.user?.businessId) || (await query('SELECT id FROM businesses LIMIT 1')).rows[0]?.id
    if (!resolvedBusinessId) {
      return res.status(400).json({ error: 'Business not found. Please provide businessId.' })
    }

    const { rows: branchRows } = await query(
      `SELECT id FROM branches
       WHERE business_id = $1 AND is_active = TRUE
         AND ($2::uuid IS NULL OR id = $2::uuid)
       ORDER BY is_main DESC, created_at ASC LIMIT 1`,
      [resolvedBusinessId, requestedBranchId || null]
    )
    const branchId = branchRows[0]?.id
    if (!branchId) {
      return res.status(400).json({ error: 'No active branch is configured for this QR order.' })
    }

    // Quick dedupe: if a very recent open order for this table exists with
    // exactly the same product quantities, return it instead of creating a
    // duplicate. This protects against double-click / rapid retry from clients.
    try {
      const productIds = items.map((i) => i.productId).filter(Boolean)
      if (productIds.length === items.length && items.length > 0) {
        const { rows: recent } = await query(
          `SELECT id FROM orders
           WHERE table_number = $1 AND business_id = $2 AND branch_id = $3
             AND status IN ('Open','Preparing','Pending')
             AND created_at > NOW() - INTERVAL '10 seconds'
           ORDER BY created_at DESC LIMIT 1`,
          [tableNumber, resolvedBusinessId, branchId]
        )
        if (recent.length) {
          const recentOrderId = recent[0].id
          const { rows: existingItems } = await query(
            'SELECT product_id, quantity FROM order_items WHERE order_id = $1',
            [recentOrderId]
          )
          // Build maps for comparison
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
      // Non-fatal: if dedupe check fails, continue to create the order as usual
      console.error('Dedupe check failed', err.message)
    }

    const created = await createOrderCore({
      businessId: resolvedBusinessId,
      branchId,
      tableName: tableNumber,
      source: 'qr',
      status: 'Open',
      items,
      req,
      skipAudit: true,
    })

await logAudit({
       userId: null,
       actorName: `Customer (Table ${tableNumber})`,
       action: `Placed order ${created.orderNumber || created.id} via QR menu`,
       targetModule: 'Orders',
       ipAddress: getClientIp(req),
       businessId: req.user?.businessId,
     })

    res.status(201).json(created)
  } catch (error) {
    const status = error.statusCode === 400 ? 400 : 500
    res.status(status).json({ error: error.message })
  }
})

/**
 * GET /api/customer/order/:orderId/status
 * Check the status of an order
 */
router.get('/order/:orderId/status', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, order_number, status, total_amount, table_number, order_type, source, created_at,
              completed_at
       FROM orders WHERE id = $1`,
      [req.params.orderId]
    )
    if (!rows.length) {
      return res.status(404).json({ error: 'Order not found' })
    }
    let order = rows[0]
    if (!['Paid', 'Cancelled'].includes(order.status)) {
      const { rows: pendingPayments } = await query(
        `SELECT id FROM payments
         WHERE order_id = $1 AND paid_at IS NULL
           AND method IN ('mtn_momo', 'airtel_money')
           AND COALESCE(provider_status, 'PENDING') NOT IN ('FAILED', 'TF', 'CANCELLED')
         ORDER BY created_at DESC LIMIT 1`,
        [order.id]
      )
      if (pendingPayments.length) {
        try {
          await verifyPayment(pendingPayments[0].id)
          const { rows: refreshed } = await query('SELECT status, source FROM orders WHERE id = $1', [order.id])
          if (refreshed.length) order = { ...order, ...refreshed[0] }
        } catch (verificationError) {
          // Keep returning the current order state; provider status can be checked again on the next poll.
          console.warn('Automatic order payment verification failed:', verificationError.message)
        }
      }
    }
    let displayStatus = order.status
    if (order.source === 'qr' && order.status === 'Paid') {
      displayStatus = 'Served'
    }
    res.json({ ...order, orderId: order.id, order_number: order.order_number, status: displayStatus })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * POST /api/customer/payment/initiate
 * Initiate payment for an order
 * Body: { orderId, method: 'mtn_momo'|'airtel_money'|'cash', customerPhone }
 */
router.post('/payment/initiate', async (req, res) => {
  const { orderId, method, customerPhone } = req.body
  if (!orderId || !method) {
    return res.status(400).json({ error: 'orderId and method are required' })
  }

  try {
    const result = await initiatePayment({
      orderId,
      method,
      customerPhone: customerPhone || '',
    })

    const { rows } = await query('SELECT business_id FROM orders WHERE id = $1', [orderId])
    await logAudit({
      userId: req.user?.id || null,
      actorName: req.user?.full_name || req.user?.email || 'Customer',
      action: `Initiated payment for order ${orderId}: ${method}`,
      targetModule: 'Payments',
      ipAddress: getClientIp(req),
      businessId: rows[0]?.business_id || null,
    })

    res.json(result)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.get('/payment/:paymentId/status', async (req, res) => {
  try {
    res.json(await verifyPayment(req.params.paymentId))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * GET /api/customer/orders/table?table=5
 * Fetch active (unpaid, uncancelled) orders for a table
 */
router.get('/orders/table', async (req, res) => {
  const tableNumber = req.query.table
  const { businessId, branchId } = req.query
  if (!tableNumber) {
    return res.status(400).json({ error: 'table is required' })
  }
  if (!businessId || !branchId) {
    return res.status(400).json({ error: 'businessId and branchId are required.' })
  }

  try {
    const { rows: branchRows } = await query(
      'SELECT id FROM branches WHERE id = $1 AND business_id = $2 AND COALESCE(is_active, TRUE) = TRUE',
      [branchId, businessId]
    )
    if (!branchRows.length) return res.status(400).json({ error: 'Invalid or inactive branch.' })
    const { rows } = await query(
      `SELECT id, order_number, status, total_amount, table_number, order_type, source, created_at
       FROM orders
       WHERE table_number = $1 AND business_id = $2 AND branch_id = $3
         AND status NOT IN ('Paid', 'Cancelled')
       ORDER BY created_at DESC`,
      [tableNumber, businessId, branchId]
    )

    const orders = []
    for (const order of rows) {
      const itemsResult = await query(
        `SELECT oi.product_id, oi.quantity, oi.unit_price, oi.line_total, p.name, p.image_url
         FROM order_items oi
         JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id = $1`,
        [order.id]
      )
      orders.push({
        orderId: order.id,
        orderNumber: order.order_number,
        status: order.status,
        total: Number(order.total_amount),
        tableNumber: order.table_number,
        orderType: order.order_type,
        source: order.source,
        createdAt: order.created_at,
        items: itemsResult.rows.map((item) => ({
          productId: item.product_id,
          name: item.name,
          quantity: Number(item.quantity),
          price: Number(item.unit_price),
          lineTotal: Number(item.line_total),
          imageUrl: item.image_url || '',
        })),
      })
    }

    res.json({ orders })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * POST /api/customer/orders/mine
 * Status of the orders this customer's device placed (ids kept on the device).
 * Body: { orderIds: [uuid], businessId }
 * Returns { active: [...], closed: [ids] } — closed = paid, cancelled or unknown,
 * so the device stops tracking them.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
router.post('/orders/mine', async (req, res) => {
  const { businessId } = req.body || {}
  const orderIds = Array.isArray(req.body?.orderIds)
    ? [...new Set(req.body.orderIds.map(String))].filter((id) => UUID_RE.test(id)).slice(0, 25)
    : []
  if (!businessId || !UUID_RE.test(String(businessId))) {
    return res.status(400).json({ error: 'businessId is required.' })
  }
  if (!orderIds.length) return res.json({ active: [], closed: [] })

  try {
    const { rows } = await query(
      `SELECT o.id, o.order_number, o.status, o.total_amount, o.table_number, o.order_type, o.source, o.created_at,
              (o.status = 'Paid' OR EXISTS (
                 SELECT 1 FROM payments p WHERE p.order_id = o.id AND p.paid_at IS NOT NULL
               )) AS is_paid,
              (
                SELECT COALESCE(json_agg(json_build_object(
                  'productId', oi.product_id,
                  'name', pr.name,
                  'quantity', oi.quantity,
                  'price', oi.unit_price,
                  'lineTotal', oi.line_total,
                  'imageUrl', pr.image_url
                )), '[]')
                FROM order_items oi JOIN products pr ON pr.id = oi.product_id
                WHERE oi.order_id = o.id
              ) AS items
       FROM orders o
       WHERE o.id = ANY($1::uuid[]) AND o.business_id = $2
       ORDER BY o.created_at DESC`,
      [orderIds, businessId]
    )

    const active = []
    const openIds = new Set()
    for (const o of rows) {
      if (o.is_paid || o.status === 'Cancelled') continue
      openIds.add(o.id)
      active.push({
        orderId: o.id,
        orderNumber: o.order_number,
        status: o.status,
        total: Number(o.total_amount),
        tableNumber: o.table_number,
        orderType: o.order_type,
        source: o.source,
        createdAt: o.created_at,
        items: (o.items || []).map((item) => ({
          productId: item.productId,
          name: item.name,
          quantity: Number(item.quantity),
          price: Number(item.price),
          lineTotal: Number(item.lineTotal),
          imageUrl: item.imageUrl || '',
        })),
      })
    }
    res.json({ active, closed: orderIds.filter((id) => !openIds.has(id)) })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * POST /api/customer/orders/:id/add-items
 * Add items to an existing customer order
 * Body: { items: [{productId, quantity, name, price}], tableNumber }
 */
router.post('/orders/:id/add-items', async (req, res) => {
  const { id } = req.params
  const { items, tableNumber } = req.body

  if (!items || !Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'items array with products is required' })
  }
  if (!tableNumber) {
    return res.status(400).json({ error: 'tableNumber is required' })
  }

  try {
    const orderResult = await query('SELECT * FROM orders WHERE id = $1', [id])
    if (!orderResult.rows.length) {
      return res.status(404).json({ error: 'Order not found' })
    }
    const order = orderResult.rows[0]

    if (String(order.table_number) !== String(tableNumber)) {
      return res.status(403).json({ error: 'Order does not belong to this table' })
    }

    const modifiableStatuses = ['Open', 'Preparing', 'Pending', 'Waiting for Preparation']
    if (!modifiableStatuses.includes(order.status)) {
      return res.status(400).json({ error: `Order cannot be modified because it is already ${order.status}` })
    }

    const result = await addItemsToOrder({
      orderId: id,
      items,
      req,
      businessId: order.business_id,
      branchId: order.branch_id,
    })

    res.json(result)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * POST /api/customer/payment/verify
 * Legacy status check; payment success is confirmed by the provider API.
 * Body: { paymentId }
 */
router.post('/payment/verify', async (req, res) => {
  const { paymentId } = req.body
  if (!paymentId) {
    return res.status(400).json({ error: 'paymentId is required' })
  }

  try {
    const result = await verifyPayment(paymentId)
    res.json(result)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * GET /api/customer/receipt/:orderId
 * Get receipt for a paid order
 */
router.get('/receipt/:orderId', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT receipt_number, payment_method, amount_paid, customer_phone, receipt_data, created_at
       FROM receipts WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [req.params.orderId]
    )
    if (!rows.length) {
      return res.status(404).json({ error: 'Receipt not found' })
    }
    res.json(rows[0])
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
