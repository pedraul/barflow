import { Router } from 'express'
import { query } from '../config/database.js'
import { logAudit, getClientIp } from '../utils/audit.js'
import { getTaxBreakdown } from '../utils/taxCalculator.js'
import { normalizeRwandaPhone } from '../services/mobileMoneyProviders.js'
import authMiddleware from '../middleware/authMiddleware.js'
import roleMiddleware from '../middleware/roleMiddleware.js'
import { getBranchContext } from '../middleware/branchContext.js'

const router = Router()

router.get('/', authMiddleware, async (req, res) => {
  try {
    const scope = await getBranchContext(req, { requestedBranchId: req.query.branchId, allowOwnerAll: true })
    const branchFilter = scope.branchId ? 'WHERE business_id = $1 AND branch_id = $2' : 'WHERE business_id = $1'
    const params = scope.branchId ? [scope.businessId, scope.branchId] : [scope.businessId]
    const { rows } = await query(
      `SELECT id, name, phone, gross_amount, tax_amount, insurance_amount, net_amount, amount, method, actor, paid_at, bonus, promotion, status, provider_status
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
        time: r.paid_at ? new Date(r.paid_at).toLocaleString() : '',
        bonus: Number(r.bonus) || 0,
        promotion: r.promotion || '',
        status: r.status || 'pending',
        providerStatus: r.provider_status || null,
      }))
    )
  } catch (error) {
    res.status(error.statusCode || error.status || 500).json({ error: error.message })
  }
})

router.post('/', authMiddleware, roleMiddleware('accountant', 'manager', 'owner'), async (req, res) => {
  const {
    name,
    phone,
    amount,
    method,
    actor,
    bonus,
    promotion,
    pay_period_start: requestedPeriodStart,
    payPeriodStart,
  } = req.body
  const user_id = req.body.user_id || req.body.userId || null
  const periodStart = requestedPeriodStart || payPeriodStart || null
  if (!name || amount == null) {
    return res.status(400).json({ error: 'Name and amount are required.' })
  }
  if (!['mtn_momo', 'airtel_money'].includes(method)) {
    return res.status(400).json({ error: 'Choose MTN MoMo or Airtel Money for salary payouts.' })
  }
  const gross = Number(amount)
  if (!Number.isFinite(gross) || gross <= 0) {
    return res.status(400).json({ error: 'Salary amount must be greater than zero.' })
  }
  const bonusAmount = Number(bonus) || 0
  if (bonusAmount < 0 || bonusAmount > gross) {
    return res.status(400).json({ error: 'The bonus must be between zero and the gross salary.' })
  }

  const { grossAmount, taxAmount: tax, insuranceAmount: insurance, netAmount: net } = getTaxBreakdown(gross)
  if (net <= 0) {
    return res.status(400).json({ error: 'Salary must leave a positive net amount after tax and insurance deductions.' })
  }

  try {
    const scope = await getBranchContext(req, { requestedBranchId: req.body.branchId, allowOwnerAll: false })
    let recipientName = name
    let recipientPhone = phone
    if (user_id) {
      const { rows: employeeRows } = await query(
        `SELECT full_name, phone FROM users
         WHERE id = $1 AND business_id = $2 AND branch_id = $3`,
        [user_id, scope.businessId, scope.branchId]
      )
      if (!employeeRows.length) {
        return res.status(400).json({ error: 'Selected employee does not belong to this business branch.' })
      }
      recipientName = employeeRows[0].full_name || name
      recipientPhone = employeeRows[0].phone || phone
    }
    try {
      normalizeRwandaPhone(recipientPhone)
    } catch (error) {
      return res.status(400).json({ error: error.message })
    }
    const { rows } = await query(
      `INSERT INTO salary_payments (business_id, branch_id, user_id, name, phone, gross_amount, tax_amount, insurance_amount, net_amount, amount, method, actor, bonus, promotion, status, pay_period_start)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'pending', $15) RETURNING id`,
      [scope.businessId, scope.branchId, user_id, recipientName, recipientPhone.trim(), gross, tax, insurance, net, net, method, actor, bonusAmount, promotion || '', periodStart]
    )

    // A bonus is paid once: clear it from the employee now that it is in this
    // request (it is given back if the manager rejects the request).
    if (user_id && bonusAmount > 0) {
      await query(
        `UPDATE users SET bonus = GREATEST(COALESCE(bonus, 0) - $1, 0), updated_at = NOW()
         WHERE id = $2 AND business_id = $3`,
        [bonusAmount, user_id, scope.businessId]
      )
    }

    await logAudit({
      userId: req.user?.id,
      actorName: req.user?.full_name || req.user?.email || actor || 'System',
      action: `Created salary payment request for ${recipientName}: gross ${gross}, net ${net} - pending manager approval`,
      targetModule: 'Payroll',
      ipAddress: getClientIp(req),
      businessId: req.user?.businessId,
    })

    res.status(201).json({ id: rows[0].id, gross, tax, insurance, net, bonus: bonusAmount, status: 'pending' })
  } catch (error) {
    res.status(error.statusCode || error.status || 500).json({ error: error.message })
  }
})

export default router
