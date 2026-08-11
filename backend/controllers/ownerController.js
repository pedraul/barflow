import { query } from '../config/database.js'
import bcrypt from 'bcryptjs'
import { sign } from '../config/jwt.js'
import crypto from 'crypto'
import QRCode from 'qrcode'
import fs from 'fs'
import path from 'path'
import { logAudit, getClientIp, serializeAuditLogs } from '../utils/audit.js'
import {
  sendSubscriptionActivation,
  sendAdminSubscriptionActivation,
  sendRenewalConfirmation,
} from '../services/emailNotificationService.js'
import { createBackup as createSqlBackup, restoreBackup as restoreSqlBackup } from '../utils/backup.js'

// ──────────────────────────────────────────────
// Helper: generate receipt number
// ──────────────────────────────────────────────
function generateReceiptNumber() {
  return 'RCP-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(3).toString('hex').toUpperCase()
}

// ──────────────────────────────────────────────
// Helper: generate USSD code
// ──────────────────────────────────────────────
function generateUssdCode() {
  return '*182*' + Math.floor(100000 + Math.random() * 900000) + '#'
}

// ──────────────────────────────────────────────
// Helper: subscription billing config (prices + discounts)
// Monthly = no discount, Quarterly = 8%, Annually = 14% by default.
// All values are editable by the super admin via system_settings.
// ──────────────────────────────────────────────
const DEFAULT_ROLE_PERMISSIONS = {
  can_withdraw: 0,
  can_transfer: 0,
  can_manage_users: 0,
  can_view_revenue: 0,
  can_manage_settings: 0,
  can_view_withdraw_logs: 0,
  can_view_transfer_logs: 0,
  can_approve_transfers: 0,
}

async function getBillingConfig() {
  const { rows } = await query(
    `SELECT setting_key, setting_value FROM platform_settings
     WHERE setting_key IN (
       'subscription_monthly_price', 'subscription_quarterly_price', 'subscription_annually_price',
       'subscription_quarterly_discount', 'subscription_annually_discount'
     )`
  )
  const map = {}
  rows.forEach((r) => { map[r.setting_key] = parseFloat(r.setting_value) })

  const num = (v, fallback) => (Number.isFinite(v) ? v : fallback)

  const prices = {
    monthly: num(map.subscription_monthly_price, 50000),
    quarterly: num(map.subscription_quarterly_price, 130000),
    annually: num(map.subscription_annually_price, 480000),
  }
  const discounts = {
    monthly: 0,
    quarterly: num(map.subscription_quarterly_discount, 8),
    annually: num(map.subscription_annually_discount, 14),
  }
  return { prices, discounts }
}

