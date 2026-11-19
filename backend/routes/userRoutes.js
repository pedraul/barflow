import { Router } from 'express'
import { query } from '../config/database.js'
import { mapUser } from './helpers.js'
import { logAudit, getClientIp } from '../utils/audit.js'
import authMiddleware from '../middleware/authMiddleware.js'
import { getBranchContext } from '../middleware/branchContext.js'
import { isOwner, hasGrant, checkCanManageUser, DELEGABLE_ROLES } from '../utils/staffPermissions.js'

const router = Router()

router.get('/me/salary-status', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id
    if (!userId) return res.status(400).json({ error: 'User not identified.' })
    const businessId = req.user?.businessId
    const branchId = req.user?.branchId || null
    if (!businessId) return res.status(403).json({ error: 'No business associated with this account.' })

    const { rows: userRows } = await query(
      `SELECT id, full_name, salary, is_active, created_at FROM users
       WHERE id = $1 AND business_id = $2 AND ($3::uuid IS NULL OR branch_id = $3)`,
      [userId, businessId, branchId]
    )
    if (!userRows.length) return res.status(404).json({ error: 'User not found.' })
    const user = userRows[0]

    const { rows: payments } = await query(
      `SELECT s.id, s.status, s.pay_period, s.pay_period_start, s.pay_period_end, s.paid_at, s.approved_at, s.created_at,
              s.amount, s.net_amount, s.gross_amount
       FROM salary_payments s
      WHERE s.user_id = $1 AND s.business_id = $2 AND ($3::uuid IS NULL OR s.branch_id = $3)
       ORDER BY s.created_at DESC`,
          [userId, businessId, branchId]
    )

    const monthOf = (d) => {
      if (!d) return null
      const dt = new Date(d)
      if (Number.isNaN(dt.getTime())) return null
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
    }

    const PAID_STATUSES = new Set(['Paid', 'approved', 'completed'])
    const FAILED_STATUSES = new Set(['rejected', 'failed', 'cancelled'])

    const monthMap = new Map()
    for (const p of payments) {
      const m = monthOf(p.pay_period_start || p.paid_at || p.approved_at || p.created_at)
      if (!m) continue
      const status = PAID_STATUSES.has(p.status) ? 'Paid' : FAILED_STATUSES.has(p.status) ? 'Failed' : 'Pending'
      if (!monthMap.has(m) || status === 'Paid') {
        monthMap.set(m, {
          month: m,
          status,
          amount: Number(p.amount || p.net_amount || 0),
          netAmount: Number(p.net_amount || 0),
          grossAmount: Number(p.gross_amount || 0),
          period: p.pay_period || m,
          paidAt: p.paid_at || p.approved_at || null,
        })
      }
    }

    // Build the last 12 months list
    const months = []
    const now = new Date()
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      months.push(m)
    }
    months.reverse()

    const salaryStatus = months.map((m) => {
      const existing = monthMap.get(m)
      if (existing) return existing
      return { month: m, status: 'Not Paid', amount: 0, netAmount: 0, grossAmount: 0, period: m, paidAt: null }
    })

    const paidMonths = salaryStatus.filter((s) => s.status === 'Paid').map((s) => s.month)
    const notPaidMonths = salaryStatus.filter((s) => s.status === 'Not Paid').map((s) => s.month)
    const pendingMonths = salaryStatus.filter((s) => s.status === 'Pending').map((s) => s.month)
    const failedMonths = salaryStatus.filter((s) => s.status === 'Failed').map((s) => s.month)

    res.json({
      userId: user.id,
      name: user.full_name,
      salary: Number(user.salary) || 0,
      isActive: user.is_active !== false,
      joinedAt: user.created_at,
      months: salaryStatus,
      paidMonths,
      notPaidMonths,
      pendingMonths,
      failedMonths,
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.get('/', authMiddleware, async (req, res) => {
  try {
    const scope = await getBranchContext(req, { requestedBranchId: req.query.branchId, allowOwnerAll: true })

    const { rows } = await query(
      `SELECT u.*, b.name AS branch_name
       FROM users u LEFT JOIN branches b ON b.id = u.branch_id
       WHERE u.business_id = $1 AND u.is_active = TRUE
         AND ($2::uuid IS NULL OR u.branch_id = $2)
       ORDER BY u.created_at`,
      [scope.businessId, scope.branchId]
    )
    res.json(rows.map(mapUser))
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message })
  }
})

