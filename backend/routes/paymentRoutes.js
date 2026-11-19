import { Router } from 'express'
import { query } from '../config/database.js'
import authMiddleware from '../middleware/authMiddleware.js'
import { confirmCashPayment, initiatePayment, verifyPayment } from '../services/paymentService.js'
import { getBranchContext } from '../middleware/branchContext.js'
import { logAudit, getClientIp } from '../utils/audit.js'

const router = Router()

// Order payments are recorded via the orders flow; this endpoint lists them.
router.get('/', authMiddleware, async (req, res) => {
  try {
    const scope = await getBranchContext(req, { requestedBranchId: req.query.branchId, allowOwnerAll: true })
    const branchFilter = scope.branchId ? 'WHERE p.business_id = $1 AND p.branch_id = $2' : 'WHERE p.business_id = $1'
    const params = scope.branchId ? [scope.businessId, scope.branchId] : [scope.businessId]
    const { rows } = await query(
      `SELECT p.id, p.order_id, p.method, p.amount, p.reference, p.paid_at
       FROM payments p ${branchFilter} ORDER BY p.paid_at DESC`,
      params
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

    let businessId = req.user?.businessId || null
    let branchId = req.user?.branchId || null
    if (orderId) {
      const orderLookup = await query('SELECT business_id, branch_id FROM orders WHERE id = $1 LIMIT 1', [orderId])
      businessId = orderLookup.rows[0]?.business_id || businessId
      branchId = orderLookup.rows[0]?.branch_id || branchId
    }
    if (!businessId || !branchId) return res.status(400).json({ error: 'A business and branch are required for a payment.' })

    const { rows } = await query(
      `INSERT INTO payments (order_id, business_id, branch_id, received_by, method, amount, reference, paid_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) RETURNING id`,
      [orderId || null, businessId, branchId, receivedBy || null, method || 'transfer', amount, reference || null]
    )

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
// Initiate a provider collection request.
router.post('/momo/initiate', authMiddleware, async (req, res) => {
  try {
    const { orderId, method, customerPhone } = req.body
    if (!orderId || !method) return res.status(400).json({ error: 'orderId and method are required' })

    const scope = await getBranchContext(req)
    const { rows } = await query(
      'SELECT id FROM orders WHERE id = $1 AND business_id = $2 AND branch_id = $3',
      [orderId, scope.businessId, scope.branchId]
    )
    if (!rows.length) return res.status(404).json({ error: 'Order not found' })

    const result = await initiatePayment({ orderId, method, customerPhone })
    res.json(result)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Check payment status
router.get('/momo/:paymentId/status', authMiddleware, async (req, res) => {
  try {
    const { paymentId } = req.params
    const scope = await getBranchContext(req)
    const { rows } = await query(
      `SELECT id FROM payments WHERE id = $1 AND business_id = $2 AND branch_id = $3`,
      [paymentId, scope.businessId, scope.branchId]
    )
    if (!rows.length) return res.status(404).json({ error: 'Payment not found' })
    res.json(await verifyPayment(paymentId))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.post('/cash/:paymentId/confirm', authMiddleware, async (req, res) => {
  try {
    const scope = await getBranchContext(req)
    const result = await confirmCashPayment(req.params.paymentId, scope)
    res.json(result)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

export default router