async function importMissingRolePermissions(roleNames = [], businessId = null) {
  if (!Array.isArray(roleNames) || !roleNames.length) return

  const normalizedRoles = [...new Set(roleNames.filter((role) => typeof role === 'string' && role.trim()))]
  if (!normalizedRoles.length) return

  const { rows: existing } = await query(
    `SELECT role FROM role_permissions WHERE role = ANY($1::text[])`,
    [normalizedRoles]
  )

  const existingRoles = new Set(existing.map((row) => row.role))
  const missingRoles = normalizedRoles.filter((role) => !existingRoles.has(role))
  if (!missingRoles.length) return

  for (const role of missingRoles) {
    const { rows: existingRows } = await query(
      `SELECT id FROM role_permissions WHERE role = $1 AND business_id IS NOT DISTINCT FROM $2 LIMIT 1`,
      [role, businessId]
    )

    if (existingRows.length) continue

    await query(
      `INSERT INTO role_permissions (role, business_id, can_withdraw, can_transfer, can_manage_users, can_view_revenue, can_manage_settings, can_view_withdraw_logs, can_view_transfer_logs, can_approve_transfers)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        role,
        businessId,
        DEFAULT_ROLE_PERMISSIONS.can_withdraw,
        DEFAULT_ROLE_PERMISSIONS.can_transfer,
        DEFAULT_ROLE_PERMISSIONS.can_manage_users,
        DEFAULT_ROLE_PERMISSIONS.can_view_revenue,
        DEFAULT_ROLE_PERMISSIONS.can_manage_settings,
        DEFAULT_ROLE_PERMISSIONS.can_view_withdraw_logs,
        DEFAULT_ROLE_PERMISSIONS.can_view_transfer_logs,
        DEFAULT_ROLE_PERMISSIONS.can_approve_transfers,
      ]
    )
  }
}

// POST /api/v1/owner/auth/login
export async function ownerLogin(req, res) {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' })
    }

    const { rows } = await query(
      `SELECT u.*, b.name AS branch_name, bu.id AS business_id, bu.name AS business_name, bu.is_verified AS business_verified
       FROM users u
       LEFT JOIN branches b ON b.id = u.branch_id
       LEFT JOIN businesses bu ON bu.id = u.business_id
       WHERE u.email = $1 AND u.role = 'owner' AND u.is_active = TRUE
       LIMIT 1`,
      [email]
    )

    if (!rows.length) {
      return res.status(401).json({ error: 'Invalid credentials.' })
    }

    const user = rows[0]
    const passwordValid = await bcrypt.compare(password, user.password_hash)
    if (!passwordValid) {
      return res.status(401).json({ error: 'Invalid credentials.' })
    }

    let subscriptionStatus = 'active'
    let subscriptionExpired = false
    if (user.business_id) {
      const { rows: biz } = await query('SELECT is_verified FROM businesses WHERE id = $1', [user.business_id])
      if (biz.length && !biz[0].is_verified) {
        subscriptionExpired = true
      } else {
        const { rows: subs } = await query(
          `SELECT is_active, current_period_end, status, payment_status
           FROM subscriptions WHERE business_id = $1 ORDER BY created_at DESC LIMIT 1`,
          [user.business_id]
        )
        if (subs.length) {
          const sub = subs[0]
          subscriptionStatus = sub.status
          if (sub.payment_status !== 'verified') {
            subscriptionExpired = true
          } else if (sub.current_period_end && new Date(sub.current_period_end) < new Date()) {
            subscriptionExpired = true
          }
        } else {
          subscriptionExpired = true
        }
      }
    }

    if (subscriptionExpired) {
      return res.status(403).json({
        error: 'Your business subscription is pending activation. Please complete payment and wait for admin verification.',
        code: 'SUBSCRIPTION_PENDING',
        subscriptionStatus,
        subscriptionExpired: true,
      })
    }

    const tokenPayload = {
      id: user.id,
      email: user.email,
      role: user.role,
      businessId: user.business_id,
      businessName: user.business_name,
      subscriptionStatus,
      subscriptionExpired,
    }
    const token = sign(tokenPayload)

    await logAudit({
      userId: user.id,
      actorName: user.full_name || user.email,
      action: 'Owner login',
      targetModule: 'Authentication',
      ipAddress: getClientIp(req),
      businessId: user.business_id,
    })

    res.json({
      token,
      user: {
        id: user.id,
        name: user.full_name,
        email: user.email,
        role: user.role,
        branch: user.branch_name || '',
        avatar: user.avatar_url || '',
        businessId: user.business_id,
        businessName: user.business_name,
        subscriptionStatus,
        subscriptionExpired,
      },
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// POST /api/v1/owner/auth/logout
export async function ownerLogout(req, res) {
  try {
    const user = req.user
    await logAudit({
      userId: user.id,
      actorName: user.full_name || user.email,
      action: 'Owner logout',
      targetModule: 'Authentication',
      ipAddress: getClientIp(req),
      businessId: req.user?.businessId,
    })
    res.json({ message: 'Logged out successfully.' })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// ──────────────────────────────────────────────
//  2. Staff Operations Management
// ──────────────────────────────────────────────

// GET /api/v1/owner/users
export async function getUsers(req, res) {
  try {
    const { role, status, branch } = req.query
    const businessId = req.user?.businessId
    let sql = `SELECT u.id, u.full_name, u.email, u.username, u.role, u.is_active, u.salary, u.last_login, u.phone,
                      b.name AS branch_name, b.id AS branch_id
               FROM users u
               LEFT JOIN branches b ON b.id = u.branch_id
               WHERE u.business_id = $1`
    const params = [businessId]

    if (role) {
      sql += ` AND u.role = $${params.length + 1}`
      params.push(role)
    }
    if (status) {
      sql += ` AND u.is_active = $${params.length + 1}`
      params.push(status === 'active')
    }
    if (branch) {
      sql += ` AND b.id = $${params.length + 1}`
      params.push(branch)
    }

    sql += ' ORDER BY u.created_at DESC'

    const { rows } = await query(sql, params)
    res.json(
      rows.map((u) => ({
        id: u.id,
        name: u.full_name,
        fullName: u.full_name,
        username: u.username || '',
        email: u.email,
        role: u.role,
        branch: u.branch_name || '',
        branchName: u.branch_name || '',
        branchId: u.branch_id,
        salary: Number(u.salary) || 0,
        phone: u.phone || '',
        avatar: u.avatar_url || '',
        status: u.is_active ? 'Active' : 'Inactive',
        isActive: u.is_active,
        lastLogin: u.last_login ? new Date(u.last_login).toLocaleString() : 'Never',
      }))
    )
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// POST /api/v1/owner/users
export async function createUser(req, res) {
  try {
    const { username, fullName, email, password, role, branch, salary, phone } = req.body
    if (!fullName || !email || !password || !role) {
      return res.status(400).json({ error: 'Name, email, password, and role are required.' })
    }

    const businessId = req.user?.businessId
    if (!businessId) {
      return res.status(400).json({ error: 'No business associated with this account.' })
    }

    const passwordHash = await bcrypt.hash(password, 10)

    let branchId = null
    if (branch && branch.trim()) {
      const { rows: existingBranch } = await query(
        `SELECT id FROM branches WHERE LOWER(name) = LOWER($1) AND business_id = $2 LIMIT 1`,
        [branch.trim(), businessId]
      )
      if (existingBranch.length) {
        branchId = existingBranch[0].id
      } else {
      const { rows: newBranch } = await query(
        `INSERT INTO branches (business_id, name) VALUES ($1, $2) RETURNING id`,
        [businessId, branch.trim()]
      )
        branchId = newBranch[0].id
      }
    }

    const { rows } = await query(
      `INSERT INTO users (business_id, username, full_name, email, password_hash, role, branch_id, salary, phone)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, full_name, email, username, role, phone, salary`,
      [businessId, username || null, fullName, email, passwordHash, role, branchId, salary || 0, phone || '']
    )

    await logAudit({
      userId: req.user.id,
      actorName: req.user.full_name || req.user.email,
      action: `Created user ${fullName} (${role})`,
      targetModule: 'Staff Management',
      ipAddress: getClientIp(req),
      businessId: req.user?.businessId,
    })

    res.status(201).json(rows[0])
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'A user with this email or username already exists.' })
    }
    res.status(500).json({ error: error.message })
  }
}

// PUT /api/v1/owner/users/:id
export async function updateUser(req, res) {
  try {
    const { id } = req.params
    const { fullName, email, username, role, branch, isActive, salary, phone } = req.body

    const fields = []
    const params = []
    let idx = 1

    if (fullName !== undefined) { fields.push(`full_name = $${idx++}`); params.push(fullName) }
    if (email !== undefined) { fields.push(`email = $${idx++}`); params.push(email) }
    if (username !== undefined) { fields.push(`username = $${idx++}`); params.push(username) }
    if (role !== undefined) { fields.push(`role = $${idx++}`); params.push(role) }
    if (isActive !== undefined) { fields.push(`is_active = $${idx++}`); params.push(isActive) }
    if (salary !== undefined) { fields.push(`salary = $${idx++}`); params.push(salary) }
    if (phone !== undefined) { fields.push(`phone = $${idx++}`); params.push(phone) }
    if (branch !== undefined && branch !== null && String(branch).trim()) {
      const branchName = String(branch).trim()
      const businessId = req.user?.businessId
      const { rows: existingBranch } = await query(
        `SELECT id FROM branches WHERE LOWER(name) = LOWER($1) AND business_id = $2 LIMIT 1`,
        [branchName, businessId]
      )
      let branchId = existingBranch.length ? existingBranch[0].id : null
      if (!branchId) {
        const { rows: newBranch } = await query(
          `INSERT INTO branches (business_id, name) VALUES ($1, $2) RETURNING id`,
          [businessId, branchName]
        )
        branchId = newBranch[0].id
      }
      fields.push(`branch_id = $${idx++}`)
      params.push(branchId)
    }

    if (!fields.length) {
      return res.status(400).json({ error: 'No fields provided to update.' })
    }

    const businessId = req.user?.businessId
    params.push(id, businessId)
    const { rows } = await query(
      `UPDATE users SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${idx} AND business_id = $${idx + 1} RETURNING id, full_name, email, username, role, is_active, salary, phone`,
      params
    )

    if (!rows.length) {
      return res.status(404).json({ error: 'User not found.' })
    }

    await logAudit({
      userId: req.user.id,
      actorName: req.user.full_name || req.user.email,
      action: `Updated user ${rows[0].full_name}`,
      targetModule: 'Staff Management',
      ipAddress: getClientIp(req),
      businessId: req.user?.businessId,
    })

    res.json(rows[0])
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// DELETE /api/v1/owner/users/:id
export async function deleteUser(req, res) {
  try {
    const { id } = req.params
    const businessId = req.user?.businessId
    const { rows } = await query('SELECT id, full_name FROM users WHERE id = $1 AND business_id = $2', [id, businessId])
    if (!rows.length) {
      return res.status(404).json({ error: 'User not found.' })
    }

    await query('DELETE FROM users WHERE id = $1 AND business_id = $2', [id, businessId])

    await logAudit({
      userId: req.user.id,
      actorName: req.user.full_name || req.user.email,
      action: `Deleted user ${rows[0].full_name}`,
      targetModule: 'Staff Management',
      ipAddress: getClientIp(req),
      businessId: req.user?.businessId,
    })

    res.json({ message: `User ${rows[0].full_name} deleted successfully.` })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// PUT /api/v1/owner/users/:id/reset-password
export async function resetUserPassword(req, res) {
  try {
    const { id } = req.params
    const { newPassword } = req.body
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' })
    }

    const passwordHash = await bcrypt.hash(newPassword, 10)
    const { rows } = await query(
      `UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id, full_name, email`,
      [passwordHash, id]
    )

    if (!rows.length) {
      return res.status(404).json({ error: 'User not found.' })
    }

    await logAudit({
      userId: req.user.id,
      actorName: req.user.full_name || req.user.email,
      action: `Reset password for user ${rows[0].full_name}`,
      targetModule: 'Staff Management',
      ipAddress: getClientIp(req),
      businessId: req.user?.businessId,
    })

    res.json({ message: `Password reset successfully for ${rows[0].full_name}.` })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// ──────────────────────────────────────────────
//  3. Corporate Payroll & Compensation
// ──────────────────────────────────────────────

// GET /api/v1/owner/salaries
export async function getSalaries(req, res) {
  try {
    const businessId = req.user?.businessId
    const { rows } = await query(
      `SELECT s.id, s.user_id, u.full_name AS user_name, u.email, u.role, u.phone,
              b.name AS branch_name, u.salary AS base_salary,
              s.gross_amount, s.tax_amount, s.insurance_amount, s.net_amount,
              s.amount, s.payment_date, s.status, s.pay_period_start, s.pay_period_end
         FROM salary_payments s
         JOIN users u ON u.id = s.user_id
         LEFT JOIN branches b ON b.id = u.branch_id
         WHERE u.business_id = $1
         ORDER BY s.created_at DESC`,
      [businessId]
    )

    res.json(
      rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        userName: r.user_name,
        email: r.email,
        phone: r.phone || '',
        role: r.role,
        branch: r.branch_name || '',
        baseSalary: Number(r.base_salary) || 0,
        grossAmount: Number(r.gross_amount) || 0,
        taxAmount: Number(r.tax_amount) || 0,
        insuranceAmount: Number(r.insurance_amount) || 0,
        netAmount: Number(r.net_amount) || 0,
        amount: Number(r.amount) || 0,
        paymentDate: r.payment_date ? new Date(r.payment_date).toISOString() : null,
        status: r.status || 'Pending',
        payPeriodStart: r.pay_period_start ? new Date(r.pay_period_start).toISOString() : null,
        payPeriodEnd: r.pay_period_end ? new Date(r.pay_period_end).toISOString() : null,
      }))
    )
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// POST /api/v1/owner/salaries/payout
export async function processPayout(req, res) {
  try {
    const businessId = req.user?.businessId
    const { rows: employees } = await query(
      `SELECT id, full_name, salary, phone FROM users WHERE is_active = TRUE AND salary > 0 AND business_id = $1`,
      [businessId]
    )

    if (!employees.length) {
      return res.status(400).json({ error: 'No active employees with salary configured.' })
    }

    const payPeriodStart = req.body.payPeriodStart || new Date().toISOString().slice(0, 10)
    const payPeriodEnd = req.body.payPeriodEnd || new Date().toISOString().slice(0, 10)
    const results = []

    for (const emp of employees) {
      const gross = Number(emp.salary) || 0
      const tax = gross > 60000 ? Math.round((gross - 60000) * (gross <= 200000 ? 0.10 : gross <= 1000000 ? 0.15 : 0.20)) : 0
      const insurance = 2000
      const net = Math.max(0, gross - tax - insurance)

      const { rows: inserted } = await query(
        `INSERT INTO salary_payments (user_id, name, phone, gross_amount, tax_amount, insurance_amount, net_amount, amount, method, status, pay_period_start, pay_period_end)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'direct', 'Paid', $9, $10) RETURNING id`,
        [emp.id, emp.full_name, emp.phone || '', gross, tax, insurance, net, net, payPeriodStart, payPeriodEnd]
      )
      results.push({ userId: emp.id, name: emp.full_name, gross, tax, insurance, net, paymentId: inserted[0].id })
    }

    await logAudit({
      userId: req.user.id,
      actorName: req.user.full_name || req.user.email,
      action: `Processed mass payroll payout for ${results.length} employees`,
      targetModule: 'Payroll',
      ipAddress: getClientIp(req),
      businessId: req.user?.businessId,
    })

    res.status(201).json({ message: `Paid ${results.length} employees.`, payments: results })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// ──────────────────────────────────────────────
//  4. Withdrawals (Owner Only - Create, Manager/Accountant - View Logs)
// ──────────────────────────────────────────────

// POST /api/v1/owner/withdraw
export async function createWithdrawal(req, res) {
  try {
    const { phoneNumber, purpose, amount } = req.body
    if (!phoneNumber || !purpose || !amount) {
      return res.status(400).json({ error: 'Phone number, purpose, and amount are required.' })
    }

    const businessId = req.user?.businessId

    const { rows } = await query(
      `INSERT INTO withdrawals (business_id, phone_number, purpose, amount, initiated_by, status)
       VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING *`,
      [businessId, phoneNumber, purpose, amount, req.user.id]
    )

    await logAudit({
      userId: req.user.id,
      actorName: req.user.full_name || req.user.email,
      action: `Created withdrawal request of ${amount} to ${phoneNumber} (${purpose}) - pending manager approval`,
      targetModule: 'Withdrawals',
      ipAddress: getClientIp(req),
      businessId: req.user?.businessId,
    })

    res.status(201).json(rows[0])
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// GET /api/v1/owner/withdraw/logs
export async function getWithdrawalLogs(req, res) {
  try {
    const businessId = req.user?.businessId
    const page = Math.max(1, parseInt(req.query.page) || 1)
    const limit = Math.min(100, Math.max(10, parseInt(req.query.limit) || 50))
    const offset = (page - 1) * limit

    const { rows: countResult } = await query('SELECT COUNT(*) AS total FROM withdrawals WHERE business_id = $1', [businessId])
    const total = parseInt(countResult[0].total) || 0

    const { rows } = await query(
      `SELECT w.*, u.full_name AS initiated_by_name
       FROM withdrawals w
       LEFT JOIN users u ON u.id = w.initiated_by
       WHERE w.business_id = $1
       ORDER BY w.created_at DESC
       LIMIT $2 OFFSET $3`,
      [businessId, limit, offset]
    )

    res.json({
      withdrawals: rows.map((w) => ({
        id: w.id,
        phoneNumber: w.phone_number,
        purpose: w.purpose,
        amount: Number(w.amount),
        status: w.status,
        initiatedBy: w.initiated_by_name,
        createdAt: new Date(w.created_at).toISOString(),
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// ──────────────────────────────────────────────
//  5. Transfers (Owner + Accountant create, Manager approves)
// ──────────────────────────────────────────────

// POST /api/v1/owner/transfer
export async function createTransfer(req, res) {
  try {
    const { toPhone, amount, description } = req.body
    if (!amount) {
      return res.status(400).json({ error: 'Amount is required.' })
    }

    const businessId = req.user?.businessId

    // Resolve recipient by phone number (transfers are made to a phone)
    let toUserId = null
    let resolvedName = null
    if (toPhone) {
      const { rows: users } = await query(
        'SELECT id, full_name FROM users WHERE phone = $1 AND business_id = $2 LIMIT 1',
        [toPhone, businessId]
      )
      if (users.length) {
        toUserId = users[0].id
        resolvedName = users[0].full_name
      }
    }

    const { rows } = await query(
      `INSERT INTO transfers (business_id, from_user, to_user, to_phone, amount, description, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending') RETURNING *`,
      [businessId, req.user.id, toUserId, toPhone || null, amount, description || '']
    )

    await logAudit({
      userId: req.user.id,
      actorName: req.user.full_name || req.user.email,
      action: `Created transfer of ${amount}${toPhone ? ' to ' + (resolvedName || toPhone) : ''}`,
      targetModule: 'Transfers',
      ipAddress: getClientIp(req),
      businessId: req.user?.businessId,
    })

    res.status(201).json(rows[0])
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// PUT /api/v1/owner/transfer/:id/approve
export async function approveTransfer(req, res) {
  try {
    const { id } = req.params
    const { action } = req.body // 'approved' or 'rejected'

    if (!['approved', 'rejected'].includes(action)) {
      return res.status(400).json({ error: 'Action must be "approved" or "rejected".' })
    }

    const { rows } = await query(
      `UPDATE transfers SET status = $1, manager_approval = 1, manager_approved_by = $2, approved_at = NOW()
       WHERE id = $3 RETURNING *`,
      [action, req.user.id, id]
    )

    if (!rows.length) {
      return res.status(404).json({ error: 'Transfer not found.' })
    }

    await logAudit({
      userId: req.user.id,
      actorName: req.user.full_name || req.user.email,
      action: `${action === 'approved' ? 'Approved' : 'Rejected'} transfer ${id}`,
      targetModule: 'Transfers',
      ipAddress: getClientIp(req),
      businessId: req.user?.businessId,
    })

    res.json(rows[0])
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// GET /api/v1/owner/transfer/logs
export async function getTransferLogs(req, res) {
  try {
    const businessId = req.user?.businessId
    const page = Math.max(1, parseInt(req.query.page) || 1)
    const limit = Math.min(100, Math.max(10, parseInt(req.query.limit) || 50))
    const offset = (page - 1) * limit

    const { rows: countResult } = await query('SELECT COUNT(*) AS total FROM transfers WHERE business_id = $1', [businessId])
    const total = parseInt(countResult[0].total) || 0

    const { rows } = await query(
      `SELECT t.*, u1.full_name AS from_name, u2.full_name AS to_name, u3.full_name AS approved_by_name
       FROM transfers t
       LEFT JOIN users u1 ON u1.id = t.from_user
       LEFT JOIN users u2 ON u2.id = t.to_user
       LEFT JOIN users u3 ON u3.id = t.manager_approved_by
       WHERE t.business_id = $1
       ORDER BY t.created_at DESC
       LIMIT $2 OFFSET $3`,
      [businessId, limit, offset]
    )

    res.json({
      transfers: rows.map((t) => ({
        id: t.id,
        fromUser: t.from_name,
        toUser: t.to_name || 'System',
        toPhone: t.to_phone || null,
        amount: Number(t.amount),
        description: t.description,
        status: t.status,
        managerApproval: t.manager_approval === 1,
        approvedBy: t.approved_by_name || null,
        approvedAt: t.approved_at ? new Date(t.approved_at).toISOString() : null,
        createdAt: new Date(t.created_at).toISOString(),
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// ──────────────────────────────────────────────
//  6. Revenue Tracking
// ──────────────────────────────────────────────

// GET /api/v1/owner/revenue
export async function getRevenue(req, res) {
  try {
    const businessId = req.user?.businessId
    if (!businessId) {
      return res.json({
        revenueReceived: 0,
        stockAvailable: { items: 0, quantity: 0 },
        stockOrdered: { orders: 0, value: 0 },
        currentStockValue: 0,
        soldStockValue: 0,
      })
    }

    const { rows: revenueReceived } = await query(
      `SELECT COALESCE(SUM(total_amount), 0) AS total FROM orders WHERE status IN ('Paid', 'Served') AND business_id = $1`,
      [businessId]
    )
    const { rows: refundTotalRows } = await query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM refunds WHERE status = 'approved' AND business_id = $1`,
      [businessId]
    )

    const { rows: stockAvailable } = await query(
      `SELECT COUNT(*) AS total_items, COALESCE(SUM(quantity), 0) AS total_quantity FROM products WHERE is_active = TRUE AND business_id = $1`,
      [businessId]
    )

    const { rows: stockOrdered } = await query(
      `SELECT COUNT(*) AS total_orders, COALESCE(SUM(total_amount), 0) AS total_value FROM orders WHERE status = 'Open' AND business_id = $1`,
      [businessId]
    )

    const { rows: stockValue } = await query(
      `SELECT COALESCE(SUM(quantity * cost_price), 0) AS total_value FROM products WHERE is_active = TRUE AND business_id = $1`,
      [businessId]
    )

    const { rows: soldValue } = await query(
      `SELECT COALESCE(SUM(oi.quantity * p.selling_price), 0) AS total_value
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       JOIN orders o ON o.id = oi.order_id AND o.status IN ('Paid', 'Served')
       WHERE o.business_id = $1`,
      [businessId]
    )

    res.json({
      revenueReceived: (Number(revenueReceived[0].total) || 0) - (Number(refundTotalRows[0]?.total) || 0),
      stockAvailable: {
        items: Number(stockAvailable[0].total_items) || 0,
        quantity: Number(stockAvailable[0].total_quantity) || 0,
      },
      stockOrdered: {
        orders: Number(stockOrdered[0].total_orders) || 0,
        value: Number(stockOrdered[0].total_value) || 0,
      },
      currentStockValue: Number(stockValue[0].total_value) || 0,
      soldStockValue: Number(soldValue[0].total_value) || 0,
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// GET /api/v1/owner/revenue/logs
export async function getRevenueLogs(req, res) {
  try {
    const businessId = req.user?.businessId
    const page = Math.max(1, parseInt(req.query.page) || 1)
    const limit = Math.min(100, Math.max(10, parseInt(req.query.limit) || 50))
    const offset = (page - 1) * limit
    const { type } = req.query

    let countSql = 'SELECT COUNT(*) AS total FROM revenue_logs WHERE business_id = $1'
    let sql = `SELECT * FROM revenue_logs WHERE business_id = $1`
    const params = [businessId]

    if (type) {
      sql += ` AND type = $${params.length + 1}`
      countSql += ` AND type = $${params.length + 1}`
      params.push(type)
    }

    const { rows: countResult } = await query(countSql, params)
    const total = parseInt(countResult[0].total) || 0

    sql += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2)
    params.push(limit, offset)

    const { rows } = await query(sql, params)

    if (total === 0) {
      const { rows: orderLogs } = await query(
        `SELECT o.id, o.order_number, o.total_amount, o.status, o.created_at,
                COALESCE(SUM(oi.quantity * p.selling_price), 0) AS sold_value
         FROM orders o
         LEFT JOIN order_items oi ON oi.order_id = o.id
         LEFT JOIN products p ON p.id = oi.product_id
         WHERE o.status IN ('Paid', 'Served') AND o.business_id = $1
         GROUP BY o.id, o.order_number, o.total_amount, o.status, o.created_at
         ORDER BY o.created_at DESC
         LIMIT $2 OFFSET $3`,
        [businessId, limit, offset]
      )

      const logs = orderLogs.map((o) => ({
        id: o.id,
        type: 'received',
        description: `Order ${o.order_number || o.id.slice(0, 8)} — ${o.status}`,
        amount: Number(o.total_amount) || 0,
        referenceId: o.id,
        createdAt: new Date(o.created_at).toISOString(),
      }))

      const { rows: countRows } = await query(
        `SELECT COUNT(*) AS total FROM orders WHERE status IN ('Paid', 'Served') AND business_id = $1`,
        [businessId]
      )
      const computedTotal = parseInt(countRows[0].total) || 0

      return res.json({
        logs,
        pagination: { page, limit, total: computedTotal, totalPages: Math.ceil(computedTotal / limit) || 1 },
      })
    }

    res.json({
      logs: rows.map((r) => ({
        id: r.id,
        type: r.type,
        description: r.description,
        amount: Number(r.amount),
        referenceId: r.reference_id,
        createdAt: new Date(r.created_at).toISOString(),
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// ──────────────────────────────────────────────
//  7. System Metrics & Export Data
// ──────────────────────────────────────────────

// GET /api/v1/owner/reports/summary
export async function getReportSummary(req, res) {
  try {
    const businessId = req.user?.businessId
    if (!businessId) {
      return res.json({
        summary: {
          totalSales: 0, cashSales: 0, cardSales: 0, netProfit: 0, vatDue: 0,
          totalOrders: 0, waiters: 0, managers: 0, accountants: 0, qrOrders: 0, qrRevenue: 0,
        },
        branchPerformance: [],
        recentActivity: [],
      })
    }

    // Refunds total (money returned to clients - removed from revenue)
    const { rows: refundTotal } = await query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM refunds WHERE status = 'approved' AND business_id = $1`,
      [businessId]
    )
    const totalRefunds = Number(refundTotal[0]?.total || 0)

    // Total Sales (net of refunds)
    const { rows: salesData } = await query(
      `SELECT COALESCE(SUM(total_amount), 0) AS total_sales,
              COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total_amount ELSE 0 END), 0) AS cash_sales,
              COALESCE(SUM(CASE WHEN payment_method = 'card' THEN total_amount ELSE 0 END), 0) AS card_sales,
              COUNT(*) AS total_orders
       FROM orders WHERE status IN ('Paid', 'Served') AND business_id = $1`,
      [businessId]
    )

    // Net Profit (simplified: total sales minus total costs)
    const { rows: costData } = await query(
      `SELECT COALESCE(SUM(oi.quantity * p.cost_price), 0) AS total_cost
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id AND o.status IN ('Paid', 'Served')
       JOIN products p ON p.id = oi.product_id
       WHERE o.business_id = $1`,
      [businessId]
    )

    // VAT Due (simplified: 18% of net sales)
    const totalSales = (Number(salesData[0].total_sales) || 0) - totalRefunds
    const totalCost = Number(costData[0].total_cost) || 0
    const netProfit = totalSales - totalCost
    const vatDue = totalSales * 0.18

    // Branch Performance
    const { rows: branchPerformance } = await query(
      `SELECT b.id, b.name AS branch_name,
              COALESCE(SUM(o.total_amount), 0) AS total_revenue,
              COUNT(o.id) AS order_count
       FROM branches b
       LEFT JOIN users u ON u.branch_id = b.id
       LEFT JOIN orders o ON o.branch_id = b.id AND o.status IN ('Paid', 'Served')
       WHERE b.business_id = $1
       GROUP BY b.id, b.name
       ORDER BY total_revenue DESC`,
      [businessId]
    )

    // Recent activity
    const { rows: recentActivity } = await query(
      `SELECT al.id, al.actor_name AS actor, al.action, al.target_module AS module,
              al.ip_address AS ip, al.created_at
       FROM audit_logs al
       WHERE al.business_id = $1
       ORDER BY al.created_at DESC LIMIT 10`,
      [businessId]
    )

    // Dashboard stats
    const { rows: staffCount } = await query(
      `SELECT role, COUNT(*) AS count FROM users WHERE is_active = TRUE AND business_id = $1 GROUP BY role`,
      [businessId]
    )
    const stats = {}
    staffCount.forEach((r) => { stats[r.role] = parseInt(r.count) })

    // Customer orders via QR
    const { rows: qrOrders } = await query(
      `SELECT COUNT(*) AS count, COALESCE(SUM(total_amount), 0) AS total
       FROM orders WHERE source = 'qr' AND status IN ('Paid', 'Served') AND business_id = $1`,
      [businessId]
    )

    res.json({
      summary: {
        totalSales,
        cashSales: Number(salesData[0].cash_sales) || 0,
        cardSales: Number(salesData[0].card_sales) || 0,
        netProfit,
        vatDue,
        totalOrders: Number(salesData[0].total_orders) || 0,
        waiters: stats.waiter || 0,
        managers: stats.manager || 0,
        accountants: stats.accountant || 0,
        qrOrders: parseInt(qrOrders[0].count) || 0,
        qrRevenue: (Number(qrOrders[0].total) || 0) - totalRefunds,
      },
      branchPerformance: branchPerformance.map((b) => ({
        id: b.id,
        name: b.branch_name,
        revenue: Number(b.total_revenue) || 0,
        orders: Number(b.order_count) || 0,
      })),
      recentActivity: recentActivity.map((a) => ({
        id: a.id,
        actor: a.actor,
        action: a.action,
        module: a.module,
        ip: a.ip,
        timestamp: new Date(a.created_at).toISOString(),
      })),
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// GET /api/v1/owner/reports/export?format=pdf|csv
export async function exportReport(req, res) {
  try {
    const businessId = req.user?.businessId
    const { format } = req.query
    if (!['pdf', 'csv'].includes(format)) {
      return res.status(400).json({ error: 'Invalid format. Use ?format=pdf or ?format=csv' })
    }

    const { rows: salesData } = await query(
      `SELECT COALESCE(SUM(total_amount), 0) AS total_sales
       FROM orders WHERE status IN ('Paid', 'Served') AND business_id = $1`,
      [businessId]
    )
    const { rows: refundRows } = await query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM refunds WHERE status = 'approved' AND business_id = $1`,
      [businessId]
    )
    const totalSales = (Number(salesData[0].total_sales) || 0) - (Number(refundRows[0]?.total) || 0)
    const vatDue = totalSales * 0.18
    const netProfit = totalSales * 0.3

    const reportData = {
      generatedAt: new Date().toISOString(),
      period: 'All time',
      totalSales,
      netProfit,
      vatDue,
    }

    if (format === 'csv') {
      const csv = `Generated At,Period,Total Sales,Net Profit,VAT Due\n${reportData.generatedAt},${reportData.period},${reportData.totalSales},${reportData.netProfit},${reportData.vatDue}\n`
      res.setHeader('Content-Type', 'text/csv')
      res.setHeader('Content-Disposition', 'attachment; filename="owner-report.csv"')
      await logAudit({
        userId: req.user.id,
        actorName: req.user.full_name || req.user.email,
        action: `Exported ${format} report`,
        targetModule: 'Reports',
        ipAddress: getClientIp(req),
        businessId: req.user?.businessId,
      })
      return res.send(csv)
    }

    await logAudit({
      userId: req.user.id,
      actorName: req.user.full_name || req.user.email,
      action: `Exported ${format} report`,
      targetModule: 'Reports',
      ipAddress: getClientIp(req),
      businessId: req.user?.businessId,
    })

    res.json(reportData)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// ──────────────────────────────────────────────
//  8. Enterprise Accountability Logs
// ──────────────────────────────────────────────

// GET /api/v1/owner/audit-logs
export async function getAuditLogs(req, res) {
  try {
    const businessId = req.user?.businessId
    const page = Math.max(1, parseInt(req.query.page) || 1)
    const limit = Math.min(100, Math.max(10, parseInt(req.query.limit) || 50))
    const offset = (page - 1) * limit
    const { targetModule, userId } = req.query

    let countSql = 'SELECT COUNT(*) AS total FROM audit_logs WHERE business_id = $1'
    let sql = `SELECT al.id, al.actor_id AS user_id, al.actor_name, al.action, al.target_module, al.ip_address, al.created_at, al.business_id, al.metadata
               FROM audit_logs al WHERE al.business_id = $1`
    const countParams = [businessId]
    const params = [businessId]

    if (targetModule) {
      sql += ` AND al.target_module = $${params.length + 1}`
      countSql += ` AND target_module = $${countParams.length + 1}`
      params.push(targetModule)
      countParams.push(targetModule)
    }
    if (userId) {
      sql += ` AND al.actor_id = $${params.length + 1}`
      countSql += ` AND actor_id = $${countParams.length + 1}`
      params.push(userId)
      countParams.push(userId)
    }

    const { rows: countResult } = await query(countSql, countParams)
    const total = parseInt(countResult[0].total) || 0

    sql += ' ORDER BY al.created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2)
    params.push(limit, offset)

    const { rows } = await query(sql, params)

    await logAudit({
      userId: req.user.id,
      actorName: req.user.full_name || req.user.email,
      action: `Viewed audit logs${targetModule ? ` (module: ${targetModule})` : ''}${userId ? ` (user: ${userId})` : ''}`,
      targetModule: 'Audit Logs',
      ipAddress: getClientIp(req),
      businessId: req.user?.businessId,
    })

    res.json({
      logs: rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        actor: r.actor_name,
        action: r.action,
        targetModule: r.target_module,
        ipAddress: r.ip_address,
        timestamp: new Date(r.created_at).toISOString(),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// GET /api/v1/owner/audit-logs/export
export async function exportAuditLogs(req, res) {
  try {
    const { targetModule, userId, format = 'csv' } = req.query
    const businessId = req.user?.businessId

    let sql = `SELECT al.id, al.actor_id AS user_id, al.actor_name, al.action, al.target_module, al.ip_address, al.created_at, al.business_id, al.metadata
               FROM audit_logs al WHERE 1=1`
    const params = []

    if (businessId) {
      sql += ` AND al.business_id = $${params.length + 1}`
      params.push(businessId)
    }

    if (targetModule) {
      sql += ` AND al.target_module = $${params.length + 1}`
      params.push(targetModule)
    }
    if (userId) {
      sql += ` AND al.actor_id = $${params.length + 1}`
      params.push(userId)
    }

    sql += ' ORDER BY al.created_at DESC'
    const { rows } = await query(sql, params)

    await logAudit({
      userId: req.user.id,
      actorName: req.user.full_name || req.user.email,
      action: `Exported audit logs (${format})${targetModule ? ` (module: ${targetModule})` : ''}${userId ? ` (user: ${userId})` : ''}`,
      targetModule: 'Audit Logs',
      ipAddress: getClientIp(req),
      businessId: req.user?.businessId,
    })

    const normalizedFormat = String(format || 'csv').toLowerCase()
    const payload = serializeAuditLogs(rows, normalizedFormat)

    const isExcel = normalizedFormat === 'xls' || normalizedFormat === 'xlsx'
    const isJson = normalizedFormat === 'json'
    const contentType = isJson ? 'application/json' : (isExcel ? 'application/vnd.ms-excel' : 'text/csv')
    const extension = isJson ? 'json' : (isExcel ? 'xls' : 'csv')

    res.setHeader('Content-Type', contentType)
    res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${new Date().toISOString().slice(0, 10)}.${extension}"`)
    res.send(payload)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// ──────────────────────────────────────────────
//  9. SaaS Subscription & Billing (Enhanced)
// ──────────────────────────────────────────────

// GET /api/v1/owner/subscription
export async function getSubscription(req, res) {
  try {
    const businessId = req.user?.businessId
    if (!businessId) {
      return res.json({
        plan: 'Free',
        status: 'no_subscription',
        isActive: false,
        daysRemaining: 0,
        nextRenewalDate: null,
        remainingDays: 0,
        paymentStatus: null,
        receiptNumber: null,
        amountPaid: 0,
      })
    }

    const { rows } = await query(
      `SELECT s.*, b.name AS business_name, b.id AS business_id
       FROM subscriptions s
       LEFT JOIN businesses b ON b.id = s.business_id
       WHERE s.business_id = $1
       ORDER BY (s.is_active = TRUE AND s.payment_status = 'verified') DESC, s.created_at DESC
       LIMIT 1`,
      [businessId]
    )

    if (!rows.length) {
      return res.json({
        plan: 'Free',
        status: 'no_subscription',
        isActive: false,
        daysRemaining: 0,
        nextRenewalDate: null,
        remainingDays: 0,
        paymentStatus: null,
        receiptNumber: null,
        amountPaid: 0,
      })
    }

    const sub = rows[0]
    const now = new Date()
    const expiry = new Date(sub.period_end || sub.expiration_date || sub.next_renewal_date || now)
    const daysRemaining = Math.max(0, Math.floor((expiry - now) / (1000 * 60 * 60 * 24)))

    const { rows: settings } = await query(
      `SELECT setting_value FROM platform_settings WHERE setting_key = 'alert_before_expiry_days' LIMIT 1`
    )
    const alertDays = parseInt(settings[0]?.setting_value) || 7
    const aboutToExpire = daysRemaining <= alertDays && daysRemaining > 0

    res.json({
      id: sub.id,
      businessName: sub.business_name || 'N/A',
      businessId: sub.business_id,
      plan: sub.plan,
      status: sub.payment_status === 'verified' ? 'active' : sub.status,
      isActive: sub.is_active && sub.payment_status === 'verified' && daysRemaining > 0,
      startDate: sub.start_date ? new Date(sub.start_date).toISOString() : null,
      periodEnd: sub.period_end ? new Date(sub.period_end).toISOString() : null,
      expirationDate: sub.expiration_date ? new Date(sub.expiration_date).toISOString() : null,
      daysRemaining,
      remainingDays: daysRemaining,
      aboutToExpire,
      nextRenewalDate: sub.next_renewal_date ? new Date(sub.next_renewal_date).toISOString() : null,
      paymentMethod: sub.payment_method || null,
      phoneNumber: sub.phone_number || null,
      ussdCode: sub.ussd_code || null,
      paymentStatus: sub.payment_status || 'pending',
      receiptNumber: sub.receipt_number || null,
      receiptGenerated: sub.receipt_generated === 1,
      amountPaid: Number(sub.amount_paid) || 0,
      createdAt: new Date(sub.created_at).toISOString(),
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// POST /api/v1/owner/subscription/select-plan
export async function selectSubscriptionPlan(req, res) {
  try {
    const { plan, planId, paymentMethod, phoneNumber, billingCycle } = req.body
    const allowedMethods = ['momo', 'airtel', 'mtn_momo', 'airtel_money']
    if (!paymentMethod || !allowedMethods.includes(String(paymentMethod).toLowerCase())) {
      return res.status(400).json({ error: 'Invalid payment method. Only MTN MoMo and Airtel Money are allowed for subscriptions.' })
    }
    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number is required.' })
    }

    const businessId = req.user?.businessId
    if (!businessId) {
      return res.status(400).json({ error: 'No business associated with this account.' })
    }

    const normalizedMethod = String(paymentMethod).toLowerCase()

    let selectedPlan = null
    if (planId) {
      const { rows } = await query('SELECT * FROM subscription_plans WHERE id = $1 AND is_active = TRUE', [planId])
      selectedPlan = rows[0]
      if (!selectedPlan) return res.status(404).json({ error: 'Selected subscription plan is not available.' })
    }

    if (!selectedPlan && !plan) {
      return res.status(400).json({ error: 'Select a subscription plan.' })
    }

    const planName = selectedPlan ? selectedPlan.name : plan
    const cycle = String(billingCycle || (selectedPlan ? 'monthly' : plan) || 'monthly').toLowerCase()
    const monthlyPrice = Number(selectedPlan?.price_monthly) || 0

    let amount = monthlyPrice
    let monthsToAdd = 1
    let discountPercent = 0

    if (selectedPlan) {
      if (cycle === 'quarterly') {
        monthsToAdd = 3
        discountPercent = Number(selectedPlan.discount_quarterly ?? 8)
        amount = Math.round(monthlyPrice * 3 * (1 - discountPercent / 100))
      } else if (cycle === 'annually' || cycle === 'yearly') {
        monthsToAdd = 12
        discountPercent = Number(selectedPlan.discount_annually ?? 14)
        amount = Number(selectedPlan.price_yearly) || Math.round(monthlyPrice * 12 * (1 - discountPercent / 100))
      }
    } else {
      amount = Number(amount) || 0
      monthsToAdd = cycle === 'quarterly' ? 3 : cycle === 'annually' || cycle === 'yearly' ? 12 : 1
    }

    const ussdCode = generateUssdCode()

    const now = new Date()
    periodEnd.setMonth(periodEnd.getMonth() + monthsToAdd)
    const nextRenewal = new Date(periodEnd)

    const { rows: existing } = await query('SELECT id FROM subscriptions WHERE business_id = $1 ORDER BY created_at DESC LIMIT 1', [businessId])

    let result
    if (existing.length) {
      const { rows: updated } = await query(
        `UPDATE subscriptions SET plan = $1, plan_id = $12, billing_cycle = $10, discount_percent = $11, status = 'pending', payment_method = $2, phone_number = $3,
         ussd_code = $4, amount_paid = $5, start_date = $6, current_period_end = $7, next_renewal_date = $8,
         expiration_date = $7, payment_status = 'pending', is_active = FALSE, receipt_generated = 0,
         remaining_days = $9
         WHERE id = $13 RETURNING *`,
        [planName, normalizedMethod, phoneNumber, ussdCode, amount, now, periodEnd, nextRenewal, monthsToAdd * 30, cycle, discountPercent, selectedPlan?.id || null, existing[0].id]
      )
      result = updated[0]
    } else {
      const { rows: inserted } = await query(
        `INSERT INTO subscriptions (business_id, plan_id, plan, billing_cycle, discount_percent, status, payment_method, phone_number, ussd_code,
         amount_paid, start_date, current_period_end, next_renewal_date, expiration_date,
         payment_status, is_active, remaining_days)
         VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8, $9, $10, $11, $12, $11, 'pending', FALSE, $13) RETURNING *`,
        [businessId, selectedPlan?.id || null, planName, cycle, discountPercent, normalizedMethod, phoneNumber, ussdCode, amount, now, periodEnd, nextRenewal, monthsToAdd * 30]
      )
      result = inserted[0]
    }

    await logAudit({
      userId: req.user.id,
      actorName: req.user.full_name || req.user.email,
      action: `Selected ${planName} subscription plan for ${amount} (${discountPercent}% off) via ${normalizedMethod}`,
      targetModule: 'Subscription',
      ipAddress: getClientIp(req),
      businessId: req.user?.businessId,
    })

    res.json({
      id: result.id,
      plan: result.plan,
      billingCycle: result.billing_cycle,
      discountPercent,
      amount,
      paymentMethod: normalizedMethod,
      phoneNumber,
      ussdCode,
      periodEnd,
      nextRenewalDate: nextRenewal,
      message: `Please dial ${ussdCode} on ${phoneNumber} to complete payment of ${amount}`,
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// POST /api/v1/owner/subscription/verify-payment
export async function verifySubscriptionPayment(req, res) {
  try {
    const { ussdCode } = req.body
    if (!ussdCode) {
      return res.status(400).json({ error: 'USSD code is required for verification.' })
    }

    const { rows } = await query(
      `SELECT * FROM subscriptions WHERE ussd_code = $1 ORDER BY created_at DESC LIMIT 1`,
      [ussdCode]
    )

    if (!rows.length) {
      return res.status(404).json({ error: 'Subscription not found with this USSD code.' })
    }

    const sub = rows[0]

    // Verify payment (in production this would check with the payment provider)
    const receiptNumber = generateReceiptNumber()
    const now = new Date()
    const remainingDays = sub.remaining_days || 30

    const { rows: updated } = await query(
      `UPDATE subscriptions SET payment_status = 'verified', status = 'active', is_active = TRUE,
       receipt_number = $1, receipt_generated = 1
       WHERE id = $2 RETURNING *`,
      [receiptNumber, sub.id]
    )

    if (sub.business_id) {
      await query('UPDATE businesses SET is_verified = TRUE WHERE id = $1', [sub.business_id])
    }

    // Record the payment in platform_payments for platform admin control
    const transactionId = 'SUB-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(3).toString('hex').toUpperCase()
    await query(
      `INSERT INTO platform_payments (business_id, subscription_id, plan, billing_cycle, amount, payment_method, transaction_id, status, paid_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'paid', NOW())`,
      [sub.business_id, sub.id, sub.plan, sub.billing_cycle, sub.amount_paid, sub.payment_method, transactionId]
    )

    // Send subscription activation emails after successful verification
    try {
      const { rows: bizData } = await query(
        `SELECT b.name AS business_name, b.contact_email,
                u.full_name AS owner_name, u.email AS owner_email
         FROM businesses b
         LEFT JOIN users u ON u.business_id = b.id AND u.role = 'owner'
         WHERE b.id = $1
         LIMIT 1`,
        [sub.business_id]
      )
      if (bizData.length) {
        const b = bizData[0]
        sendSubscriptionActivation({
          businessName: b.business_name,
          ownerName: b.owner_name || 'Business Owner',
          ownerEmail: b.owner_email || b.contact_email,
          planName: sub.plan || 'N/A',
          activationDate: new Date().toLocaleDateString(),
          expiryDate: sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString() : 'N/A',
          amount: sub.amount_paid,
          businessId: sub.business_id,
        }).catch(err => console.error('Failed to send subscription activation email:', err.message))

        sendAdminSubscriptionActivation({
          businessName: b.business_name,
          ownerName: b.owner_name || 'Business Owner',
          ownerEmail: b.owner_email || b.contact_email,
          planName: sub.plan || 'N/A',
          amount: sub.amount_paid,
          businessId: sub.business_id,
        }).catch(err => console.error('Failed to send admin subscription activation email:', err.message))
      }
    } catch (emailErr) {
      console.error('Failed to prepare subscription activation emails:', emailErr.message)
    }

    await logAudit({
      userId: req.user.id,
      actorName: req.user.full_name || req.user.email,
      action: `Verified subscription payment. Receipt: ${receiptNumber}`,
      targetModule: 'Subscription',
      ipAddress: getClientIp(req),
      businessId: req.user?.businessId,
    })

    res.json({
      message: 'Payment verified successfully!',
      receiptNumber,
      plan: sub.plan,
      amount: Number(sub.amount_paid),
      startDate: sub.start_date,
      endDate: sub.current_period_end,
      remainingDays,
      nextRenewalDate: sub.next_renewal_date,
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// GET /api/v1/owner/subscription/receipt
export async function getReceipt(req, res) {
  try {
    const businessId = req.user?.businessId
    if (!businessId) {
      return res.status(400).json({ error: 'No business associated with this account.' })
    }

    const { rows } = await query(
      `SELECT s.*, b.name AS business_name
       FROM subscriptions s
       LEFT JOIN businesses b ON b.id = s.business_id
       WHERE s.receipt_generated = 1 AND s.business_id = $1
       ORDER BY s.created_at DESC LIMIT 1`,
      [businessId]
    )

    if (!rows.length) {
      return res.status(404).json({ error: 'No receipt found.' })
    }

    const sub = rows[0]
    res.json({
      receiptNumber: sub.receipt_number,
      businessName: sub.business_name || 'N/A',
      plan: sub.plan,
      amount: Number(sub.amount_paid),
      paymentMethod: sub.payment_method,
      phoneNumber: sub.phone_number,
      startDate: sub.start_date,
      endDate: sub.current_period_end,
      paymentStatus: sub.payment_status,
      generatedAt: sub.updated_at || sub.created_at,
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// POST /api/v1/owner/subscription/renew
export async function renewSubscription(req, res) {
  try {
    const { plan, planId, paymentAmount, billingCycle } = req.body
    if (!plan && !planId) {
      return res.status(400).json({ error: 'Plan type is required.' })
    }

    const now = new Date()

    let selectedPlan = null
    if (planId) {
      const { rows } = await query('SELECT * FROM subscription_plans WHERE id = $1 AND is_active = TRUE', [planId])
      selectedPlan = rows[0]
    } else if (plan) {
      const { rows } = await query('SELECT * FROM subscription_plans WHERE LOWER(name) = $1 AND is_active = TRUE', [String(plan).toLowerCase()])
      selectedPlan = rows[0]
    }

    let amount, monthsToAdd, cycle, discountPercent
    if (selectedPlan) {
      cycle = String(billingCycle || 'monthly').toLowerCase()
      const monthlyPrice = Number(selectedPlan.price_monthly) || 0
      if (cycle === 'quarterly') {
        monthsToAdd = 3
        discountPercent = Number(selectedPlan.discount_quarterly ?? 8)
        amount = Math.round(monthlyPrice * 3 * (1 - discountPercent / 100))
      } else if (cycle === 'annually' || cycle === 'yearly') {
        monthsToAdd = 12
        discountPercent = Number(selectedPlan.discount_annually ?? 14)
        amount = Number(selectedPlan.price_yearly) || Math.round(monthlyPrice * 12 * (1 - discountPercent / 100))
      } else {
        monthsToAdd = 1
        discountPercent = 0
        amount = monthlyPrice
      }
    } else {
      amount = Number(paymentAmount) || 0
      monthsToAdd = 1
      cycle = 'monthly'
      discountPercent = 0
    }
    const planName = selectedPlan ? selectedPlan.name : plan

    const businessId = req.user?.businessId
    if (!businessId) {
      return res.status(400).json({ error: 'No business associated with this account.' })
    }

    const { rows: activeRows } = await query(
      `SELECT current_period_end
       FROM subscriptions
       WHERE business_id = $1 AND is_active = TRUE AND payment_status = 'verified'
       ORDER BY current_period_end DESC NULLS LAST
       LIMIT 1`,
      [businessId]
    )
    const renewalStart = activeRows[0]?.current_period_end && new Date(activeRows[0].current_period_end) > now
      ? new Date(activeRows[0].current_period_end)
      : now
    const periodEnd = new Date(renewalStart)
    periodEnd.setMonth(periodEnd.getMonth() + monthsToAdd)

    // Keep the verified subscription live until the pending renewal is approved.
    const { rows } = await query(
      `INSERT INTO subscriptions (business_id, plan_id, plan, billing_cycle, discount_percent, amount_paid,
                                  status, is_active, payment_status, start_date, current_period_end,
                                  expiration_date, next_renewal_date, remaining_days)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', FALSE, 'pending', $7, $8, $8, $8, $9)
       RETURNING id, plan, billing_cycle, discount_percent, amount_paid, status, current_period_end, next_renewal_date`,
      [businessId, selectedPlan?.id || null, planName, cycle, discountPercent, amount, renewalStart, periodEnd, monthsToAdd * 30]
    )

    await logAudit({
      userId: req.user.id,
      actorName: req.user.full_name || req.user.email,
      action: `Renewed subscription to ${plan} plan for ${amount} (${discountPercent}% off)`,
      targetModule: 'Subscription',
      ipAddress: getClientIp(req),
      businessId: req.user?.businessId,
    })

    res.status(201).json(rows[0])
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function getAvailableSubscriptionPlans(_req, res) {
  try {
    const { rows } = await query(
      `SELECT id, name, description, price_monthly, price_yearly, discount_quarterly,
              discount_annually, features
       FROM subscription_plans
       WHERE is_active = TRUE
       ORDER BY created_at DESC`
    )
    res.json(rows.map((p) => ({
      id: p.id, name: p.name, description: p.description || '',
      priceMonthly: Number(p.price_monthly) || 0, priceYearly: Number(p.price_yearly) || 0,
      discountQuarterly: Number(p.discount_quarterly ?? 8), discountAnnually: Number(p.discount_annually ?? 14),
      features: p.features || [],
    })))
  } catch (error) { res.status(500).json({ error: error.message }) }
}

// ──────────────────────────────────────────────
//  10. Branch & Inventory overview (for Owner)
// ──────────────────────────────────────────────

// GET /api/v1/owner/inventory
export async function getGlobalInventory(req, res) {
  try {
    const { rows } = await query(
      `SELECT inv.id, inv.name, inv.sku, inv.quantity, inv.cost_price, inv.selling_price,
              inv.min_stock_level, inv.unit, inv.expiry_date,
              b.name AS branch_name, b.id AS branch_id,
              inv.created_at, inv.updated_at
       FROM inventory inv
       LEFT JOIN branches b ON b.id = inv.branch_id
       ORDER BY inv.name ASC`
    )

    res.json(
      rows.map((item) => ({
        id: item.id,
        name: item.name,
        sku: item.sku,
        quantity: Number(item.quantity) || 0,
        costPrice: Number(item.cost_price) || 0,
        sellingPrice: Number(item.selling_price) || 0,
        minStockLevel: Number(item.min_stock_level) || 0,
        unit: item.unit || 'units',
        expiryDate: item.expiry_date ? new Date(item.expiry_date).toISOString() : null,
        branch: item.branch_name || 'Main',
        branchId: item.branch_id,
        lowStock: Number(item.quantity) <= Number(item.min_stock_level),
        createdAt: item.created_at ? new Date(item.created_at).toISOString() : null,
      }))
    )
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// GET /api/v1/owner/inventory/movements
export async function getStockMovements(req, res) {
  try {
    const { rows } = await query(
      `SELECT sa.id, sa.inventory_id, inv.name AS item_name, sa.adjustment_type, sa.quantity,
              sa.reason, sa.created_at,
              u.full_name AS adjusted_by, b.name AS branch_name
       FROM stock_adjustments sa
       JOIN inventory inv ON inv.id = sa.inventory_id
       JOIN users u ON u.id = sa.adjusted_by
       LEFT JOIN branches b ON b.id = inv.branch_id
       ORDER BY sa.created_at DESC
       LIMIT 100`
    )

    res.json(
      rows.map((m) => ({
        id: m.id,
        inventoryId: m.inventory_id,
        itemName: m.item_name,
        adjustmentType: m.adjustment_type,
        quantity: Number(m.quantity) || 0,
        reason: m.reason || '',
        adjustedBy: m.adjusted_by,
        branch: m.branch_name || 'Main',
        timestamp: new Date(m.created_at).toISOString(),
      }))
    )
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// ──────────────────────────────────────────────
//  11. System Settings (Enhanced with Backup, Permissions, Security)
// ──────────────────────────────────────────────

// GET /api/v1/owner/settings
export async function getSystemSettings(req, res) {
  try {
    const businessId = req.user?.businessId
    const { rows: business } = await query('SELECT * FROM businesses WHERE id = $1', [businessId])
    const { rows: subscription } = await query(
      'SELECT * FROM subscriptions WHERE business_id = $1 ORDER BY created_at DESC LIMIT 1',
      [businessId]
    )
    const { rows: branches } = await query('SELECT id, name FROM branches WHERE business_id = $1 ORDER BY name', [businessId])
    const { rows: settings } = await query('SELECT * FROM system_settings ORDER BY setting_group, setting_key')
    const { rows: platformSettings } = await query(
      `SELECT setting_key, setting_value FROM platform_settings
       WHERE setting_key IN (
         'subscription_monthly_price', 'subscription_quarterly_price', 'subscription_annually_price',
         'subscription_quarterly_discount', 'subscription_annually_discount',
         'alert_before_expiry_days'
       )`
    )
    const { rows: distinctRoles } = await query(
      `SELECT DISTINCT role FROM users WHERE business_id = $1 ORDER BY role`,
      [businessId]
    )
    const roleNames = distinctRoles.map((r) => r.role).filter(Boolean)
    await importMissingRolePermissions(roleNames, businessId)

    const { rows: permissions } = await query('SELECT * FROM role_permissions WHERE business_id = $1 ORDER BY role', [businessId])
    const { rows: backups } = await query(
      'SELECT * FROM backup_records WHERE business_id = $1 ORDER BY created_at DESC LIMIT 20',
      [businessId]
    )

    // Flatten settings into a single key/value map (frontend reads settings.<key> directly).
    const flatSettings = {}
    settings.forEach((s) => { flatSettings[s.setting_key] = s.setting_value })

    // Override subscription pricing with platform settings managed by super admin.
    const platformMap = {}
    platformSettings.forEach((s) => { platformMap[s.setting_key] = s.setting_value })
    const subscriptionKeys = [
      'subscription_monthly_price', 'subscription_quarterly_price', 'subscription_annually_price',
      'subscription_quarterly_discount', 'subscription_annually_discount', 'alert_before_expiry_days',
    ]
    for (const k of subscriptionKeys) {
      if (platformMap[k] !== undefined) flatSettings[k] = platformMap[k]
    }

    // Ensure the super-admin-editable subscription defaults are always present.
    const settingDefaults = {
      subscription_monthly_price: '50000',
      subscription_quarterly_price: '130000',
      subscription_annually_price: '480000',
      subscription_quarterly_discount: '8',
      subscription_annually_discount: '14',
    }
    for (const [k, v] of Object.entries(settingDefaults)) {
      if (flatSettings[k] === undefined) flatSettings[k] = v
    }

    res.json({
      business: business.length
        ? {
            id: business[0].id,
            name: business[0].name,
            address: business[0].address || '',
            phone: business[0].phone || '',
            email: business[0].email || '',
            currency: business[0].currency || 'RWF',
            taxRate: Number(business[0].tax_rate) || 18,
          }
        : null,
      subscription: subscription.length
        ? {
            plan: subscription[0].plan,
            status: subscription[0].status,
            periodEnd: subscription[0].current_period_end,
            paymentStatus: subscription[0].payment_status,
          }
        : null,
      branches: branches.map((b) => ({ id: b.id, name: b.name })),
      settings: flatSettings,
      permissions: permissions.map((p) => ({
        role: p.role,
        canWithdraw: p.can_withdraw === 1,
        canTransfer: p.can_transfer === 1,
        canManageUsers: p.can_manage_users === 1,
        canViewRevenue: p.can_view_revenue === 1,
        canManageSettings: p.can_manage_settings === 1,
        canViewWithdrawLogs: p.can_view_withdraw_logs === 1,
        canViewTransferLogs: p.can_view_transfer_logs === 1,
        canApproveTransfers: p.can_approve_transfers === 1,
      })),
      backups: backups.map((b) => ({
        id: b.id,
        backupName: b.backup_name,
        backupType: b.backup_type,
        fileSize: b.file_size,
        status: b.status,
        createdAt: new Date(b.created_at).toISOString(),
      })),
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// PUT /api/v1/owner/settings
export async function updateSystemSettings(req, res) {
  try {
    const businessId = req.user?.businessId
    const { name, address, phone, email, currency, taxRate, settings } = req.body

    // Update business info
    const fields = []
    const params = []
    let idx = 1

    if (name !== undefined) { fields.push(`name = $${idx++}`); params.push(name) }
    if (address !== undefined) { fields.push(`address = $${idx++}`); params.push(address) }
    if (phone !== undefined) { fields.push(`phone = $${idx++}`); params.push(phone) }
    if (email !== undefined) { fields.push(`email = $${idx++}`); params.push(email) }
    if (currency !== undefined) { fields.push(`currency = $${idx++}`); params.push(currency) }
    if (taxRate !== undefined) { fields.push(`tax_rate = $${idx++}`); params.push(taxRate) }

    if (fields.length) {
      await query(
        `UPDATE businesses SET ${fields.join(', ')} WHERE id = $${idx}`,
        [...params, businessId]
      )
    }

          // Subscription/global keys are routed to platform_settings so all dashboards share one source of truth.
     if (settings && typeof settings === 'object') {
       const subscriptionKeys = new Set([
         'subscription_monthly_price', 'subscription_quarterly_price', 'subscription_annually_price',
         'subscription_quarterly_discount', 'subscription_annually_discount',
         'auto_renewal', 'alert_before_expiry_days',
       ])
       if (Object.keys(settings).some((key) => subscriptionKeys.has(key))) {
         return res.status(403).json({ error: 'Subscription plans and platform renewal settings can only be changed by the platform administrator.' })
       }
       const globalSettings = {}
       const localSettings = {}
       for (const [key, value] of Object.entries(settings)) {
         if (subscriptionKeys.has(key)) {
           globalSettings[key] = value
         } else {
           localSettings[key] = value
         }
       }

       if (Object.keys(localSettings).length > 0) {
         const groupFor = (key) => {
           if (key === 'max_login_attempts' || key === 'session_timeout') return 'security'
           return 'general'
         }
         for (const [key, value] of Object.entries(localSettings)) {
           const { rows: updatedRows } = await query(
             `UPDATE system_settings SET setting_value = $2, updated_at = NOW() WHERE setting_key = $1 RETURNING id`,
             [key, String(value)]
           )
           if (!updatedRows.length) {
             await query(
               `INSERT INTO system_settings (setting_key, setting_value, setting_group) VALUES ($1, $2, $3)`,
               [key, String(value), groupFor(key)]
             )
           }
         }
       }

       if (Object.keys(globalSettings).length > 0) {
         for (const [key, value] of Object.entries(globalSettings)) {
           const { rows: updatedRows } = await query(
             `UPDATE platform_settings SET setting_value = $2, updated_at = NOW() WHERE setting_key = $1 RETURNING id`,
             [key, String(value)]
           )
           if (!updatedRows.length) {
             await query(
               `INSERT INTO platform_settings (setting_key, setting_value, setting_group) VALUES ($1, $2, $3)`,
               [key, String(value), 'subscription']
             )
           }
         }

         const pricingKeys = [
           'subscription_monthly_price', 'subscription_quarterly_price', 'subscription_annually_price',
           'subscription_quarterly_discount', 'subscription_annually_discount',
         ]
         const hasPricingChange = pricingKeys.some((k) => globalSettings[k] !== undefined)

         if (hasPricingChange) {
           const { rows: priceRows } = await query(
             `SELECT setting_key, setting_value FROM platform_settings WHERE setting_key = ANY($1::text[])`,
             [pricingKeys],
           )
           const priceMap = {}
           priceRows.forEach((r) => { priceMap[r.setting_key] = parseFloat(r.setting_value) })

           const monthlyPrice = Number(priceMap.subscription_monthly_price) || 50000
           const quarterlyPrice = Number(priceMap.subscription_quarterly_price) || 130000
           const annuallyPrice = Number(priceMap.subscription_annually_price) || 480000
           const quarterlyDiscount = Number(priceMap.subscription_quarterly_discount) || 8
           const annuallyDiscount = Number(priceMap.subscription_annually_discount) || 14

           const monthlyAmount = Math.round(monthlyPrice)
           const quarterlyAmount = Math.round(quarterlyPrice * (1 - quarterlyDiscount / 100))
           const annuallyAmount = Math.round(annuallyPrice * (1 - annuallyDiscount / 100))

            await query(
              `UPDATE subscriptions SET
                amount_paid = CASE billing_cycle
                  WHEN 'monthly' THEN $1
                  WHEN 'quarterly' THEN $2
                  WHEN 'annually' THEN $3
                  WHEN 'yearly' THEN $3
                  ELSE amount_paid
                END,
                discount_percent = CASE billing_cycle
                  WHEN 'monthly' THEN 0
                  WHEN 'quarterly' THEN $4
                  WHEN 'annually' THEN $5
                  WHEN 'yearly' THEN $5
                  ELSE discount_percent
                END
               WHERE is_active = TRUE AND status = 'active'
                 AND business_id = $6`,
              [monthlyAmount, quarterlyAmount, annuallyAmount, quarterlyDiscount, annuallyDiscount, req.user.businessId],
            )
         }
       }
     }

await logAudit({
       userId: req.user.id,
       actorName: req.user.full_name || req.user.email,
       action: 'Updated system settings',
       targetModule: 'System Settings',
       ipAddress: getClientIp(req),
       businessId: req.user?.businessId,
     })

    res.json({ message: 'Settings updated successfully.' })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// POST /api/v1/owner/settings/backup
export async function triggerBackup(req, res) {
  try {
    const { backupName, backupType } = req.body
    const name = backupName || `backup_${new Date().toISOString().slice(0, 10)}`
    const type = backupType || 'full'
    const backupDir = path.resolve(process.cwd(), 'backend', 'database', 'backups')
    fs.mkdirSync(backupDir, { recursive: true })
    const backupPath = path.join(backupDir, `${name}_${Date.now()}.dump`)

    await createSqlBackup(backupPath)
    const fileSize = fs.statSync(backupPath).size

    const businessId = req.user?.businessId

    const { rows } = await query(
      `INSERT INTO backup_records (business_id, backup_name, backup_path, backup_type, file_size, status)
       VALUES ($1, $2, $3, $4, $5, 'completed') RETURNING *`,
      [businessId, name, backupPath, type, fileSize]
    )

    await logAudit({
      userId: req.user.id,
      actorName: req.user.full_name || req.user.email,
      action: `Triggered ${type} backup: ${name}`,
      targetModule: 'System Settings',
      ipAddress: getClientIp(req),
      businessId: req.user?.businessId,
    })

    res.json({
      message: 'Backup completed successfully.',
      backup: {
        id: rows[0].id,
        name: rows[0].backup_name,
        type: rows[0].backup_type,
        path: rows[0].backup_path,
        timestamp: new Date(rows[0].created_at).toISOString(),
      },
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// GET /api/v1/owner/settings/backups
export async function getBackups(req, res) {
  try {
    const businessId = req.user?.businessId
    const { rows } = await query(
      'SELECT * FROM backup_records WHERE business_id = $1 ORDER BY created_at DESC',
      [businessId]
    )

    res.json(rows.map((b) => ({
      id: b.id,
      backupName: b.backup_name,
      backupPath: b.backup_path,
      backupType: b.backup_type,
      fileSize: b.file_size,
      status: b.status,
      createdAt: new Date(b.created_at).toISOString(),
    })))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// POST /api/v1/owner/settings/restore-backup
export async function restoreBackup(req, res) {
  try {
    const businessId = req.user?.businessId
    const { backupId } = req.body
    if (!backupId) {
      return res.status(400).json({ error: 'Backup ID is required.' })
    }

    const { rows } = await query('SELECT * FROM backup_records WHERE id = $1 AND business_id = $2', [backupId, businessId])
    if (!rows.length) {
      return res.status(404).json({ error: 'Backup not found.' })
    }

    const backup = rows[0]
    if (!fs.existsSync(backup.backup_path)) {
      return res.status(404).json({ error: 'Backup file not found on disk.' })
    }

    await restoreSqlBackup(backup.backup_path)

    await logAudit({
      userId: req.user.id,
      actorName: req.user.full_name || req.user.email,
      action: `Restored backup: ${backup.backup_name}`,
      targetModule: 'System Settings',
      ipAddress: getClientIp(req),
      businessId: req.user?.businessId,
    })

    res.json({ message: `Backup "${backup.backup_name}" restored successfully.` })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// PUT /api/v1/owner/settings/permissions
export async function updatePermissions(req, res) {
  try {
    const { role, permissions } = req.body
    if (!role || !permissions) {
      return res.status(400).json({ error: 'Role and permissions are required.' })
    }

    const businessId = req.user?.businessId

    const canWithdraw = permissions.canWithdraw ? 1 : 0
    const canTransfer = permissions.canTransfer ? 1 : 0
    const canManageUsers = permissions.canManageUsers ? 1 : 0
    const canViewRevenue = permissions.canViewRevenue ? 1 : 0
    const canManageSettings = permissions.canManageSettings ? 1 : 0
    const canViewWithdrawLogs = permissions.canViewWithdrawLogs ? 1 : 0
    const canViewTransferLogs = permissions.canViewTransferLogs ? 1 : 0
    const canApproveTransfers = permissions.canApproveTransfers ? 1 : 0

    const { rows: existingRows } = await query(
      `SELECT id FROM role_permissions WHERE role = $1 AND business_id IS NOT DISTINCT FROM $2 LIMIT 1`,
      [role, businessId]
    )

    let rows
    if (existingRows.length) {
      ;({ rows } = await query(
        `UPDATE role_permissions
         SET can_withdraw = $3, can_transfer = $4, can_manage_users = $5,
             can_view_revenue = $6, can_manage_settings = $7,
             can_view_withdraw_logs = $8, can_view_transfer_logs = $9,
             can_approve_transfers = $10
         WHERE id = $1 AND role = $2
         RETURNING *`,
        [existingRows[0].id, role, canWithdraw, canTransfer, canManageUsers, canViewRevenue, canManageSettings, canViewWithdrawLogs, canViewTransferLogs, canApproveTransfers]
      ))
    } else {
      ;({ rows } = await query(
        `INSERT INTO role_permissions (role, business_id, can_withdraw, can_transfer, can_manage_users, can_view_revenue, can_manage_settings, can_view_withdraw_logs, can_view_transfer_logs, can_approve_transfers)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [role, businessId, canWithdraw, canTransfer, canManageUsers, canViewRevenue, canManageSettings, canViewWithdrawLogs, canViewTransferLogs, canApproveTransfers]
      ))
    }

    await logAudit({
      userId: req.user.id,
      actorName: req.user.full_name || req.user.email,
      action: `Updated permissions for ${role}`,
      targetModule: 'System Settings',
      ipAddress: getClientIp(req),
      businessId: req.user?.businessId,
    })

    res.json(rows[0])
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function importRolePermissions(req, res) {
  try {
    res.json(DEFAULT_ROLE_PERMISSIONS)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// ──────────────────────────────────────────────
//  12. Orders Oversight (QR + Waiter)
// ──────────────────────────────────────────────

// GET /api/v1/owner/orders/qr
export async function getQROrders(req, res) {
  try {
    const businessId = req.user?.businessId
    const { status } = req.query
    let sql = `SELECT o.id, o.order_number, o.table_number, o.order_type, o.status,
                    o.total_amount, o.subtotal, o.tax_amount, o.created_at,
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
             WHERE o.source = 'qr' AND o.business_id = $1`
    const params = [businessId]
    if (status) {
      sql += ` AND o.status = $${params.length + 1}`
      params.push(status)
    }
    sql += ' ORDER BY o.created_at DESC'

    const { rows } = await query(sql, params)
    res.json(
      rows.map((o) => ({
        id: o.id,
        orderNumber: o.order_number,
        tableNumber: o.table_number,
        orderType: o.order_type,
        status: o.status,
        total: Number(o.total_amount) || 0,
        subtotal: Number(o.subtotal || 0),
        tax: Number(o.tax_amount || 0),
        items: (o.items || []).map((item) => ({
          productId: item.productId,
          name: item.name,
          quantity: Number(item.quantity),
          price: Number(item.price),
          lineTotal: Number(item.lineTotal || item.price * item.quantity),
        })),
        createdAt: new Date(o.created_at).toISOString(),
      }))
    )
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// GET /api/v1/owner/waiters
export async function getWaiters(req, res) {
  try {
    const businessId = req.user?.businessId
    const { rows } = await query(
      `SELECT id, full_name AS name, email, phone, is_active
       FROM users
       WHERE role = 'waiter' AND business_id = $1
       ORDER BY full_name ASC`,
      [businessId]
    )
    res.json(
      rows.map((w) => ({
        id: w.id,
        name: w.name,
        email: w.email,
        phone: w.phone || '',
        active: w.is_active,
      }))
    )
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// GET /api/v1/owner/orders/waiter/:userId
export async function getWaiterOrders(req, res) {
  try {
    const businessId = req.user?.businessId
    const { userId } = req.params
    const { status } = req.query
    let sql = `SELECT o.id, o.order_number, o.table_number, o.status, o.total_amount, o.created_at,
                    o.source,
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
             WHERE o.user_id = $1 AND o.source = 'waiter' AND o.business_id = $2
    `
    const params = [userId, businessId]
    if (status) {
      sql += ` AND o.status = $${params.length + 1}`
      params.push(status)
    }
    sql += ' ORDER BY o.created_at DESC'

    const { rows } = await query(sql, params)
    const { rows: userRows } = await query(
      `SELECT full_name AS name FROM users WHERE id = $1 AND business_id = $2`,
      [userId, businessId]
    )
    const waiterName = userRows[0]?.name || 'Unknown'

    res.json({
      waiterId: userId,
      waiterName,
      orders: rows.map((o) => ({
        id: o.id,
        orderNumber: o.order_number,
        tableNumber: o.table_number,
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
      })),
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// GET /api/v1/owner/orders/:id/history
// Status lifecycle for an order (placement -> preparation -> ready -> served -> paid).
export async function getOrderHistory(req, res) {
  try {
    const { id } = req.params
    const { rows } = await query(
      `SELECT status, changed_by, note, changed_at
       FROM order_status_history
       WHERE order_id = $1
       ORDER BY changed_at ASC`,
      [id]
    )
    res.json(
      rows.map((h) => ({
        status: h.status,
        changedBy: h.changed_by,
        note: h.note,
      changedAt: new Date(h.changed_at).toISOString(),
    }))
  )
} catch (error) {
  res.status(500).json({ error: error.message })
}
}

// ──────────────────────────────────────────────
//  13. Payment Settings & QR Payments
// ──────────────────────────────────────────────

// GET /api/v1/owner/payment-settings
export async function getPaymentSettings(req, res) {
  try {
    const businessId = req.user?.businessId
    if (!businessId) {
      return res.json({
        qrPaymentEnabled: false,
        mtnMomoNumber: '',
        airtelMoneyNumber: '',
        merchantCode: '',
        bankAccount: '',
        merchantName: 'BarFlow Business',
      })
    }
    const { rows } = await query(
      `SELECT qr_payment_enabled, mtn_momo_number, airtel_money_number,
              merchant_code, bank_account, merchant_name
       FROM payment_settings
       WHERE business_id = $1`,
      [businessId]
    )
    if (!rows.length) {
      return res.json({
        qrPaymentEnabled: false,
        mtnMomoNumber: '',
        airtelMoneyNumber: '',
        merchantCode: '',
        bankAccount: '',
        merchantName: 'BarFlow Business',
      })
    }
    const s = rows[0]
    res.json({
      qrPaymentEnabled: s.qr_payment_enabled,
      mtnMomoNumber: s.mtn_momo_number || '',
      airtelMoneyNumber: s.airtel_money_number || '',
      merchantCode: s.merchant_code || '',
      bankAccount: s.bank_account || '',
      merchantName: s.merchant_name || 'BarFlow Business',
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// PUT /api/v1/owner/payment-settings
export async function updatePaymentSettings(req, res) {
  const { qrPaymentEnabled, mtnMomoNumber, airtelMoneyNumber, merchantCode, bankAccount, merchantName } = req.body
  try {
    const businessId = req.user?.businessId
    if (!businessId) {
      return res.status(400).json({ error: 'Business not found.' })
    }

    const existing = (await query('SELECT id FROM payment_settings WHERE business_id = $1', [businessId])).rows[0]
    if (existing) {
      await query(
        `UPDATE payment_settings SET
          qr_payment_enabled = COALESCE($1, qr_payment_enabled),
          mtn_momo_number = COALESCE($2, mtn_momo_number),
          airtel_money_number = COALESCE($3, airtel_money_number),
          merchant_code = COALESCE($4, merchant_code),
          bank_account = COALESCE($5, bank_account),
          merchant_name = COALESCE($6, merchant_name),
          updated_at = NOW()
         WHERE id = $7`,
        [qrPaymentEnabled, mtnMomoNumber, airtelMoneyNumber, merchantCode, bankAccount, merchantName, existing.id]
      )
    } else {
      await query(
        `INSERT INTO payment_settings (business_id, qr_payment_enabled, mtn_momo_number, airtel_money_number, merchant_code, bank_account, merchant_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [businessId, qrPaymentEnabled ?? false, mtnMomoNumber, airtelMoneyNumber, merchantCode, bankAccount, merchantName || 'BarFlow Business']
      )
    }

    await logAudit({
      actorName: req.user?.name || req.user?.email || 'Owner',
      action: `Updated payment settings. QR payments: ${qrPaymentEnabled ? 'enabled' : 'disabled'}`,
      targetModule: 'Payment',
      ipAddress: getClientIp(req),
      businessId: req.user?.businessId,
    })

    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// GET /api/v1/owner/qr-payment/:orderId
export async function generateQRPayment(req, res) {
  try {
    const { orderId } = req.params
    if (!orderId) {
      return res.status(400).json({ error: 'Order ID is required.' })
    }

    const businessId = req.user?.businessId
    const { rows: orderRows } = await query(
      `SELECT o.id, o.order_number, o.total_amount, o.table_number, b.name AS business_name
       FROM orders o
       JOIN businesses b ON b.id = o.business_id
       WHERE o.id = $1 AND o.business_id = $2`,
      [orderId, businessId]
    )
    if (!orderRows.length) {
      return res.status(404).json({ error: 'Order not found.' })
    }
    const order = orderRows[0]

    const { rows: psRows } = await query(
      `SELECT qr_payment_enabled, mtn_momo_number, airtel_money_number,
              merchant_code, bank_account, merchant_name
       FROM payment_settings
       WHERE business_id = $1`,
      [businessId]
    )
    const ps = psRows[0] || {}
    if (!ps.qr_payment_enabled) {
      return res.status(403).json({ error: 'QR payments are not enabled. Please enable them in Payment Settings.' })
    }

    const qrPayload = JSON.stringify({
      type: 'barflow_payment',
      merchant: ps.merchant_name || 'BarFlow Business',
      merchantCode: ps.merchant_code || '',
      mtnMomo: ps.mtn_momo_number || '',
      airtelMoney: ps.airtel_money_number || '',
      bankAccount: ps.bank_account || '',
      orderId: order.id,
      orderNumber: order.order_number,
      table: order.table_number,
      amount: Number(order.total_amount) || 0,
      currency: 'RWF',
    })

    const qrImage = await QRCode.toDataURL(qrPayload, {
      width: 600,
      margin: 2,
      color: { dark: '#0F172A', light: '#FFFFFF' },
    })

    res.json({
      qrImage,
      qrPayload,
      order: {
        id: order.id,
        orderNumber: order.order_number,
        total: Number(order.total_amount) || 0,
        tableNumber: order.table_number,
        merchantName: ps.merchant_name || 'BarFlow Business',
      },
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// POST /api/v1/owner/qr-payment/verify
export async function verifyQRPayment(req, res) {
  const { orderId, method, amount, reference } = req.body
  if (!orderId) {
    return res.status(400).json({ error: 'Order ID is required.' })
  }
  try {
    const businessId = req.user?.businessId
    const { rows } = await query(
      `INSERT INTO payments (order_id, received_by, method, amount, reference)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [orderId, req.user?.id || null, method || 'qr', amount, reference || `QR-${Date.now()}`]
    )
    await query(
      `UPDATE orders SET status = 'Paid', completed_at = NOW() WHERE id = $1 AND business_id = $2`,
      [orderId, businessId]
    )
    await query(
      `INSERT INTO order_status_history (order_id, status, changed_by, note)
       VALUES ($1, 'Paid', 'system', 'Payment completed via QR')`,
      [orderId]
    )
    res.status(201).json({ success: true, paymentId: rows[0].id })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// GET /api/v1/owner/qr-payment/merchant
export async function generateMerchantQRPayment(req, res) {
  try {
    const businessId = req.user?.businessId
    if (!businessId) {
      return res.status(400).json({ error: 'Business not found.' })
    }

    const { rows: psRows } = await query(
      `SELECT qr_payment_enabled, mtn_momo_number, airtel_money_number,
              merchant_code, bank_account, merchant_name
       FROM payment_settings
       WHERE business_id = $1`,
      [businessId]
    )
    const ps = psRows[0] || {}
    if (!ps.qr_payment_enabled) {
      return res.status(403).json({ error: 'QR payments are not enabled. Please enable them in Payment Settings.' })
    }

    const qrPayload = JSON.stringify({
      type: 'barflow_merchant',
      merchant: ps.merchant_name || 'BarFlow Business',
      merchantCode: ps.merchant_code || '',
      mtnMomo: ps.mtn_momo_number || '',
      airtelMoney: ps.airtel_money_number || '',
      bankAccount: ps.bank_account || '',
      currency: 'RWF',
    })

    const qrImage = await QRCode.toDataURL(qrPayload, {
      width: 600,
      margin: 2,
      color: { dark: '#0F172A', light: '#FFFFFF' },
    })

    res.json({
      qrImage,
      qrPayload,
      merchant: {
        name: ps.merchant_name || 'BarFlow Business',
        mtnMomo: ps.mtn_momo_number || '',
        airtelMoney: ps.airtel_money_number || '',
        merchantCode: ps.merchant_code || '',
        bankAccount: ps.bank_account || '',
      },
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}
