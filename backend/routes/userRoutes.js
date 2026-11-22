import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { query } from '../config/database.js'
import { mapUser } from './helpers.js'
import { logAudit, getClientIp } from '../utils/audit.js'
import authMiddleware from '../middleware/authMiddleware.js'
import { getBranchContext } from '../middleware/branchContext.js'
import { isOwner, hasGrant, checkCanManageUser, DELEGABLE_ROLES } from '../utils/staffPermissions.js'
import { normalizeRwandaPhone } from '../services/mobileMoneyProviders.js'
import { passwordPolicyError } from '../services/platformSettings.js'

const router = Router()

router.get('/me/salary-status', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id
    if (!userId) return res.status(400).json({ error: 'User not identified.' })
    const businessId = req.user?.businessId
    // The user's own branch, not the branch an accountant is currently working in.
    const branchId = req.user?.assignedBranchId ?? req.user?.branchId ?? null
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

// ---------------------------------------------------------------- my own account

async function loadMyProfile(userId) {
  const { rows } = await query(
    `SELECT u.id, u.full_name, u.email, u.phone, u.role::text AS role, u.avatar_url, u.created_at, u.last_login,
            u.branch_id, b.name AS branch_name, bu.name AS business_name
     FROM users u
     LEFT JOIN branches b ON b.id = u.branch_id
     LEFT JOIN businesses bu ON bu.id = u.business_id
     WHERE u.id = $1`,
    [userId]
  )
  const u = rows[0]
  if (!u) return null
  return {
    id: u.id,
    name: u.full_name || '',
    email: u.email || '',
    phone: u.phone || '',
    role: u.role,
    avatar: u.avatar_url || null,
    branchId: u.branch_id || null,
    branch: u.branch_name || '',
    business: u.business_name || '',
    createdAt: u.created_at,
    lastLogin: u.last_login,
  }
}

// GET /users/me — the signed-in user's own profile.
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const profile = await loadMyProfile(req.user.id)
    if (!profile) return res.status(404).json({ error: 'Account not found.' })
    res.json(profile)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// PATCH /users/me  { name?, email?, phone? } — anyone may edit their own contact details.
router.patch('/me', authMiddleware, async (req, res) => {
  const { name, email, phone } = req.body || {}
  const fields = []
  const params = []
  if (name !== undefined) {
    const value = String(name || '').trim()
    if (value.length < 2 || value.length > 120) return res.status(400).json({ error: 'Enter your full name (2 to 120 characters).' })
    params.push(value); fields.push(`full_name = $${params.length}`)
  }
  if (email !== undefined) {
    const value = String(email || '').trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || value.length > 200) return res.status(400).json({ error: 'Enter a valid email address.' })
    const { rows: taken } = await query('SELECT 1 FROM users WHERE LOWER(email) = $1 AND id <> $2 LIMIT 1', [value, req.user.id])
      .catch(() => ({ rows: [] }))
    if (taken.length) return res.status(409).json({ error: 'Another account already uses this email address.' })
    params.push(value); fields.push(`email = $${params.length}`)
  }
  if (phone !== undefined) {
    const value = String(phone || '').trim()
    if (value) {
      try {
        normalizeRwandaPhone(value)
      } catch (error) {
        return res.status(400).json({ error: error.message })
      }
    }
    params.push(value || null); fields.push(`phone = $${params.length}`)
  }
  if (!fields.length) return res.status(400).json({ error: 'Nothing to update.' })

  try {
    params.push(req.user.id)
    await query(`UPDATE users SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${params.length}`, params)
    await logAudit({
      userId: req.user.id,
      actorName: req.user?.full_name || req.user?.email || 'User',
      action: 'Updated own profile details',
      targetModule: 'Account',
      ipAddress: getClientIp(req),
      businessId: req.user?.businessId,
    }).catch(() => {})
    res.json(await loadMyProfile(req.user.id))
  } catch (error) {
    if (/unique|duplicate/i.test(error.message)) return res.status(409).json({ error: 'Another account already uses this email address.' })
    res.status(500).json({ error: error.message })
  }
})

