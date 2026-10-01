import { Router } from 'express'
import { query } from '../config/database.js'
import { logAudit, getClientIp } from '../utils/audit.js'
import { getTaxBreakdown } from '../utils/taxCalculator.js'
import authMiddleware from '../middleware/authMiddleware.js'
import { getBranchContext } from '../middleware/branchContext.js'

const router = Router()

router.get('/', authMiddleware, async (req, res) => {
  try {
    const scope = await getBranchContext(req, { requestedBranchId: req.query.branchId, allowOwnerAll: true })
    const branchFilter = scope.branchId ? 'WHERE business_id = $1 AND branch_id = $2' : 'WHERE business_id = $1'
    const params = scope.branchId ? [scope.businessId, scope.branchId] : [scope.businessId]
    const { rows } = await query(
      `SELECT id, name, phone, gross_amount, tax_amount, insurance_amount, net_amount, amount, method, actor, paid_at, bonus, promotion, status
       FROM salary_payments ${branchFilter} ORDER BY paid_at DESC`,
      params
    )
    res.json(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        phone: r.phone || '',
        grossAmount: Number(r.gross_amount) || 0,
        taxAmount: Number(r.tax_amount) || 0,
        insuranceAmount: Number(r.insurance_amount) || 0,
        netAmount: Number(r.net_amount) || 0,
        amount: Number(r.amount) || 0,
        method: r.method,
        actor: r.actor,
        time: new Date(r.paid_at).toLocaleString(),
        bonus: Number(r.bonus) || 0,
        promotion: r.promotion || '',
        status: r.status || 'pending',
      }))
    )
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.post('/', authMiddleware, async (req, res) => {
  const { name, phone, amount, method, actor, bonus, promotion, user_id, pay_period_start } = req.body
  if (!name || amount == null) {
    return res.status(400).json({ error: 'Name and amount are required.' })
  }

  const gross = Number(amount) || 0
  const { grossAmount, taxAmount: tax, insuranceAmount: insurance, netAmount: net } = getTaxBreakdown(gross)

  try {
    const scope = await getBranchContext(req, { requestedBranchId: req.body.branchId, allowOwnerAll: false })
    const { rows } = await query(
      `INSERT INTO salary_payments (business_id, branch_id, user_id, name, phone, gross_amount, tax_amount, insurance_amount, net_amount, amount, method, actor, bonus, promotion, status, pay_period_start)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'pending', $15) RETURNING id`,
      [scope.businessId, scope.branchId, user_id || null, name, phone || '', gross, tax, insurance, net, net, method, actor, bonus || 0, promotion || '', pay_period_start || null]
    )

    await logAudit({
      userId: req.user?.id,
      actorName: req.user?.full_name || req.user?.email || actor || 'System',
      action: `Created salary payment request for ${name}: gross ${gross}, net ${net} - pending manager approval`,
      targetModule: 'Payroll',
      ipAddress: getClientIp(req),
      businessId: req.user?.businessId,
    })

    res.status(201).json({ id: rows[0].id, gross, tax, insurance, net, status: 'pending' })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
