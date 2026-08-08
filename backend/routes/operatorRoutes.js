import { Router } from 'express'
import { query } from '../config/database.js'
import { generateQRCodeData } from '../services/qrService.js'
import { logAudit, getClientIp } from '../utils/audit.js'
import authMiddleware from '../middleware/authMiddleware.js'

const router = Router()

/**
 * GET /api/operator/orders
* Get all QR-source orders for the operator dashboard
  */
router.get('/orders', authMiddleware, async (req, res) => {
  try {
    const currentBusinessId = req.user.businessId
    const { rows } = await query(
      `SELECT o.id, o.order_number, o.table_number, o.order_type, o.status, o.source,
              o.total_amount, o.subtotal, o.tax_amount, o.created_at, o.station, o.user_id,
              u.full_name AS waiter_name,
              b.name AS business_name,
              b.contact_phone AS business_phone,
              b.contact_email AS business_email,
              b.address AS business_address,
              b.city AS business_city,
              b.country AS business_country,
              b.description AS business_description,
              b.registration_code AS business_registration_code,
              (
                SELECT COALESCE(json_agg(json_build_object(
                  'productId', oi.product_id,
                  'name', p.name,
                  'quantity', oi.quantity,
                  'price', oi.unit_price,
                  'lineTotal', oi.line_total,
                  'imageUrl', p.image_url,
                  'category', p.category
                )), '[]')
                FROM order_items oi
                JOIN products p ON p.id = oi.product_id
                WHERE oi.order_id = o.id
              ) AS items
       FROM orders o
       LEFT JOIN users u ON u.id = o.user_id
       LEFT JOIN businesses b ON b.id = o.business_id
       WHERE o.source IN ('qr', 'waiter') AND o.business_id = $1
       ORDER BY o.created_at DESC`,
      [currentBusinessId]
    )

    res.json(rows.map((o) => ({ ...mapOperatorOrder(o), source: o.source })))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * GET /api/operator/orders/active
* Get all active (Open/Preparing/Paid) QR orders for the operator
  */
router.get('/orders/active', authMiddleware, async (req, res) => {
  try {
    const currentBusinessId = req.user.businessId
    const { rows } = await query(
      `SELECT o.id, o.order_number, o.table_number, o.status, 
              o.total_amount, o.created_at, o.station, o.user_id,
              u.full_name AS waiter_name,
              (
                SELECT COALESCE(json_agg(json_build_object(
                  'productId', oi.product_id,
                  'name', p.name,
                  'quantity', oi.quantity,
                  'price', oi.unit_price
                )), '[]')
                FROM order_items oi
                JOIN products p ON p.id = oi.product_id
                WHERE oi.order_id = o.id
              ) AS items
       FROM orders o
       LEFT JOIN users u ON u.id = o.user_id
       WHERE o.source IN ('qr', 'waiter') AND o.status IN ('Open', 'Preparing', 'Paid') AND o.business_id = $1
       ORDER BY o.created_at ASC`,
      [currentBusinessId]
    )

    res.json(rows.map(mapOperatorOrder))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * PATCH /api/operator/orders/:id/route
 * Operator routes order to kitchen or bar
 * Body: { destination: 'kitchen'|'bar' }
 */
router.patch('/orders/:id/route', authMiddleware, async (req, res) => {
  const { destination } = req.body
  const { id } = req.params
  const currentBusinessId = req.user.businessId

  if (!destination || !['kitchen', 'bar', 'both'].includes(destination)) {
    return res.status(400).json({ error: 'Destination must be "kitchen", "bar", or "both"' })
  }

   try {
    const before = await query('SELECT id, status, station, source FROM orders WHERE id = $1', [id])
    console.log('[ROUTE] order before:', before.rows[0])

    const result = await query(
      `UPDATE orders SET station = $2 WHERE id = $1 AND source IN ('qr', 'waiter') AND business_id = $3 RETURNING id`,
      [id, destination, currentBusinessId]
    )
    console.log('[ROUTE] update result rows:', result.rows.length, 'destination:', destination)

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Order not found in your business' })
    }

    const currentStatusRow = await query('SELECT status FROM orders WHERE id = $1', [id])
    await query(
      `INSERT INTO order_status_history (order_id, status, changed_by, note)
       VALUES ($1, $2, 'operator', 'Routed to ' || $3 || ' (station updated)')`,
       [id, currentStatusRow.rows[0].status, destination]
    )

await logAudit({
       userId: req.user?.id,
       actorName: req.user?.full_name || req.user?.email || 'Operator',
       action: `Routed order ${id} to ${destination}`,
       targetModule: 'Orders',
       ipAddress: getClientIp(req),
       businessId: req.user?.businessId,
     })

    const updated = await query('SELECT status, station FROM orders WHERE id = $1', [id])
    console.log('[ROUTE] order after:', updated.rows[0])
    res.json({ id, status: updated.rows[0]?.status, destination, station: updated.rows[0]?.station })
  } catch (error) {
    console.error('[ROUTE] error:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * PATCH /api/operator/orders/:id/status
 * Update order status (Ready, Served, Cancelled)
 * Body: { status: 'Ready'|'Served'|'Cancelled' }
 */
router.patch('/orders/:id/status', authMiddleware, async (req, res) => {
  const { status } = req.body
  const { id } = req.params
  const currentBusinessId = req.user.businessId

  const validStatuses = ['Ready', 'Served', 'Paid', 'Cancelled']
  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}` })
  }

  try {
    const result = await query('UPDATE orders SET status = $1 WHERE id = $2 AND business_id = $3 RETURNING id', [status, id, currentBusinessId])
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Order not found in your business' })
    }

    await query(
      `INSERT INTO order_status_history (order_id, status, changed_by, note)
       VALUES ($1, $2, 'staff', 'Status updated to ' || $2)`,
      [id, status]
    )

await logAudit({
       userId: req.user?.id,
       actorName: req.user?.full_name || req.user?.email || 'Staff',
       action: `Updated order ${id} status to ${status}`,
       targetModule: 'Orders',
       ipAddress: getClientIp(req),
       businessId: req.user?.businessId,
     })

    res.json({ id, status })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

/**
  * GET /api/operator/orders/ready
  * Get all Ready orders for the operator to print receipts
  */
router.get('/orders/ready', authMiddleware, async (req, res) => {
  try {
    const currentBusinessId = req.user.businessId
    const { rows } = await query(
      `SELECT o.id, o.order_number, o.table_number, o.order_type, o.status, o.source,
              o.total_amount, o.subtotal, o.tax_amount, o.created_at, o.station, o.user_id,
              u.full_name AS waiter_name,
              (
                SELECT COALESCE(json_agg(json_build_object(
                  'productId', oi.product_id,
                  'name', p.name,
                  'quantity', oi.quantity,
                  'price', oi.unit_price,
                  'lineTotal', oi.line_total,
                  'imageUrl', p.image_url,
                  'category', p.category
                )), '[]')
                FROM order_items oi
                JOIN products p ON p.id = oi.product_id
                WHERE oi.order_id = o.id
              ) AS items
       FROM orders o
       LEFT JOIN users u ON u.id = o.user_id
       WHERE o.status = 'Ready' AND o.source IN ('qr', 'waiter') AND o.business_id = $1
       ORDER BY o.created_at ASC`,
      [currentBusinessId]
    )

    res.json(rows.map((o) => ({ ...mapOperatorOrder(o), source: o.source, waiterId: o.user_id })))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

/**
  * POST /api/operator/orders/:id/mark-paid
  * Operator marks an order as paid
  */
router.post('/orders/:id/mark-paid', authMiddleware, async (req, res) => {
  const { id } = req.params
  const currentBusinessId = req.user.businessId

  try {
    const result = await query(
      `UPDATE orders SET status = 'Paid' WHERE id = $1 AND source IN ('qr', 'waiter') AND business_id = $2 RETURNING id, source, user_id, table_number, order_number`,
      [id, currentBusinessId]
    )
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Order not found in your business' })
    }

    const order = result.rows[0]

    await query(
      `INSERT INTO order_status_history (order_id, status, changed_by, note)
       VALUES ($1, 'Paid', 'operator', 'Marked as paid by operator')`,
      [id]
    )

await logAudit({
       userId: req.user?.id,
       actorName: req.user?.full_name || req.user?.email || 'Operator',
       action: `Marked order ${id} as paid`,
       targetModule: 'Orders',
       ipAddress: getClientIp(req),
       businessId: req.user?.businessId,
     })

    res.json({ id, status: 'Paid', source: order.source, waiterId: order.user_id })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})
router.get('/qr-codes', authMiddleware, async (req, res) => {
  try {
    const businessId = req.user?.businessId
    const { rows: branches } = await query(
      `SELECT id, name FROM branches WHERE is_active = true AND business_id = $1`,
      [businessId]
    )

    const qrCodes = []
    for (const branch of branches) {
      for (let table = 1; table <= 10; table++) {
        qrCodes.push({
          tableNumber: table,
          branchName: branch.name,
          qrData: generateQRCodeData(table, branch.name, businessId),
          url: `/menu?table=${table}&businessId=${businessId}`,
        })
      }
    }

    res.json(qrCodes)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * GET /api/operator/routed-report
 * Report of every order the operator routed to the kitchen or bar.
 * Returns the routing event (time sent, destination) joined with order and
 * item details for each item forwarded.
 */
router.get('/routed-report', authMiddleware, async (req, res) => {
  try {
    const currentBusinessId = req.user.businessId
    const { rows } = await query(
      `SELECT h.id AS event_id, h.order_id, h.note, h.created_at AS routed_at,
              o.order_number, o.total_amount, o.station,
              oi.quantity AS item_number, oi.unit_price, oi.line_total,
              p.name AS item_name, p.category AS item_category
       FROM order_status_history h
       JOIN orders o ON o.id = h.order_id
       JOIN order_items oi ON oi.order_id = o.id
       JOIN products p ON p.id = oi.product_id
       WHERE h.changed_by = 'operator' AND h.note LIKE 'Routed to %' AND o.business_id = $1
       ORDER BY h.created_at DESC`,
      [currentBusinessId]
    )

    const events = rows.map((r) => ({
      eventId: r.event_id,
      orderId: r.order_id,
      orderNumber: r.order_number,
      destination: r.note.replace('Routed to ', '').replace(' (station updated)', ''),
      station: r.station,
      amount: Number(r.total_amount),
      itemName: r.item_name,
      itemCategory: r.item_category,
      itemNumber: Number(r.item_number),
      unitPrice: Number(r.unit_price),
      lineTotal: Number(r.line_total),
      timeSent: new Date(r.routed_at).toLocaleString(),
    }))

    const totalAmount = events.reduce((s, e) => s + Number(e.lineTotal || 0), 0)

    res.json({ count: events.length, totalAmount: Number(totalAmount.toFixed(2)), events })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.get('/dashboard', authMiddleware, async (req, res) => {
  try {
    const currentBusinessId = req.user.businessId
    const counts = await query(
      `SELECT UPPER(LEFT(TRIM(status), 1)) || LOWER(SUBSTRING(TRIM(status) FROM 2)) AS status,
              COALESCE(source, 'other') AS source,
              COUNT(*) AS count
       FROM orders
       WHERE business_id = $1
       GROUP BY UPPER(LEFT(TRIM(status), 1)) || LOWER(SUBSTRING(TRIM(status) FROM 2)), COALESCE(source, 'other')`,
      [currentBusinessId]
    )
    const todaySales = await query(
      `SELECT COALESCE(SUM(total_amount), 0) AS total FROM orders WHERE created_at::date = CURRENT_DATE AND status IN ('Paid', 'Served') AND business_id = $1`,
      [currentBusinessId]
    )
    const todayRefunds = await query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM refunds WHERE status = 'approved' AND created_at::date = CURRENT_DATE AND business_id = $1`,
      [currentBusinessId]
    )
    const totalOrders = await query(
      `SELECT COUNT(*) AS count FROM orders WHERE business_id = $1`,
      [currentBusinessId]
    )
    const paidOrders = await query(
      `SELECT COALESCE(SUM(total_amount), 0) AS total, COUNT(*) AS count FROM orders WHERE status = 'Paid' AND created_at::date = CURRENT_DATE AND business_id = $1`,
      [currentBusinessId]
    )
    const qrSales = await query(
      `SELECT COALESCE(SUM(total_amount), 0) AS total FROM orders WHERE source = 'qr' AND status IN ('Paid', 'Served') AND business_id = $1`,
      [currentBusinessId]
    )
    const waiterSales = await query(
      `SELECT COALESCE(SUM(total_amount), 0) AS total FROM orders WHERE source = 'waiter' AND status IN ('Paid', 'Served') AND business_id = $1`,
      [currentBusinessId]
    )
    const recent = await query(
      `SELECT o.id, o.order_number, o.table_number, o.status, o.total_amount, o.created_at, o.station, o.source,
              o.user_id,
              u.full_name AS waiter_name,
        (
          SELECT COALESCE(json_agg(json_build_object(
            'productId', oi.product_id, 'name', p.name, 'quantity', oi.quantity, 'price', oi.unit_price, 'lineTotal', oi.line_total, 'imageUrl', p.image_url, 'category', p.category
          )), '[]')
          FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = o.id
        ) AS items
       FROM orders o
       LEFT JOIN users u ON u.id = o.user_id
       WHERE o.business_id = $1
       ORDER BY o.created_at DESC LIMIT 20`,
      [currentBusinessId]
    )
    const { rows: business } = await query(
      `SELECT name, currency_code, address, city, country, contact_phone, contact_email, registration_code, tax_id, description
       FROM businesses WHERE id = $1`,
      [currentBusinessId]
    )

    const stats = { newOrders: 0, preparing: 0, ready: 0 }
    const sourceBreakdown = { qr: 0, waiter: 0, other: 0 }
    const statusBreakdown = { Open: 0, Preparing: 0, Ready: 0, Served: 0, Paid: 0, Cancelled: 0 }
    for (const row of counts.rows) {
      if (row.status === 'Open') stats.newOrders += Number(row.count)
      else if (row.status === 'Preparing') stats.preparing += Number(row.count)
      else if (row.status === 'Ready') stats.ready += Number(row.count)
      const source = row.source === 'qr' || row.source === 'waiter' ? row.source : 'other'
      sourceBreakdown[source] += Number(row.count)
      statusBreakdown[row.status] = (Number(statusBreakdown[row.status]) || 0) + Number(row.count)
    }

    const activeOrders = stats.newOrders + stats.preparing + stats.ready

    const totalTodayRefunds = Number(todayRefunds.rows[0]?.total || 0)
    const netTodaySales = (Number(todaySales.rows[0]?.total || 0)) - totalTodayRefunds
    const netPaidOrdersTotal = (Number(paidOrders.rows[0]?.total || 0)) - totalTodayRefunds

    res.json({
      stats,
      activeOrders,
      todaySales: netTodaySales,
      totalOrders: Number(totalOrders.rows[0]?.count || 0),
      paidOrdersCount: Number(paidOrders.rows[0]?.count || 0),
      paidOrdersTotal: netPaidOrdersTotal,
      qrSales: Number(qrSales.rows[0]?.total || 0),
      waiterSales: Number(waiterSales.rows[0]?.total || 0),
      sourceBreakdown,
      statusBreakdown,
      businessName: business.length ? business[0].name : 'BarFlow',
      currencyCode: business.length ? business[0].currency_code : 'RWF',
      businessAddress: business.length ? business[0].address : '',
      businessCity: business.length ? business[0].city : '',
      businessCountry: business.length ? business[0].country : 'Rwanda',
      businessPhone: business.length ? business[0].contact_phone : '',
      businessEmail: business.length ? business[0].contact_email : '',
      businessRegistrationCode: business.length ? business[0].registration_code : '',
      businessTaxId: business.length ? business[0].tax_id : '',
      businessDescription: business.length ? business[0].description || '' : '',
      orders: recent.rows.map((o) => ({ ...mapOperatorOrder(o), source: o.source })),
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

function mapOperatorOrder(o) {
  return {
    id: o.id,
    orderNumber: o.order_number,
    tableNumber: o.table_number,
    orderType: o.order_type,
    status: o.status,
    total: Number(o.total_amount),
    subtotal: Number(o.subtotal || 0),
    tax: Number(o.tax_amount || 0),
    station: o.station || null,
    waiterId: o.user_id || null,
    businessName: o.business_name || '',
    businessPhone: o.business_phone || '',
    businessEmail: o.business_email || '',
    businessAddress: o.business_address || '',
    businessCity: o.business_city || '',
    businessCountry: o.business_country || '',
    businessDescription: o.business_description || '',
    businessRegistrationCode: o.business_registration_code || '',
    items: (o.items || []).map((item) => ({
      productId: item.productId,
      name: item.name,
      quantity: Number(item.quantity),
      price: Number(item.price),
      lineTotal: Number(item.lineTotal || item.price * item.quantity),
      imageUrl: item.imageUrl || '',
      category: item.category || '',
    })),
    createdAt: new Date(o.created_at).toLocaleString(),
  }
}

export default router