router.post('/', authMiddleware, async (req, res) => {
  const { name, email, phone, role, status = 'Active', salary = 0, password = 'password123' } = req.body
  let { branch } = req.body
  const allowedRoles = new Set(['manager', 'accountant', 'waiter', 'kitchen', 'bar', 'operator'])
  const actorIsOwner = isOwner(req)
  if (!actorIsOwner) {
    // Workers can create staff only when the owner granted it, only in their
    // own branch, and never Manager accounts.
    if (!(await hasGrant(req, 'create_employees'))) {
      return res.status(403).json({ error: 'Only the business owner, or staff granted access, can create branch users.' })
    }
    if (!DELEGABLE_ROLES.has(String(role || '').toLowerCase())) {
      return res.status(403).json({ error: 'Only the owner can create this type of account.' })
    }
    branch = req.user.branchId
  }
  if (!allowedRoles.has(String(role || '').toLowerCase())) {
    return res.status(400).json({ error: 'Only non-owner business roles can be assigned to a branch.' })
  }
  if (!name || !email || !role) {
    return res.status(400).json({ error: 'Name, email, and role are required.' })
  }
  try {
    const { rows: branchRows } = await query(
      `SELECT id FROM branches
       WHERE (id::text = $1 OR LOWER(name) = LOWER($1))
         AND business_id = $2
         AND COALESCE(is_active, TRUE) = TRUE
       LIMIT 1`,
      [branch, req.user.businessId]
    )
    if (!branchRows.length) return res.status(400).json({ error: 'A valid branch is required.' })
    const { rows } = await query(
      `INSERT INTO users (business_id, branch_id, full_name, email, phone, password_hash, role, is_active, salary)
       VALUES (
        $8,
        $9,
        $1, $2, $3, crypt($4, gen_salt('bf')), $5, $6, $7
      )
      RETURNING id`,
      [name, email, phone, password, role, status === 'Active', salary, req.user.businessId, branchRows[0].id]
    )

    await logAudit({
      userId: req.user?.id,
      actorName: req.user?.full_name || req.user?.email || 'System',
      action: `Created user "${name}" (${role})`,
      targetModule: 'Users',
      ipAddress: getClientIp(req),
      businessId: req.user?.businessId,
    })

    res.status(201).json({ id: rows[0].id })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.patch('/:id', authMiddleware, async (req, res) => {
  const { name, email, phone, role, status, salary } = req.body
  let { branch } = req.body
  if (!isOwner(req)) {
    if (!(await hasGrant(req, 'edit_employees'))) {
      return res.status(403).json({ error: 'Only the business owner, or staff granted access, can update branch users.' })
    }
    const denied = await checkCanManageUser(req, req.params.id)
    if (denied) return res.status(denied.status).json({ error: denied.error })
    if (role !== undefined && !DELEGABLE_ROLES.has(String(role).toLowerCase())) {
      return res.status(403).json({ error: 'Only the owner can assign this role.' })
    }
    branch = undefined // non-owners cannot move staff between branches
  }
  const allowedRoles = new Set(['manager', 'accountant', 'waiter', 'kitchen', 'bar', 'operator'])
  if (role !== undefined && !allowedRoles.has(String(role).toLowerCase())) {
    return res.status(400).json({ error: 'Only non-owner business roles can be assigned to a branch.' })
  }
  const fields = []
  const params = []
  let i = 1
  if (name !== undefined) { fields.push(`full_name = $${i++}`); params.push(name) }
  if (email !== undefined) { fields.push(`email = $${i++}`); params.push(email) }
  if (phone !== undefined) { fields.push(`phone = $${i++}`); params.push(phone) }
  if (role !== undefined) { fields.push(`role = $${i++}`); params.push(role) }
  if (salary !== undefined) { fields.push(`salary = $${i++}`); params.push(salary) }
  if (status !== undefined) { fields.push(`is_active = $${i++}`); params.push(status === 'Active') }
  if (branch !== undefined) {
    fields.push(`branch_id = (SELECT id FROM branches WHERE (id::text = $${i} OR LOWER(name) = LOWER($${i})) AND business_id = $${i + 1})`)
    params.push(branch, req.user.businessId)
    i++
    i++
  }
  if (!fields.length) return res.status(400).json({ error: 'No fields to update.' })
  params.push(req.params.id)
  params.push(req.user.businessId)
  try {
    await query(`UPDATE users SET ${fields.join(', ')} WHERE id = $${i} AND business_id = $${i + 1}`, params)
    const { rows } = await query(
      `SELECT u.*, b.name AS branch_name FROM users u LEFT JOIN branches b ON b.id = u.branch_id WHERE u.id = $1 AND u.business_id = $2`,
      [req.params.id, req.user.businessId]
    )

    await logAudit({
      userId: req.user?.id,
      actorName: req.user?.full_name || req.user?.email || 'System',
      action: `Updated user "${rows[0].full_name}"`,
      targetModule: 'Users',
      ipAddress: getClientIp(req),
      businessId: req.user?.businessId,
    })

    res.json(mapUser(rows[0]))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    if (!isOwner(req)) {
      if (!(await hasGrant(req, 'edit_employees'))) {
        return res.status(403).json({ error: 'Only the business owner, or staff granted access, can deactivate users.' })
      }
      const denied = await checkCanManageUser(req, req.params.id)
      if (denied) return res.status(denied.status).json({ error: denied.error })
    }
    const targetId = req.params.id
    const businessId = req.user.businessId
    const { rows } = await query(
      `UPDATE users SET is_active = FALSE, updated_at = NOW()
       WHERE id = $1 AND business_id = $2
       RETURNING id, full_name`,
      [targetId, businessId]
    )
    if (!rows.length) return res.status(404).json({ error: 'User not found.' })

    await logAudit({
      userId: req.user?.id,
      actorName: req.user?.full_name || req.user?.email || 'System',
      action: `Deactivated user "${rows[0].full_name}" to preserve linked records`,
      targetModule: 'Users',
      ipAddress: getClientIp(req),
      businessId: req.user?.businessId,
    })

    res.json({
      id: targetId,
      deactivated: true,
      message: `${rows[0].full_name} was deactivated. Historical orders and other records were preserved.`,
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
