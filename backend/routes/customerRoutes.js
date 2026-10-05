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
    const order = rows[0]
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
  let resolvedCustomerPhone = customerPhone
  if (!orderId || !method) {
    return res.status(400).json({ error: 'orderId and method are required' })
  }

  try {
    // Get order details
    const orderResult = await query(
      `SELECT id, total_amount, table_number, order_number FROM orders WHERE id = $1 AND status != 'Paid'`,
      [orderId]
    )
    if (!orderResult.rows.length) {
      return res.status(404).json({ error: 'Order not found or already paid' })
    }

    const order = orderResult.rows[0]

    // If mobile money, phone is recommended but not required in demo mode
    if ((method === 'mtn_momo' || method === 'airtel_money') && !resolvedCustomerPhone) {
      resolvedCustomerPhone = `+250${Math.floor(100000000 + Math.random() * 900000000)}`
    }

    // Update customer phone on order
    if (resolvedCustomerPhone) {
      await query('UPDATE orders SET customer_phone = $1 WHERE id = $2', [resolvedCustomerPhone, orderId])
    }

    const result = await initiatePayment({
      orderId: order.id,
      amount: Number(order.total_amount),
      method,
      customerPhone: resolvedCustomerPhone || '',
      customerName: `Table ${order.table_number}`,
    })

await logAudit({
       userId: req.user?.id,
       actorName: req.user?.full_name || req.user?.email || 'Customer',
       action: `Initiated payment for order ${orderId}: ${method}`,
       targetModule: 'Payments',
       ipAddress: getClientIp(req),
       businessId: req.user?.businessId,
     })

    res.json(result)
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
 * Verify/simulate USSD payment confirmation
 * Body: { paymentId }
 */
router.post('/payment/verify', async (req, res) => {
  const { paymentId } = req.body
  if (!paymentId) {
    return res.status(400).json({ error: 'paymentId is required' })
  }

  try {
    const result = await verifyPayment(paymentId)

    if (result && result.status === 'completed') {
      const { rows: orderRows } = await query(
        `SELECT id, table_number, order_number FROM orders WHERE id = (SELECT order_id FROM receipts WHERE id = $1 LIMIT 1)`,
        [paymentId]
      )
      const order = orderRows[0]
await logAudit({
         userId: null,
         actorName: `Customer (Table ${order?.table_number || 'Unknown'})`,
         action: `Payment verified for order ${order?.order_number || paymentId}`,
         targetModule: 'Payments',
         ipAddress: getClientIp(req),
         businessId: req.user?.businessId,
       })
    }

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