// POST /users/me/password  { currentPassword, newPassword }
router.post('/me/password', authMiddleware, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {}
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Enter your current password and a new password.' })
  const next = String(newPassword)
  const passwordProblem = await passwordPolicyError(next)
  if (passwordProblem) return res.status(400).json({ error: passwordProblem })
  if (!/[A-Za-z]/.test(next) || !/\d/.test(next)) {
    return res.status(400).json({ error: 'The new password must include letters and numbers.' })
  }
  if (next === String(currentPassword)) return res.status(400).json({ error: 'The new password must be different from the current one.' })
  try {
    const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id])
    const hash = rows[0]?.password_hash || ''
    const valid = hash ? await bcrypt.compare(String(currentPassword), hash).catch(() => false) : false
    if (!valid) return res.status(400).json({ error: 'Your current password is not correct.' })
    await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [await bcrypt.hash(next, 10), req.user.id])
    await logAudit({
      userId: req.user.id,
      actorName: req.user?.full_name || req.user?.email || 'User',
      action: 'Changed own password',
      targetModule: 'Account',
      ipAddress: getClientIp(req),
      businessId: req.user?.businessId,
    }).catch(() => {})
    res.json({ changed: true })
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
  const { name, email, phone, role, status = 'Active', salary = 0, password } = req.body
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
  const passwordProblem = await passwordPolicyError(password)
  if (passwordProblem) return res.status(400).json({ error: passwordProblem })
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

// PATCH /users/:id/payroll — payroll details only (bonus, promotion note, payout phone).
// Allowed for the owner, and for the accountant or manager of the employee's branch.
router.patch('/:id/payroll', authMiddleware, async (req, res) => {
  const role = String(req.user?.role || '').toLowerCase()
  if (!isOwner(req) && !['accountant', 'manager'].includes(role)) {
    return res.status(403).json({ error: 'Only the owner, manager or accountant can change payroll details.' })
  }
  const { bonus, promotion, phone } = req.body || {}
  const fields = []
  const params = []
  if (bonus !== undefined) {
    const value = Number(bonus)
    if (!Number.isFinite(value) || value < 0) return res.status(400).json({ error: 'Bonus must be zero or a positive amount.' })
    params.push(Math.round(value * 100) / 100)
    fields.push(`bonus = $${params.length}`)
  }
  if (promotion !== undefined) {
    params.push(String(promotion || '').trim().slice(0, 255))
    fields.push(`promotion = $${params.length}`)
  }
  if (phone !== undefined) {
    const text = String(phone || '').trim()
    if (text) {
      try {
        normalizeRwandaPhone(text)
      } catch (error) {
        return res.status(400).json({ error: error.message })
      }
    }
    params.push(text)
    fields.push(`phone = $${params.length}`)
  }
  if (!fields.length) return res.status(400).json({ error: 'Nothing to update.' })

  try {
    // Owner, or an accountant viewing all branches: any employee of the business.
    const branchId = isOwner(req) || req.user?.branchScope === 'all' ? null : (req.user?.branchId || null)
    params.push(req.params.id, req.user.businessId, branchId)
    const n = params.length
    const { rows } = await query(
      `UPDATE users SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = $${n - 2} AND business_id = $${n - 1}
         AND ($${n}::uuid IS NULL OR branch_id = $${n}::uuid)
         AND LOWER(role::text) <> 'owner'
       RETURNING id`,
      params
    )
    if (!rows.length) return res.status(404).json({ error: 'Employee not found in your branch.' })
    const { rows: userRows } = await query(
      `SELECT u.*, b.name AS branch_name FROM users u LEFT JOIN branches b ON b.id = u.branch_id WHERE u.id = $1`,
      [req.params.id]
    )
    const updated = mapUser(userRows[0])
    await logAudit({
      userId: req.user?.id,
      actorName: req.user?.full_name || req.user?.email || 'System',
      action: `Updated payroll details for "${updated.name}": bonus ${updated.bonus}${updated.promotion ? `, note "${updated.promotion}"` : ''}`,
      targetModule: 'Payroll',
      ipAddress: getClientIp(req),
      businessId: req.user?.businessId,
    })
    res.json(updated)
  } catch (error) {
    if (/invalid input syntax for type uuid/i.test(error.message)) return res.status(404).json({ error: 'Employee not found.' })
    res.status(500).json({ error: error.message })
  }
})

router.patch('/:id', authMiddleware, async (req, res) => {
  const { name, email, phone, role, status, salary, bonus, promotion } = req.body
  let { branch } = req.body
  if (bonus !== undefined && (!Number.isFinite(Number(bonus)) || Number(bonus) < 0)) {
    return res.status(400).json({ error: 'Bonus must be zero or a positive amount.' })
  }
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
  if (bonus !== undefined) { fields.push(`bonus = $${i++}`); params.push(Number(bonus) || 0) }
  if (promotion !== undefined) { fields.push(`promotion = $${i++}`); params.push(String(promotion || '').slice(0, 255)) }
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
