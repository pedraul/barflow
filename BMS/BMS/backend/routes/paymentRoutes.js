import { Router } from 'express'
import { query } from '../config/database.js'
import authMiddleware from '../middleware/authMiddleware.js'
import { initiatePayment, verifyPayment } from '../services/paymentService.js'
import verifyProvider from '../middleware/verifyProvider.js'
import { logAudit, getClientIp } from '../utils/audit.js'

const router = Router()

// Order payments are recorded via the orders flow; this endpoint lists them.
router.get('/', async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT p.id, p.order_id, p.method, p.amount, p.reference, p.paid_at
       FROM payments p ORDER BY p.paid_at DESC`
    )
    res.json(rows)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { orderId, receivedBy, method, amount, reference } = req.body
    if (amount == null) {
      return res.status(400).json({ error: 'Amount is required.' })
    }

    const { rows } = await query(
      `INSERT INTO payments (order_id, received_by, method, amount, reference, paid_at)
       VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING id`,
      [orderId || null, receivedBy || null, method || 'transfer', amount, reference || null]
    )

    let businessId = req.user?.businessId || null
    if (orderId) {
      const orderLookup = await query('SELECT business_id FROM orders WHERE id = $1 LIMIT 1', [orderId])
      businessId = orderLookup.rows[0]?.business_id || businessId
    }

    await logAudit({
      userId: req.user?.id || null,
      actorName: req.user?.full_name || req.user?.email || 'System',
      action: `Recorded payment of ${Number(amount).toFixed(2)} for order ${orderId || 'N/A'}`,
      targetModule: 'Payments',
      ipAddress: getClientIp(req),
      businessId,
      metadata: { orderId, method, amount, reference },
    })

    res.status(201).json({ id: rows[0].id })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// ===== Mobile Money integration =====
// Initiate a momo payment (returns simulated USSD details or provider token)
router.post('/momo/initiate', authMiddleware, async (req, res) => {
  try {
    const { orderId, amount, method, customerPhone, customerName } = req.body
    if (!orderId || !amount || !method) return res.status(400).json({ error: 'orderId, amount and method required' })

    const result = await initiatePayment({ orderId, amount, method, customerPhone, customerName })
    res.json(result)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Check payment status
router.get('/momo/:paymentId/status', authMiddleware, async (req, res) => {
  try {
    const { paymentId } = req.params
    const { rows } = await query('SELECT id, reference, method, amount, paid_at, provider_status FROM payments WHERE id = $1', [paymentId])
    if (!rows.length) return res.status(404).json({ error: 'Payment not found' })
    res.json(rows[0])
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Provider webhook / callback (no auth, but verify signature if configured)
router.post('/momo/callback', verifyProvider, async (req, res) => {
  try {
    // Expected payload: { reference, provider_txn_id, status, raw }
    const { reference, provider_txn_id, status, raw } = req.body
    if (!reference) return res.status(400).json({ error: 'reference required' })

    // Find payment by reference and update
    const { rows } = await query('SELECT id, order_id FROM payments WHERE reference = $1', [reference])
    if (!rows.length) return res.status(404).json({ error: 'Payment reference not found' })
    const paymentId = rows[0].id

    await query(
      `UPDATE payments SET provider = $1, provider_txn_id = $2, provider_status = $3, provider_payload = $4, paid_at = CASE WHEN $3 = 'COMPLETED' OR $3 = 'SUCCESS' THEN NOW() ELSE paid_at END WHERE id = $5`,
      ['momo', provider_txn_id || null, status || null, JSON.stringify(raw || req.body), paymentId]
    )

    // If completed, mark order as paid
    if (status === 'COMPLETED' || status === 'SUCCESS' || status === 'PAID') {
      await query('UPDATE orders SET status = $1, completed_at = NOW() WHERE id = $2', ['Paid', rows[0].order_id])
      await query("INSERT INTO order_status_history (order_id, status, changed_by, note) VALUES ($1, 'Paid', 'provider', 'Payment confirmed by provider')", [rows[0].order_id])

      const orderLookup = await query('SELECT business_id FROM orders WHERE id = $1 LIMIT 1', [rows[0].order_id])
      await logAudit({
        userId: null,
        actorName: 'Provider',
        action: `Payment confirmed for order ${rows[0].order_id}`,
        targetModule: 'Payments',
        ipAddress: getClientIp(req),
        businessId: orderLookup.rows[0]?.business_id || null,
        metadata: { orderId: rows[0].order_id, provider: 'momo', status, reference },
      })
    }

    res.json({ ok: true })
  } catch (error) {
    console.error('Momo callback error:', error)
    res.status(500).json({ error: error.message })
  }
})

export default router
