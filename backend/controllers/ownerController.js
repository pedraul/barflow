import { query, pool } from '../config/database.js'
import { awaitsAdminConfirmation, displayPhone, ensurePaymentCollectionSchema, payToText, PROVIDER_LABEL, shortReference } from '../services/subscriptionCollection.js'
import bcrypt from 'bcryptjs'
import { checkCanManageUser } from '../utils/staffPermissions.js'
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
import { getFinancialSummary } from '../services/financialSummaryService.js'
import { normalizePaymentMethods, readPaymentMethods } from '../utils/paymentMethods.js'
import { sealTransaction } from '../services/transactionLedger.js'
import { getBranchContext } from '../middleware/branchContext.js'
import { getTaxBreakdown } from '../utils/taxCalculator.js'
import { initiateSalaryPayout } from '../services/salaryPayoutService.js'
import { businessAccessBlock, ensureBusinessStatusSchema } from '../services/businessStatus.js'
import { clearFailedLogins, lockedMinutes, lockedResponse, recordFailedLogin, wrongPasswordMessage } from '../services/loginSecurity.js'
import { normalizeCycle, planForClient, priceFor } from '../services/subscriptionPricing.js'
import { appBaseUrl, passwordPolicyError, subscriptionPaymentOptions } from '../services/platformSettings.js'
import {
  createOutboundPayoutRequest,
  initiateOutboundPayout,
} from '../services/outboundPayoutService.js'
import {
  getMobileMoneyPaymentStatus,
  normalizeRwandaPhone,
  requestMobileMoneyPayment,
  validateMobileMoneyPayoutConfig,
} from '../services/mobileMoneyProviders.js'
import { businessAccess, forgetSubscriptionAccess, SUBSCRIPTION_BLOCKED_MESSAGE } from '../services/subscriptionAccess.js'

// ──────────────────────────────────────────────
// Helper: generate receipt number
// ──────────────────────────────────────────────
function generateReceiptNumber() {
  return 'RCP-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(3).toString('hex').toUpperCase()
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

    const lockMinutes = await lockedMinutes('user', email)
    if (lockMinutes) return lockedResponse(res, lockMinutes)

    await ensureBusinessStatusSchema().catch(() => {})
    const { rows } = await query(
      `SELECT u.*, b.name AS branch_name, bu.id AS business_id, bu.name AS business_name,
              bu.is_verified AS business_verified, bu.unpaid_access_granted,
              bu.is_suspended, COALESCE(bu.is_deactivated, FALSE) AS is_deactivated, bu.deactivated_by, bu.status_reason
       FROM users u
       LEFT JOIN branches b ON b.id = u.branch_id
       LEFT JOIN businesses bu ON bu.id = u.business_id
       WHERE u.email = $1 AND u.role = 'owner' AND u.is_active = TRUE
       LIMIT 1`,
      [email]
    )

    if (!rows.length) {
      const result = await recordFailedLogin('user', email)
      return res.status(401).json({ error: wrongPasswordMessage(result, 'Invalid credentials.') })
    }

    const user = rows[0]
    const passwordValid = await bcrypt.compare(password, user.password_hash)
    if (!passwordValid) {
      const result = await recordFailedLogin('user', email, user.business_id)
      return res.status(401).json({ error: wrongPasswordMessage(result, 'Invalid credentials.') })
    }
    await clearFailedLogins('user', email)

    const blocked = businessAccessBlock(user, 'owner')
    if (blocked) {
      return res.status(blocked.status).json({ error: blocked.error, code: blocked.code, reason: blocked.reason })
    }

    let subscriptionStatus = 'active'
    let subscriptionExpired = false
    const unpaidAccessGranted = user.unpaid_access_granted === true
    const access = user.business_id ? await businessAccess(user.business_id, unpaidAccessGranted) : { viaSubscription: false, viaAdminAccess: false }
    const businessVerified = access.viaSubscription
    if (access.viaSubscription) {
      subscriptionStatus = 'verified_access'
    } else if (access.viaAdminAccess) {
      subscriptionStatus = 'access_granted'
    } else if (user.business_id) {
      subscriptionExpired = true
    }

    if (subscriptionExpired && String(user.role).toLowerCase() !== 'owner') {
      return res.status(403).json({
        error: SUBSCRIPTION_BLOCKED_MESSAGE,
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
      unpaidAccessGranted,
      businessVerified,
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
        unpaidAccessGranted,
        businessVerified,
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
    const { role, status, branch, branchId } = req.query
    const scope = await getBranchContext(req, { requestedBranchId: branchId || branch, allowOwnerAll: true })
    let sql = `SELECT u.id, u.full_name, u.email, u.username, u.role, u.is_active, u.salary, u.last_login, u.phone,
                      b.name AS branch_name, b.id AS branch_id
               FROM users u
               LEFT JOIN branches b ON b.id = u.branch_id
               WHERE u.business_id = $1${scope.branchId ? ' AND u.branch_id = $2' : ''}`
    const params = scope.branchId ? [scope.businessId, scope.branchId] : [scope.businessId]

    if (role) {
      sql += ` AND u.role = $${params.length + 1}`
      params.push(role)
    }
    if (status) {
      sql += ` AND u.is_active = $${params.length + 1}`
      params.push(status === 'active')
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
    res.status(error.statusCode || 500).json({ error: error.message })
  }
}

// POST /api/v1/owner/users
export async function createUser(req, res) {
  try {
    const { username, fullName, email, password, role, branch, salary, phone, isActive = true } = req.body
    const allowedRoles = new Set(['manager', 'accountant', 'waiter', 'kitchen', 'bar', 'operator'])
    if (!fullName || !email || !password || !role) {
      return res.status(400).json({ error: 'Name, email, password, and role are required.' })
    }
    if (!allowedRoles.has(String(role).toLowerCase())) {
      return res.status(400).json({ error: 'Only non-owner business roles can be assigned to a branch.' })
    }
    const passwordProblem = await passwordPolicyError(password)
    if (passwordProblem) return res.status(400).json({ error: passwordProblem })

    const businessId = req.user?.businessId
    if (!businessId) {
      return res.status(400).json({ error: 'No business associated with this account.' })
    }

    const passwordHash = await bcrypt.hash(password, 10)

    let branchId = null
    const { rows: activeBranches } = await query(
      `SELECT id, name FROM branches
       WHERE business_id = $1 AND COALESCE(is_active, TRUE) = TRUE
       ORDER BY created_at ASC`,
      [businessId]
    )
    if (branch && String(branch).trim()) {
      const requestedBranch = String(branch).trim().toLowerCase()
      const existingBranch = activeBranches.find((item) =>
        item.id === branch || item.name.trim().toLowerCase() === requestedBranch
      )
      if (existingBranch) {
        branchId = existingBranch.id
      } else if (activeBranches.length) {
        return res.status(400).json({ error: 'Selected branch was not found in this business.' })
      }
    }
    if (!branchId && activeBranches.length) {
      return res.status(400).json({ error: 'A branch is required for this user role.' })
    }
    if (!branchId) {
      const { rows: mainBranch } = await query(
        `INSERT INTO branches (business_id, name)
         VALUES ($1, 'Main Branch')
         RETURNING id`,
        [businessId]
      )
      branchId = mainBranch[0].id
      await query(
        `INSERT INTO branch_stock (branch_id, product_id, quantity, updated_at)
         SELECT $1, p.id, COALESCE(p.quantity, 0), NOW()
         FROM products p
         WHERE p.business_id = $2
         ON CONFLICT (branch_id, product_id) DO NOTHING`,
        [branchId, businessId]
      )
    }

    const { rows } = await query(
      `INSERT INTO users (business_id, username, full_name, email, password_hash, role, branch_id, salary, phone, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id, full_name, email, username, role, phone, salary, is_active`,
      [businessId, username || null, fullName, email, passwordHash, role, branchId, salary || 0, phone || '', isActive !== false]
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
    const allowedRoles = new Set(['manager', 'accountant', 'waiter', 'kitchen', 'bar', 'operator'])
    if (role !== undefined && !allowedRoles.has(String(role).toLowerCase())) {
      return res.status(400).json({ error: 'Only non-owner business roles can be assigned to a branch.' })
    }

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
      const businessId = req.user?.businessId
      const { rows: existingBranch } = await query(
        `SELECT id FROM branches
         WHERE business_id = $1 AND COALESCE(is_active, TRUE) = TRUE
           AND (id::text = $2 OR LOWER(name) = LOWER($2))
         LIMIT 1`,
        [businessId, String(branch).trim()]
      )
      if (!existingBranch.length) return res.status(400).json({ error: 'Selected branch was not found in this business.' })
      fields.push(`branch_id = $${idx++}`)
      params.push(existingBranch[0].id)
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
  const client = await pool.connect()
  try {
    const { id } = req.params
    const businessId = req.user?.businessId
    await client.query('BEGIN')
    const { rows } = await client.query('SELECT id, full_name FROM users WHERE id = $1 AND business_id = $2 FOR UPDATE', [id, businessId])
    if (!rows.length) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'User not found.' })
    }

    const { rows: orderReferences } = await client.query(
      `SELECT EXISTS (
         SELECT 1 FROM orders
         WHERE user_id = $1 OR waiter_id = $1
       ) AS has_orders`,
      [id]
    )
    if (orderReferences[0].has_orders) {
      await client.query(
        'UPDATE users SET is_active = FALSE, updated_at = NOW() WHERE id = $1 AND business_id = $2',
        [id, businessId]
      )
      await logAudit({
        userId: req.user.id,
        actorName: req.user.full_name || req.user.email,
        action: `Deactivated user ${rows[0].full_name} because linked orders must be retained`,
        targetModule: 'Staff Management',
        ipAddress: getClientIp(req),
        businessId,
      })
      await client.query('COMMIT')
      return res.json({
        deactivated: true,
        message: `${rows[0].full_name} has orders, so the account was deactivated instead of deleted.`,
      })
    }

    const { rows: requiredReferences } = await client.query(
      `SELECT DISTINCT kcu.table_name, kcu.column_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
       JOIN information_schema.constraint_column_usage ccu
         ON tc.constraint_name = ccu.constraint_name
        AND tc.table_schema = ccu.table_schema
       JOIN information_schema.columns cols
         ON cols.table_schema = kcu.table_schema
        AND cols.table_name = kcu.table_name
        AND cols.column_name = kcu.column_name
       WHERE tc.constraint_type = 'FOREIGN KEY'
         AND ccu.table_schema = 'public'
         AND ccu.table_name = 'users'
         AND ccu.column_name = 'id'
         AND cols.is_nullable = 'NO'`
    )

    for (const reference of requiredReferences) {
      const table = reference.table_name.replace(/"/g, '""')
      const column = reference.column_name.replace(/"/g, '""')
      const { rows: matches } = await client.query(
        `SELECT EXISTS (SELECT 1 FROM "${table}" WHERE "${column}" = $1) AS referenced`,
        [id]
      )
      if (!matches[0].referenced) continue

      await client.query(
        'UPDATE users SET is_active = FALSE, updated_at = NOW() WHERE id = $1 AND business_id = $2',
        [id, businessId]
      )
      await logAudit({
        userId: req.user.id,
        actorName: req.user.full_name || req.user.email,
        action: `Deactivated user ${rows[0].full_name} because linked records must be retained`,
        targetModule: 'Staff Management',
        ipAddress: getClientIp(req),
        businessId,
      })
      await client.query('COMMIT')
      return res.json({
        deactivated: true,
        message: `${rows[0].full_name} has order or other required history, so the account was deactivated instead of deleted.`,
      })
    }

    // Detach nullable foreign-key references before permanently deleting the account.
    const { rows: references } = await client.query(
      `SELECT DISTINCT kcu.table_name, kcu.column_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
       JOIN information_schema.constraint_column_usage ccu
         ON tc.constraint_name = ccu.constraint_name
        AND tc.table_schema = ccu.table_schema
       JOIN information_schema.columns cols
         ON cols.table_schema = kcu.table_schema
        AND cols.table_name = kcu.table_name
        AND cols.column_name = kcu.column_name
       WHERE tc.constraint_type = 'FOREIGN KEY'
         AND ccu.table_schema = 'public'
         AND ccu.table_name = 'users'
         AND ccu.column_name = 'id'
         AND cols.is_nullable = 'YES'`
    )

    for (const reference of references) {
      const table = reference.table_name.replace(/"/g, '""')
      const column = reference.column_name.replace(/"/g, '""')
      await client.query(`UPDATE "${table}" SET "${column}" = NULL WHERE "${column}" = $1`, [id])
    }

    await client.query('DELETE FROM users WHERE id = $1 AND business_id = $2', [id, businessId])

    await logAudit({
      userId: req.user.id,
      actorName: req.user.full_name || req.user.email,
      action: `Permanently deleted user ${rows[0].full_name}`,
      targetModule: 'Staff Management',
      ipAddress: getClientIp(req),
      businessId: req.user?.businessId,
    })

    await client.query('COMMIT')
    res.json({ message: `User ${rows[0].full_name} was permanently deleted.` })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    if (error.code === '23503') {
      return res.status(409).json({ error: 'This user still has required records and cannot be permanently deleted.' })
    }
    res.status(500).json({ error: error.message })
  } finally {
    client.release()
  }
}

// PUT /api/v1/owner/users/:id/reset-password
export async function resetUserPassword(req, res) {
  try {
    const { id } = req.params
    const { newPassword } = req.body
    const passwordProblem = await passwordPolicyError(newPassword)
    if (passwordProblem) return res.status(400).json({ error: passwordProblem })

    // Owner: any account in the business. Granted staff: delegable roles in their branch.
    const denied = await checkCanManageUser(req, id)
    if (denied) return res.status(denied.status).json({ error: denied.error })

    const passwordHash = await bcrypt.hash(newPassword, 10)
    const { rows } = await query(
      `UPDATE users SET password_hash = $1 WHERE id = $2 AND business_id = $3 RETURNING id, full_name, email`,
      [passwordHash, id, req.user.businessId]
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
    const scope = await getBranchContext(req, { requestedBranchId: req.query.branchId, allowOwnerAll: true })
    const branchFilter = scope.branchId ? ' AND u.branch_id = $2' : ''
    const params = scope.branchId ? [scope.businessId, scope.branchId] : [scope.businessId]
    const { rows } = await query(
      `SELECT s.id, s.user_id, u.full_name AS user_name, u.email, u.role, u.phone,
              b.name AS branch_name, u.salary AS base_salary,
              s.gross_amount, s.tax_amount, s.insurance_amount, s.net_amount,
              s.amount, s.payment_date, s.paid_at, s.status, s.pay_period_start, s.pay_period_end,
              s.method, s.provider_status
         FROM salary_payments s
         JOIN users u ON u.id = s.user_id
         LEFT JOIN branches b ON b.id = u.branch_id
        WHERE u.business_id = $1${branchFilter}
         ORDER BY s.created_at DESC`,
      params
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
        paymentDate: r.paid_at || r.payment_date ? new Date(r.paid_at || r.payment_date).toISOString() : null,
        status: r.status || 'Pending',
        method: r.method || '',
        providerStatus: r.provider_status || null,
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
    const { method, payPeriodStart, payPeriodEnd } = req.body
    if (!['mtn_momo', 'airtel_money'].includes(method)) {
      return res.status(400).json({ error: 'Choose MTN MoMo or Airtel Money for payroll payouts.' })
    }
    validateMobileMoneyPayoutConfig(method)
    const scope = await getBranchContext(req, { requestedBranchId: req.body.branchId || req.query.branchId, allowOwnerAll: false })
    const { rows: employees } = await query(
      `SELECT id, full_name, salary, phone FROM users
       WHERE is_active = TRUE AND salary > 0 AND business_id = $1 AND branch_id = $2`,
      [scope.businessId, scope.branchId]
    )

    if (!employees.length) {
      return res.status(400).json({ error: 'No active employees with salary configured.' })
    }

    const periodStart = payPeriodStart || new Date().toISOString().slice(0, 10)
    const periodEnd = payPeriodEnd || new Date().toISOString().slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd) || periodStart > periodEnd) {
      return res.status(400).json({ error: 'Enter a valid pay period with the start date no later than the end date.' })
    }
    const results = []

    for (const emp of employees) {
      try {
        normalizeRwandaPhone(emp.phone)
      } catch (error) {
        results.push({ userId: emp.id, name: emp.full_name, status: 'failed', skipped: true, skipReason: 'invalid_phone', message: error.message })
        continue
      }
      const gross = Number(emp.salary) || 0
      const { grossAmount, taxAmount: tax, insuranceAmount: insurance, netAmount: net } = getTaxBreakdown(gross)
      if (net <= 0) {
        results.push({ userId: emp.id, name: emp.full_name, status: 'failed', skipped: true, skipReason: 'invalid_amount', message: 'Salary has no positive net amount after deductions.' })
        continue
      }

      const { rows: existingRows } = await query(
        `SELECT id, status FROM salary_payments
         WHERE user_id = $1 AND business_id = $2 AND branch_id = $3
           AND pay_period_start = $4 AND pay_period_end = $5
           AND status != 'rejected'
         LIMIT 1`,
        [emp.id, scope.businessId, scope.branchId, periodStart, periodEnd]
      )
      if (existingRows.length) {
        results.push({ userId: emp.id, name: emp.full_name, status: existingRows[0].status, skipped: true, skipReason: 'already_exists' })
        continue
      }

      const { rows: inserted } = await query(
        `INSERT INTO salary_payments
           (business_id, user_id, branch_id, name, phone, gross_amount, tax_amount,
            insurance_amount, net_amount, amount, method, actor, status,
            pay_period_start, pay_period_end)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, $10, $11, 'pending', $12, $13)
         RETURNING id`,
        [scope.businessId, emp.id, scope.branchId, emp.full_name, emp.phone || '', grossAmount, tax, insurance, net, method, req.user.full_name || req.user.email, periodStart, periodEnd]
      )
      const payout = await initiateSalaryPayout({
        salaryPaymentId: inserted[0].id,
        businessId: scope.businessId,
        branchId: scope.branchId,
        approverId: req.user.id,
      })
      results.push({ userId: emp.id, name: emp.full_name, gross, tax, insurance, net, paymentId: inserted[0].id, ...payout })
    }

    const notSent = results.filter((result) => !result.skipped && result.status === 'pending').length
    const initiated = results.filter((result) => !result.skipped && result.status !== 'pending').length
    const pending = results.filter((result) => !result.skipped && result.status === 'processing').length
    const paid = results.filter((result) => !result.skipped && result.status === 'Paid').length
    const failed = results.filter((result) => !result.skipped && result.status === 'failed').length
    const existing = results.filter((result) => result.skipReason === 'already_exists').length
    const invalidPhone = results.filter((result) => result.skipReason === 'invalid_phone').length
    const invalidAmount = results.filter((result) => result.skipReason === 'invalid_amount').length
    await logAudit({
      userId: req.user.id,
      actorName: req.user.full_name || req.user.email,
      action: `Started ${method} payroll payouts for ${initiated} employees (${paid} paid, ${pending} awaiting provider confirmation, ${failed} failed)`,
      targetModule: 'Payroll',
      ipAddress: getClientIp(req),
      businessId: req.user?.businessId,
    })

    res.status(201).json({
      message: `Started ${initiated} payroll payouts: ${paid} paid, ${pending} awaiting provider confirmation, ${notSent} not sent, and ${failed} failed. Skipped ${existing} existing payrolls, ${invalidPhone} employees with invalid phone numbers, and ${invalidAmount} salaries with no payable net amount.`,
      payments: results,
    })
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
    const { phoneNumber, purpose, amount, method } = req.body
    if (!phoneNumber || !purpose || !amount) {
      return res.status(400).json({ error: 'Phone number, purpose, and amount are required.' })
    }
    const payout = createOutboundPayoutRequest({ phone: phoneNumber, amount, method })

    const scope = await getBranchContext(req, { requestedBranchId: req.body.branchId || req.query.branchId, allowOwnerAll: false })

    const { rows } = await query(
      `INSERT INTO withdrawals (business_id, branch_id, phone_number, purpose, amount, initiated_by, status, payout_method)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7) RETURNING *`,
      [scope.businessId, scope.branchId, payout.phone, purpose, payout.amount, req.user.id, payout.method]
    )

    await logAudit({
      userId: req.user.id,
      actorName: req.user.full_name || req.user.email,
      action: `Created ${payout.method} withdrawal request of ${payout.amount} to ${payout.phone} (${purpose}) - pending manager approval`,
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
    const scope = await getBranchContext(req, { requestedBranchId: req.query.branchId, allowOwnerAll: true })
    const branchFilter = scope.branchId ? ' AND branch_id = $2' : ''
    const scopeParams = scope.branchId ? [scope.businessId, scope.branchId] : [scope.businessId]
    const page = Math.max(1, parseInt(req.query.page) || 1)
    const limit = Math.min(100, Math.max(10, parseInt(req.query.limit) || 50))
    const offset = (page - 1) * limit

    const { rows: countResult } = await query(`SELECT COUNT(*) AS total FROM withdrawals WHERE business_id = $1${branchFilter}`, scopeParams)
    const total = parseInt(countResult[0].total) || 0

    const { rows } = await query(
      `SELECT w.*, u.full_name AS initiated_by_name
       FROM withdrawals w
       LEFT JOIN users u ON u.id = w.initiated_by
      WHERE w.business_id = $1${branchFilter}
       ORDER BY w.created_at DESC
       LIMIT $2 OFFSET $3`,
      [...scopeParams, limit, offset]
    )

    res.json({
      withdrawals: rows.map((w) => ({
        id: w.id,
        phoneNumber: w.phone_number,
        purpose: w.purpose,
        amount: Number(w.amount),
        status: w.status,
        method: w.payout_method,
        payoutReference: w.payout_reference || null,
        providerStatus: w.provider_status || null,
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
    const { toPhone, amount, description, method } = req.body
    if (!amount) {
      return res.status(400).json({ error: 'Amount is required.' })
    }
    const payout = createOutboundPayoutRequest({ phone: toPhone, amount, method })

    const scope = await getBranchContext(req, { requestedBranchId: req.body.branchId || req.query.branchId, allowOwnerAll: false })

    // Resolve recipient by phone number (transfers are made to a phone)
    let toUserId = null
    let resolvedName = null
    if (payout.phone) {
      const { rows: users } = await query(
        'SELECT id, full_name FROM users WHERE phone = $1 AND business_id = $2 LIMIT 1',
        [payout.phone, scope.businessId]
      )
      if (users.length) {
        toUserId = users[0].id
        resolvedName = users[0].full_name
      }
    }

    const { rows } = await query(
      `INSERT INTO transfers (business_id, branch_id, from_user, to_user, to_phone, amount, description, status, payout_method)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8) RETURNING *`,
      [scope.businessId, scope.branchId, req.user.id, toUserId, payout.phone, payout.amount, description || '', payout.method]
    )

    await logAudit({
      userId: req.user.id,
      actorName: req.user.full_name || req.user.email,
      action: `Created ${payout.method} transfer of ${payout.amount} to ${resolvedName || payout.phone}`,
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
    const scope = await getBranchContext(req, { requestedBranchId: req.body.branchId || req.query.branchId, allowOwnerAll: false })

    let result
    if (action === 'approved') {
      result = await initiateOutboundPayout({
        type: 'transfer',
        payoutId: id,
        businessId: scope.businessId,
        branchId: scope.branchId,
        approverId: req.user.id,
      })
    } else {
      const { rows } = await query(
        `UPDATE transfers SET status = 'rejected', manager_approval = 1, manager_approved_by = $1, approved_at = NOW()
         WHERE id = $2 AND business_id = $3 AND branch_id = $4 AND status = 'pending' RETURNING *`,
        [req.user.id, id, scope.businessId, scope.branchId]
      )
      if (!rows.length) return res.status(404).json({ error: 'Pending transfer not found.' })
      result = rows[0]
    }

    await logAudit({
      userId: req.user.id,
      actorName: req.user.full_name || req.user.email,
      action: `${action === 'approved' ? 'Approved' : 'Rejected'} transfer ${id}`,
      targetModule: 'Transfers',
      ipAddress: getClientIp(req),
      businessId: req.user?.businessId,
    })

    res.json(result)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// GET /api/v1/owner/transfer/logs
export async function getTransferLogs(req, res) {
  try {
    const scope = await getBranchContext(req, { requestedBranchId: req.query.branchId, allowOwnerAll: true })
    const branchFilter = scope.branchId ? ' AND branch_id = $2' : ''
    const scopeParams = scope.branchId ? [scope.businessId, scope.branchId] : [scope.businessId]
    const page = Math.max(1, parseInt(req.query.page) || 1)
    const limit = Math.min(100, Math.max(10, parseInt(req.query.limit) || 50))
    const offset = (page - 1) * limit

    const { rows: countResult } = await query(`SELECT COUNT(*) AS total FROM transfers WHERE business_id = $1${branchFilter}`, scopeParams)
    const total = parseInt(countResult[0].total) || 0

    const { rows } = await query(
      `SELECT t.*, u1.full_name AS from_name, u2.full_name AS to_name, u3.full_name AS approved_by_name
       FROM transfers t
       LEFT JOIN users u1 ON u1.id = t.from_user
       LEFT JOIN users u2 ON u2.id = t.to_user
       LEFT JOIN users u3 ON u3.id = t.manager_approved_by
      WHERE t.business_id = $1${branchFilter}
       ORDER BY t.created_at DESC
       LIMIT $2 OFFSET $3`,
      [...scopeParams, limit, offset]
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
        method: t.payout_method,
        payoutReference: t.payout_reference || null,
        providerStatus: t.provider_status || null,
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

// An order counts as paid when its status is Paid, or when a payment for it
// completed (orders paid up front later move on to Served).
// Email notifications the owner can switch on/off (Settings → Notifications).
// Stored per business in system_settings; checked in emailNotificationService.
const OWNER_NOTIFICATION_KEYS = [
  'notify_registration',
  'notify_subscription_activation',
  'notify_expiry_reminder',
  'notify_subscription_expired',
  'notify_renewal_confirmation',
  'notify_account_suspended',
  'notify_account_reactivated',
]

const ORDER_IS_PAID_SQL = `(LOWER(BTRIM(o.status::text)) = 'paid' OR EXISTS (
  SELECT 1 FROM payments pay WHERE pay.order_id = o.id AND pay.paid_at IS NOT NULL
))`
const ORDER_NOT_CANCELLED_SQL = `LOWER(BTRIM(o.status::text)) NOT IN ('cancelled', 'canceled')`

// GET /api/v1/owner/revenue
export async function getRevenue(req, res) {
  try {
    const scope = await getBranchContext(req, { requestedBranchId: req.query.branchId, allowOwnerAll: true })
    const businessId = scope.businessId
    const branchFilter = scope.branchId ? ' AND branch_id = $2' : ''
    const branchParams = scope.branchId ? [businessId, scope.branchId] : [businessId]
    if (!businessId) {
      return res.json({
        revenueReceived: 0,
        revenueAwaiting: { orders: 0, value: 0 },
        stockAvailable: { items: 0, quantity: 0 },
        stockOrdered: { orders: 0, value: 0 },
        currentStockValue: 0,
        soldStockValue: 0,
      })
    }

    const orderBranchFilter = scope.branchId ? ' AND o.branch_id = $2' : ''
    const { rows: paymentTotals } = await query(
      `SELECT COALESCE(SUM(o.total_amount) FILTER (WHERE ${ORDER_IS_PAID_SQL}), 0) AS paid_value,
              COUNT(*) FILTER (WHERE NOT ${ORDER_IS_PAID_SQL}) AS awaiting_orders,
              COALESCE(SUM(o.total_amount) FILTER (WHERE NOT ${ORDER_IS_PAID_SQL}), 0) AS awaiting_value
       FROM orders o
       WHERE o.business_id = $1 AND ${ORDER_NOT_CANCELLED_SQL}${orderBranchFilter}`,
      branchParams
    )
    const { rows: refundTotals } = await query(
      `SELECT COALESCE(SUM(amount), 0) AS refunds
       FROM refunds
       WHERE business_id = $1 AND LOWER(BTRIM(status::text)) = 'approved'${branchFilter}`,
      branchParams
    )
    const revenueReceived = Math.max(0, Number(paymentTotals[0].paid_value) - Number(refundTotals[0].refunds))

    const { rows: stockAvailable } = await query(
      `SELECT COUNT(DISTINCT p.id) FILTER (WHERE bs.quantity > 0) AS total_items,
              COALESCE(SUM(bs.quantity), 0) AS total_quantity
       FROM branch_stock bs
       JOIN products p ON p.id = bs.product_id
       WHERE p.is_active = TRUE AND p.business_id = $1${scope.branchId ? ' AND bs.branch_id = $2' : ''}`,
      branchParams
    )

    const { rows: stockOrdered } = await query(
      `SELECT COUNT(*) AS total_orders, COALESCE(SUM(total_amount), 0) AS total_value FROM orders WHERE status = 'Open' AND business_id = $1${branchFilter}`,
      branchParams
    )

    const { rows: stockValue } = await query(
      `SELECT COALESCE(SUM(bs.quantity * p.cost_price), 0) AS total_value
       FROM branch_stock bs
       JOIN products p ON p.id = bs.product_id
       WHERE p.is_active = TRUE AND p.business_id = $1${scope.branchId ? ' AND bs.branch_id = $2' : ''}`,
      branchParams
    )

    const { rows: soldValue } = await query(
      `SELECT COALESCE(SUM(oi.quantity * p.selling_price), 0) AS total_value
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       JOIN orders o ON o.id = oi.order_id AND LOWER(BTRIM(o.status::text)) IN ('paid', 'served')
      WHERE o.business_id = $1${scope.branchId ? ' AND o.branch_id = $2' : ''}`,
          branchParams
    )

    res.json({
      revenueReceived,
      revenueAwaiting: {
        orders: Number(paymentTotals[0].awaiting_orders) || 0,
        value: Number(paymentTotals[0].awaiting_value) || 0,
      },
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

// GET /api/v1/owner/revenue/details?view=received|awaiting|stock|pending|stock-value|sold
// Records behind each card on the owner Revenue page.
export async function getRevenueDetails(req, res) {
  try {
    const scope = await getBranchContext(req, { requestedBranchId: req.query.branchId, allowOwnerAll: true })
    const businessId = scope.businessId
    const view = String(req.query.view || '')
    if (!businessId) return res.json({ view, kind: 'orders', rows: [] })

    const params = scope.branchId ? [businessId, scope.branchId] : [businessId]
    const orderBranch = scope.branchId ? ' AND o.branch_id = $2' : ''
    const stockBranch = scope.branchId ? ' AND bs.branch_id = $2' : ''

    const orderSelect = `SELECT o.id, o.order_number, o.status, o.total_amount, o.table_number,
            o.payment_method, o.created_at, b.name AS branch_name
       FROM orders o
       LEFT JOIN branches b ON b.id = o.branch_id`
    const orderViews = {
      received: `${ORDER_IS_PAID_SQL} AND ${ORDER_NOT_CANCELLED_SQL}`,
      awaiting: `NOT ${ORDER_IS_PAID_SQL} AND ${ORDER_NOT_CANCELLED_SQL}`,
      pending: `o.status = 'Open'`,
    }

    if (orderViews[view]) {
      const { rows } = await query(
        `${orderSelect}
         WHERE o.business_id = $1 AND ${orderViews[view]}${orderBranch}
         ORDER BY o.created_at DESC
         LIMIT 200`,
        params
      )
      return res.json({
        view,
        kind: 'orders',
        rows: rows.map((o) => ({
          id: o.id,
          orderNumber: o.order_number,
          status: o.status,
          total: Number(o.total_amount) || 0,
          tableNumber: o.table_number,
          paymentMethod: o.payment_method,
          branchName: o.branch_name,
          createdAt: o.created_at,
        })),
      })
    }

    if (view === 'stock' || view === 'stock-value') {
      const { rows } = await query(
        `SELECT p.id AS product_id, p.name, b.name AS branch_name, bs.quantity, p.cost_price, p.selling_price,
                bs.quantity * p.cost_price AS value
         FROM branch_stock bs
         JOIN products p ON p.id = bs.product_id
         LEFT JOIN branches b ON b.id = bs.branch_id
         WHERE p.is_active = TRUE AND p.business_id = $1${stockBranch}
           ${view === 'stock' ? 'AND bs.quantity > 0' : ''}
         ORDER BY ${view === 'stock' ? 'p.name' : 'value DESC'}
         LIMIT 500`,
        params
      )
      return res.json({
        view,
        kind: 'stock',
        rows: rows.map((r) => ({
          id: `${r.product_id}-${r.branch_name || ''}`,
          name: r.name,
          branchName: r.branch_name,
          quantity: Number(r.quantity) || 0,
          costPrice: Number(r.cost_price) || 0,
          sellingPrice: Number(r.selling_price) || 0,
          value: Number(r.value) || 0,
        })),
      })
    }

    if (view === 'sold') {
      const { rows } = await query(
        `SELECT p.id, p.name, SUM(oi.quantity) AS quantity, p.selling_price,
                SUM(oi.quantity * p.selling_price) AS value
         FROM order_items oi
         JOIN products p ON p.id = oi.product_id
         JOIN orders o ON o.id = oi.order_id AND LOWER(BTRIM(o.status::text)) IN ('paid', 'served')
         WHERE o.business_id = $1${orderBranch}
         GROUP BY p.id, p.name, p.selling_price
         ORDER BY value DESC
         LIMIT 500`,
        params
      )
      return res.json({
        view,
        kind: 'sold',
        rows: rows.map((r) => ({
          id: r.id,
          name: r.name,
          quantity: Number(r.quantity) || 0,
          price: Number(r.selling_price) || 0,
          value: Number(r.value) || 0,
        })),
      })
    }

    return res.status(400).json({ error: 'Unknown revenue view.' })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// GET /api/v1/owner/revenue/logs
export async function getRevenueLogs(req, res) {
  try {
    const scope = await getBranchContext(req, { requestedBranchId: req.query.branchId, allowOwnerAll: true })
    const businessId = scope.businessId
    const page = Math.max(1, parseInt(req.query.page) || 1)
    const limit = Math.min(100, Math.max(10, parseInt(req.query.limit) || 50))
    const offset = (page - 1) * limit
    if (!businessId) {
      return res.json({ logs: [], byMethod: [], totalPaid: 0, pagination: { page, limit, total: 0, totalPages: 1 } })
    }

    const params = scope.branchId ? [businessId, scope.branchId] : [businessId]
    const branchFilter = scope.branchId ? ' AND o.branch_id = $2' : ''
    // One row per paid order: what was actually paid, how, and when.
    const paidOrdersFrom = `
      FROM orders o
      LEFT JOIN LATERAL (
        SELECT p.method::text AS method, p.paid_at
        FROM payments p
        WHERE p.order_id = o.id AND p.paid_at IS NOT NULL
        ORDER BY p.paid_at DESC
        LIMIT 1
      ) pay ON TRUE
      LEFT JOIN branches b ON b.id = o.branch_id
      WHERE o.business_id = $1${branchFilter}
        AND ${ORDER_NOT_CANCELLED_SQL}
        AND (LOWER(BTRIM(o.status::text)) = 'paid' OR pay.paid_at IS NOT NULL)`
    // Payment records can contain duplicates, so the amount is the order total that was settled.
    const methodExpr = `COALESCE(NULLIF(o.payment_method::text, ''), pay.method, 'unknown')`
    const amountExpr = 'COALESCE(o.total_amount, 0)'
    const paidAtExpr = 'COALESCE(pay.paid_at, o.completed_at, o.created_at)'

    const refundFilter = scope.branchId ? ' AND branch_id = $2' : ''
    const [{ rows: countRows }, { rows: methodRows }, { rows }, { rows: refundRows }] = await Promise.all([
      query(`SELECT COUNT(*) AS total, COALESCE(SUM(${amountExpr}), 0) AS total_paid ${paidOrdersFrom}`, params),
      query(
        `SELECT ${methodExpr} AS method, COUNT(*) AS orders, COALESCE(SUM(${amountExpr}), 0) AS amount
         ${paidOrdersFrom}
         GROUP BY 1
         ORDER BY amount DESC`,
        params
      ),
      query(
        `SELECT o.id, o.order_number, o.table_number, o.table_name, o.status, o.source, o.total_amount,
                ${amountExpr} AS amount_paid, ${methodExpr} AS method, ${paidAtExpr} AS paid_at,
                b.name AS branch_name,
                (SELECT u.full_name FROM users u WHERE u.id = o.user_id) AS waiter_name
         ${paidOrdersFrom}
         ORDER BY ${paidAtExpr} DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      ),
      query(
        `SELECT COALESCE(SUM(amount), 0) AS refunds FROM refunds
         WHERE business_id = $1 AND LOWER(BTRIM(status::text)) = 'approved'${refundFilter}`,
        params
      ),
    ])

    const total = parseInt(countRows[0].total) || 0
    res.json({
      logs: rows.map((r) => ({
        id: r.id,
        type: 'received',
        orderNumber: r.order_number,
        tableNumber: r.table_number,
        customer: r.table_name,
        source: r.source,
        status: r.status,
        waiterName: r.source === 'waiter' ? r.waiter_name || '' : '',
        branchName: r.branch_name,
        orderTotal: Number(r.total_amount) || 0,
        amount: Number(r.amount_paid) || 0,
        paymentMethod: r.method,
        createdAt: new Date(r.paid_at).toISOString(),
      })),
      byMethod: methodRows.map((m) => ({ method: m.method, orders: Number(m.orders) || 0, amount: Number(m.amount) || 0 })),
      totalPaid: Number(countRows[0].total_paid) || 0,
      refunds: Number(refundRows[0].refunds) || 0,
      netReceived: Math.max(0, (Number(countRows[0].total_paid) || 0) - (Number(refundRows[0].refunds) || 0)),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
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

    const scope = await getBranchContext(req, { requestedBranchId: req.query.branchId, allowOwnerAll: true })
    const salesBranchFilter = scope.branchId ? ' AND branch_id = $2' : ''
    const salesParams = scope.branchId ? [scope.businessId, scope.branchId] : [scope.businessId]
    const { rows: salesData } = await query(
      `SELECT COALESCE(SUM(total_amount), 0) AS total_sales,
              COUNT(*) AS total_orders
       FROM orders WHERE status IN ('Paid', 'Served') AND business_id = $1${salesBranchFilter}`,
      salesParams
    )
    const { rows: tenderData } = await query(
      `WITH tender_entries AS (
         SELECT p.amount, p.method::text AS method
         FROM payments p
         JOIN orders o ON o.id = p.order_id
         WHERE p.business_id = $1 AND o.business_id = $1
           AND p.paid_at IS NOT NULL
           AND o.status IN ('Paid', 'Served')
           AND COALESCE(p.reference, '') NOT LIKE 'REFUND-%'
           ${scope.branchId ? 'AND p.branch_id = $2 AND o.branch_id = $2' : ''}
         UNION ALL
         SELECT o.total_amount AS amount, o.payment_method::text AS method
         FROM orders o
         WHERE o.business_id = $1 AND o.status IN ('Paid', 'Served')
           AND LOWER(o.payment_method) IN ('cash', 'card', 'pos')
           ${scope.branchId ? 'AND o.branch_id = $2' : ''}
           AND NOT EXISTS (
             SELECT 1 FROM payments p
             WHERE p.order_id = o.id AND p.paid_at IS NOT NULL
           )
       )
       SELECT COALESCE(SUM(amount) FILTER (WHERE LOWER(method) = 'cash'), 0) AS cash_sales,
              COALESCE(SUM(amount) FILTER (WHERE LOWER(method) IN ('card', 'pos')), 0) AS card_sales
       FROM tender_entries`,
      salesParams
    )

    const financialSummary = await getFinancialSummary(scope.businessId, scope.branchId)

    // Branch Performance
    const { rows: branchPerformance } = await query(
      `SELECT b.id, b.name AS branch_name,
              COALESCE(SUM(o.total_amount), 0) AS total_revenue,
              COUNT(o.id) AS order_count
       FROM branches b
       LEFT JOIN orders o ON o.business_id = b.business_id AND o.branch_id = b.id
         AND o.status IN ('Paid', 'Served')
      WHERE b.business_id = $1${scope.branchId ? ' AND b.id = $2' : ''}
       GROUP BY b.id, b.name
       ORDER BY total_revenue DESC`,
          scope.branchId ? [scope.businessId, scope.branchId] : [scope.businessId]
    )

    // Recent activity
    const { rows: recentActivity } = await query(
      `SELECT al.id, al.actor_name AS actor, al.action, al.target_module AS module,
              al.ip_address AS ip, al.created_at
       FROM audit_logs al
       WHERE al.business_id = $1
         ${scope.branchId ? `AND EXISTS (
           SELECT 1 FROM users u
           WHERE u.id = al.actor_id AND u.business_id = al.business_id
             AND u.branch_id = $2
         )` : ''}
       ORDER BY al.created_at DESC LIMIT 10`,
      salesParams
    )

    // Dashboard stats
    const { rows: staffCount } = await query(
      `SELECT role, COUNT(*) AS count FROM users WHERE is_active = TRUE AND business_id = $1${scope.branchId ? ' AND branch_id = $2' : ''} GROUP BY role`,
      scope.branchId ? [businessId, scope.branchId] : [businessId]
    )
    const stats = {}
    staffCount.forEach((r) => { stats[r.role] = parseInt(r.count) })

    // Customer orders via QR
    const { rows: qrOrders } = await query(
      `SELECT COUNT(*) AS count, COALESCE(SUM(total_amount), 0) AS total
      FROM orders WHERE source = 'qr' AND status IN ('Paid', 'Served') AND business_id = $1${scope.branchId ? ' AND branch_id = $2' : ''}`,
          scope.branchId ? [scope.businessId, scope.branchId] : [scope.businessId]
    )

    res.json({
      summary: {
        totalSales: financialSummary.totalSales,
        cashSales: Number(tenderData[0].cash_sales) || 0,
        cardSales: Number(tenderData[0].card_sales) || 0,
        netProfit: financialSummary.netProfit,
        vatDue: financialSummary.vatTotal,
        totalOrders: Number(salesData[0].total_orders) || 0,
        waiters: stats.waiter || 0,
        managers: stats.manager || 0,
        accountants: stats.accountant || 0,
        qrOrders: parseInt(qrOrders[0].count) || 0,
        qrRevenue: (Number(qrOrders[0].total) || 0) - financialSummary.refunds,
        branchId: scope.branchId,
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
    await ensurePaymentCollectionSchema()
    const businessVerified = req.user?.businessVerified === true
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
        unpaidAccessGranted: req.user?.unpaidAccessGranted === true,
        businessVerified: false,
      })
    }

    const { rows } = await query(
      `SELECT s.*, b.name AS business_name, b.id AS business_id,
              pending_payment.id AS pending_payment_id,
              pending_payment.transaction_id AS pending_payment_reference,
             pending_payment.provider_status AS pending_payment_provider_status,
             pending_payment.plan AS pending_payment_plan,
             pending_payment.amount_paid AS pending_payment_amount,
             pending_payment.payment_method AS pending_payment_method,
             pending_payment.phone_number AS pending_payment_phone,
             pending_payment.pay_to AS pending_payment_pay_to,
             pending_payment.payer_reference AS pending_payment_payer_reference
       FROM subscriptions s
       LEFT JOIN businesses b ON b.id = s.business_id
       LEFT JOIN LATERAL (
         SELECT pp.id, pp.transaction_id, pp.provider_status, pp.pay_to, pp.payer_reference,
                ps.plan, ps.amount_paid, ps.payment_method, ps.phone_number
         FROM platform_payments pp
         JOIN subscriptions ps ON ps.id = pp.subscription_id
         WHERE pp.business_id = $1 AND pp.status = 'pending'
         ORDER BY pp.created_at DESC
         LIMIT 1
       ) pending_payment ON TRUE
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
        unpaidAccessGranted: req.user?.unpaidAccessGranted === true,
        businessVerified,
      })
    }

    const sub = rows[0]
    const now = new Date()
    const expiry = new Date(sub.current_period_end || sub.expiration_date || sub.next_renewal_date || now)
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
      periodEnd: sub.current_period_end ? new Date(sub.current_period_end).toISOString() : null,
      expirationDate: sub.expiration_date ? new Date(sub.expiration_date).toISOString() : null,
      daysRemaining,
      remainingDays: daysRemaining,
      aboutToExpire,
      nextRenewalDate: sub.next_renewal_date ? new Date(sub.next_renewal_date).toISOString() : null,
      paymentMethod: sub.payment_method || null,
      phoneNumber: sub.phone_number || null,
      paymentStatus: sub.payment_status || 'pending',
      pendingPaymentId: sub.pending_payment_id || null,
      pendingPaymentReference: sub.pending_payment_reference || null,
      pendingPaymentStatus: sub.pending_payment_provider_status || null,
      pendingPaymentPlan: sub.pending_payment_id ? sub.pending_payment_plan : null,
      pendingPaymentAmount: sub.pending_payment_id ? Number(sub.pending_payment_amount) : null,
      pendingPaymentMethod: sub.pending_payment_id ? sub.pending_payment_method : null,
      pendingPaymentPhone: sub.pending_payment_id ? sub.pending_payment_phone : null,
      pendingPaymentPayTo: sub.pending_payment_id ? sub.pending_payment_pay_to || null : null,
      pendingPaymentPayerReference: sub.pending_payment_id ? sub.pending_payment_payer_reference || null : null,
      pendingPaymentAwaitingConfirmation: Boolean(sub.pending_payment_id) && ['AWAITING_BANK_TRANSFER', 'AWAITING_MANUAL_CONFIRMATION'].includes(sub.pending_payment_provider_status),
      receiptNumber: sub.receipt_number || null,
      receiptGenerated: sub.receipt_generated === 1,
      amountPaid: Number(sub.amount_paid) || 0,
      createdAt: new Date(sub.created_at).toISOString(),
      unpaidAccessGranted: req.user?.unpaidAccessGranted === true,
      businessVerified,
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// POST /api/v1/owner/subscription/select-plan
export async function selectSubscriptionPlan(req, res) {
  const businessId = req.user?.businessId
  const { plan, planId, paymentMethod, phoneNumber, billingCycle } = req.body
  if (!businessId) return res.status(400).json({ error: 'No business associated with this account.' })

  const method = String(paymentMethod || '').toLowerCase()
  const providerMethod = ({ momo: 'mtn_momo', airtel: 'airtel_money', bank: 'bank_transfer' })[method] || method
  const options = await subscriptionPaymentOptions()
  if (!options[providerMethod]) {
    return res.status(400).json({ error: 'Choose MTN MoMo, Airtel Money or bank transfer.' })
  }
  if (!options[providerMethod].enabled) {
    return res.status(400).json({ error: 'This payment method is not available right now. Choose another one.' })
  }
  const isBank = providerMethod === 'bank_transfer'
  const option = options[providerMethod]
  // Manual: the owner sends the money to the platform's number / account and the admin confirms it.
  const isManual = isBank || option.mode === 'manual'
  if (!isBank && !phoneNumber) return res.status(400).json({ error: 'Enter the mobile-money number you pay from.' })

  try {
    const { rows: pendingRows } = await query(
      `SELECT id FROM platform_payments WHERE business_id = $1 AND status = 'pending' LIMIT 1`,
      [businessId]
    )
    if (pendingRows.length) {
      return res.status(409).json({ error: 'A subscription payment is already in progress. Check its status before starting another.' })
    }

    let selectedPlan
    if (planId) {
      const { rows } = await query('SELECT * FROM subscription_plans WHERE id = $1 AND is_active = TRUE', [planId])
      selectedPlan = rows[0]
    } else if (plan && !['monthly', 'quarterly', 'annually', 'yearly'].includes(String(plan).toLowerCase())) {
      const { rows } = await query('SELECT * FROM subscription_plans WHERE LOWER(name) = $1 AND is_active = TRUE', [String(plan).toLowerCase()])
      selectedPlan = rows[0]
    }
    if (planId && !selectedPlan) return res.status(404).json({ error: 'Selected subscription plan is not available.' })

    const normalizedCycle = normalizeCycle(billingCycle || 'monthly')
    if (!normalizedCycle) {
      return res.status(400).json({ error: 'Billing cycle must be monthly, quarterly or annually.' })
    }
    const { rows: currentPlans } = await query(
      `SELECT plan_id, plan FROM subscriptions
       WHERE business_id = $1
       ORDER BY (is_active = TRUE AND payment_status = 'verified') DESC, created_at DESC
       LIMIT 1`,
      [businessId]
    )
    const currentPlan = currentPlans[0]
    // Renewing without choosing: keep the current plan if it is still offered.
    if (!selectedPlan && currentPlan?.plan_id) {
      const { rows } = await query('SELECT * FROM subscription_plans WHERE id = $1 AND is_active = TRUE', [currentPlan.plan_id])
      selectedPlan = rows[0]
    }
    if (!selectedPlan) {
      return res.status(404).json({ error: 'Choose one of the available subscription plans.' })
    }

    // Same calculation as the prices shown to the owner (services/subscriptionPricing.js).
    const { amount, months: monthsToAdd, discountPercent } = priceFor(selectedPlan, normalizedCycle)
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'The selected plan has an invalid price.' })
    }

    const phone = isBank ? (phoneNumber ? normalizeRwandaPhone(phoneNumber) : null) : normalizeRwandaPhone(phoneNumber)
    const { rows: activeRows } = await query(
      `SELECT current_period_end FROM subscriptions
       WHERE business_id = $1 AND is_active = TRUE AND payment_status = 'verified'
       ORDER BY current_period_end DESC NULLS LAST LIMIT 1`,
      [businessId]
    )
    const now = new Date()
    const currentEnd = activeRows[0]?.current_period_end
    const periodStart = currentEnd && new Date(currentEnd) > now ? new Date(currentEnd) : now
    const periodEnd = new Date(periodStart)
    periodEnd.setMonth(periodEnd.getMonth() + monthsToAdd)
    const reference = crypto.randomUUID()

    const { rows: subscriptions } = await query(
      `INSERT INTO subscriptions
         (business_id, plan_id, plan, billing_cycle, discount_percent, amount_paid,
          status, is_active, payment_status, payment_method, phone_number,
          start_date, current_period_end, expiration_date, next_renewal_date, remaining_days)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', FALSE, 'pending', $7, $8, $9, $10, $10, $10, $11)
       RETURNING id, plan, billing_cycle, amount_paid, current_period_end, next_renewal_date`,
      [businessId, selectedPlan.id, selectedPlan.name, normalizedCycle, discountPercent, amount, providerMethod, phone, periodStart, periodEnd, monthsToAdd * 30]
    )
    const subscription = subscriptions[0]
    await ensurePaymentCollectionSchema()
    // pay_to records where this payment must go, as configured right now.
    const payTo = payToText(providerMethod, option)
    const { rows: payments } = await query(
      `INSERT INTO platform_payments
         (business_id, subscription_id, plan, billing_cycle, amount, payment_method, transaction_id, status, provider_status, pay_to, payer_phone)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9, $10)
       RETURNING id`,
      [businessId, subscription.id, subscription.plan, normalizedCycle, amount, providerMethod, reference,
        isBank ? 'AWAITING_BANK_TRANSFER' : isManual ? 'AWAITING_MANUAL_CONFIRMATION' : 'PENDING', payTo, phone]
    )
    const paymentId = payments[0].id

    if (isManual) {
      const shortRef = shortReference(reference)
      await logAudit({
        userId: req.user.id,
        actorName: req.user.full_name || req.user.email,
        action: `Started ${PROVIDER_LABEL[providerMethod]} subscription payment for ${subscription.plan} (${amount} RWF) to ${payTo}`,
        targetModule: 'Subscription',
        ipAddress: getClientIp(req),
        businessId,
        metadata: { subscriptionId: subscription.id, paymentId, reference },
      })
      const destination = isBank ? options.bank_transfer.account : payTo
      return res.status(201).json({
        id: subscription.id,
        paymentId,
        reference: shortRef,
        plan: subscription.plan,
        billingCycle: subscription.billing_cycle,
        discountPercent,
        amount,
        paymentMethod: providerMethod,
        collection: 'manual',
        payTo: destination,
        payToNumber: isBank ? '' : displayPhone(option.number),
        payToName: isBank ? '' : option.name,
        payToCode: isBank ? '' : option.code,
        bankAccount: isBank ? options.bank_transfer.account : undefined,
        phoneNumber: phone,
        periodEnd: subscription.current_period_end,
        nextRenewalDate: subscription.next_renewal_date,
        status: 'pending',
        message: isBank
          ? `Transfer ${amount} RWF to ${destination} with reference ${shortRef}. Your subscription activates when the platform administrator confirms the transfer.`
          : `Send ${amount} RWF by ${PROVIDER_LABEL[providerMethod]} to ${destination} (reference ${shortRef}). Your subscription activates when the platform administrator confirms it.`,
      })
    }

    try {
      const providerRequest = await requestMobileMoneyPayment({
        method: providerMethod,
        reference,
        amount,
        phone,
      })
      await query(
        `UPDATE platform_payments
         SET provider_txn_id = $2, provider_status = $3
         WHERE id = $1 RETURNING id`,
        [paymentId, providerRequest.providerTxnId, providerRequest.providerStatus]
      )
    } catch (error) {
      await query(
        `UPDATE platform_payments SET status = 'failed', provider_status = 'FAILED', provider_payload = $2 WHERE id = $1 RETURNING id`,
        [paymentId, JSON.stringify({ error: error.message })]
      )
      await query(`UPDATE subscriptions SET status = 'payment_failed', payment_status = 'failed' WHERE id = $1`, [subscription.id])
      throw error
    }

    await logAudit({
      userId: req.user.id,
      actorName: req.user.full_name || req.user.email,
      action: `Started ${providerMethod} subscription payment for ${subscription.plan} (${amount} RWF)`,
      targetModule: 'Subscription',
      ipAddress: getClientIp(req),
      businessId,
      metadata: { subscriptionId: subscription.id, paymentId, reference },
    })

    res.status(201).json({
      id: subscription.id,
      paymentId,
      reference,
      plan: subscription.plan,
      billingCycle: subscription.billing_cycle,
      discountPercent,
      amount,
      paymentMethod: providerMethod,
      phoneNumber: phone,
      periodEnd: subscription.current_period_end,
      nextRenewalDate: subscription.next_renewal_date,
      status: 'pending',
      message: `Approve the ${amount} RWF payment request sent to ${phone}. Access will activate automatically after provider confirmation.`,
    })
  } catch (error) {
    res.status(502).json({ error: error.message })
  }
}

export async function completeSubscriptionPayment(paymentId, businessId, providerStatus, providerPayload) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      `SELECT pp.id, pp.business_id, pp.subscription_id, pp.status, s.plan, s.billing_cycle,
              s.amount_paid, s.start_date, s.current_period_end, s.next_renewal_date,
              s.payment_method
       FROM platform_payments pp
       JOIN subscriptions s ON s.id = pp.subscription_id
       WHERE pp.id = $1 AND pp.business_id = $2
       FOR UPDATE OF pp, s`,
      [paymentId, businessId]
    )
    if (!rows.length) throw new Error('Subscription payment not found.')
    const payment = rows[0]
    if (payment.status === 'paid') {
      const { rows: existing } = await client.query(
        'SELECT receipt_number FROM subscriptions WHERE id = $1',
        [payment.subscription_id]
      )
      await client.query('COMMIT')
      return {
        status: 'completed',
        alreadyCompleted: true,
        receiptNumber: existing[0]?.receipt_number || null,
        plan: payment.plan,
        amount: Number(payment.amount_paid),
      }
    }
    if (payment.status !== 'pending') throw new Error('This subscription payment is no longer pending.')

    // A renewal = the business already had a paid subscription before this one.
    const { rows: previousPaid } = await client.query(
      `SELECT 1 FROM subscriptions
       WHERE business_id = $1 AND id <> $2 AND payment_status = 'verified'
       LIMIT 1`,
      [businessId, payment.subscription_id]
    )
    const isRenewal = previousPaid.length > 0

    const receiptNumber = generateReceiptNumber()
    await client.query(
      `UPDATE subscriptions
       SET is_active = FALSE
       WHERE business_id = $1 AND is_active = TRUE AND id <> $2`,
      [businessId, payment.subscription_id]
    )
    await client.query(
      `UPDATE subscriptions
       SET status = 'active', is_active = TRUE, payment_status = 'verified',
           receipt_number = $2, receipt_generated = 1
       WHERE id = $1`,
      [payment.subscription_id, receiptNumber]
    )
    await client.query(
      `UPDATE platform_payments
       SET status = 'paid', provider_status = $2, provider_payload = $3, paid_at = NOW()
       WHERE id = $1`,
      [paymentId, providerStatus, JSON.stringify(providerPayload || {})]
    )
    await client.query(
      `UPDATE businesses SET is_verified = TRUE, unpaid_access_granted = FALSE WHERE id = $1`,
      [businessId]
    )
    await client.query('COMMIT')
    forgetSubscriptionAccess(businessId)
    // Updated inside the transaction: seal the paid subscription payment after commit.
    await sealTransaction('platform_payments', paymentId, 'updated')
    return {
      status: 'completed',
      alreadyCompleted: false,
      isRenewal,
      receiptNumber,
      plan: payment.plan,
      amount: Number(payment.amount_paid),
      startDate: payment.start_date,
      endDate: payment.current_period_end,
      nextRenewalDate: payment.next_renewal_date,
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function checkSubscriptionPayment(req, res) {
  const businessId = req.user?.businessId
  if (!businessId) return res.status(400).json({ error: 'No business associated with this account.' })
  try {
    const { rows } = await query(
      `SELECT pp.*, s.plan AS subscription_plan, s.receipt_number
       FROM platform_payments pp
       JOIN subscriptions s ON s.id = pp.subscription_id
       WHERE pp.id = $1 AND pp.business_id = $2`,
      [req.params.paymentId, businessId]
    )
    if (!rows.length) return res.status(404).json({ error: 'Subscription payment not found.' })
    const payment = rows[0]
    if (payment.status === 'paid') {
      return res.json({
        status: 'completed',
        receiptNumber: payment.receipt_number,
        plan: payment.subscription_plan,
        amount: Number(payment.amount),
      })
    }
    if (payment.status !== 'pending') {
      return res.json({ status: 'failed', providerStatus: payment.provider_status, reason: payment.review_note || null })
    }
    // Bank transfers and payments sent to the platform's number are confirmed by the administrator.
    if (awaitsAdminConfirmation(payment)) {
      return res.json({ status: 'pending', providerStatus: payment.provider_status, message: 'Waiting for the platform administrator to confirm your payment.' })
    }

    const result = await getMobileMoneyPaymentStatus({
      method: payment.payment_method,
      reference: payment.transaction_id,
      provider_txn_id: payment.provider_txn_id,
      amount: payment.amount,
    })
    await query(
      `UPDATE platform_payments
       SET provider_status = $2, provider_payload = $3
       WHERE id = $1 AND status = 'pending' RETURNING id`,
      [payment.id, result.providerStatus, JSON.stringify(result.payload || {})]
    )
    if (result.status === 'failed') {
      const { rows: failedPayments } = await query(
        `UPDATE platform_payments SET status = 'failed' WHERE id = $1 AND status = 'pending' RETURNING id`,
        [payment.id]
      )
      if (!failedPayments.length) {
        const { rows: currentPayments } = await query(
          `SELECT pp.status, pp.amount, pp.provider_status, s.plan AS subscription_plan, s.receipt_number
           FROM platform_payments pp
           JOIN subscriptions s ON s.id = pp.subscription_id
           WHERE pp.id = $1`,
          [payment.id]
        )
        const current = currentPayments[0]
        if (current?.status === 'paid') {
          return res.json({
            status: 'completed',
            receiptNumber: current.receipt_number,
            plan: current.subscription_plan,
            amount: Number(current.amount),
          })
        }
        return res.json({ status: 'failed', providerStatus: current?.provider_status || result.providerStatus })
      }
      await query(
        `UPDATE subscriptions SET status = 'payment_failed', payment_status = 'failed'
         WHERE id = $1 AND payment_status = 'pending'`,
        [payment.subscription_id]
      )
      return res.json({ status: 'failed', providerStatus: result.providerStatus })
    }
    if (result.status !== 'completed') {
      return res.json({ status: 'pending', providerStatus: result.providerStatus })
    }

    const completion = await completeSubscriptionPayment(payment.id, businessId, result.providerStatus, result.payload)
    if (!completion.alreadyCompleted) {
      try {
        const { rows: businessRows } = await query(
          `SELECT b.name AS business_name, b.contact_email,
                  u.full_name AS owner_name, u.email AS owner_email
           FROM businesses b
           LEFT JOIN users u ON u.business_id = b.id AND u.role = 'owner'
           WHERE b.id = $1 LIMIT 1`,
          [businessId]
        )
        if (businessRows.length) {
          const business = businessRows[0]
          const notification = {
            businessName: business.business_name,
            ownerName: business.owner_name || 'Business Owner',
            ownerEmail: business.owner_email || business.contact_email,
            planName: completion.plan || 'N/A',
            activationDate: new Date().toLocaleDateString(),
            expiryDate: completion.endDate ? new Date(completion.endDate).toLocaleDateString() : 'N/A',
            amount: completion.amount,
            businessId,
          }
          const ownerEmail = completion.isRenewal
            ? sendRenewalConfirmation({ ...notification, newExpiryDate: completion.endDate })
            : sendSubscriptionActivation(notification)
          ownerEmail.catch((error) => {
            console.error('Failed to send subscription email:', error.message)
          })
          sendAdminSubscriptionActivation(notification).catch((error) => {
            console.error('Failed to send admin subscription activation email:', error.message)
          })
        }
      } catch (error) {
        console.error('Failed to prepare subscription activation emails:', error.message)
      }
      await logAudit({
        userId: req.user.id,
        actorName: req.user.full_name || req.user.email,
        action: `Subscription payment verified by provider. Receipt: ${completion.receiptNumber}`,
        targetModule: 'Subscription',
        ipAddress: getClientIp(req),
        businessId,
        metadata: { paymentId: payment.id, provider: payment.payment_method, providerStatus: result.providerStatus },
      })
    }
    const { alreadyCompleted, ...publicCompletion } = completion
    return res.json(publicCompletion)
  } catch (error) {
    res.status(502).json({ error: error.message })
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
  return selectSubscriptionPlan(req, res)
}

export async function getAvailableSubscriptionPlans(_req, res) {
  try {
    const { rows } = await query(
      `SELECT * FROM subscription_plans WHERE is_active = TRUE
       ORDER BY sort_order ASC, price_monthly ASC, created_at ASC`
    )
    res.json(rows.map(planForClient))
  } catch (error) { res.status(500).json({ error: error.message }) }
}

// GET /api/v1/owner/subscription/payment-options — methods the platform admin has enabled.
// POST /api/v1/owner/subscription/payment/:paymentId/reference  { transactionId }
// The owner gives the transaction ID from the MoMo / bank confirmation, so the admin can match it.
export async function submitSubscriptionPaymentReference(req, res) {
  const businessId = req.user?.businessId
  const transactionId = String(req.body?.transactionId || '').trim().slice(0, 80)
  if (transactionId.length < 4) return res.status(400).json({ error: 'Enter the transaction ID from the confirmation message.' })
  try {
    await ensurePaymentCollectionSchema()
    const { rows } = await query(
      `UPDATE platform_payments SET payer_reference = $3
       WHERE id = $1 AND business_id = $2 AND status = 'pending'
         AND provider_status IN ('AWAITING_BANK_TRANSFER', 'AWAITING_MANUAL_CONFIRMATION')
       RETURNING id`,
      [req.params.paymentId, businessId, transactionId]
    )
    if (!rows.length) return res.status(409).json({ error: 'This payment is not waiting for confirmation any more.' })
    res.json({ success: true, payerReference: transactionId })
  } catch (error) {
    if (/invalid input syntax for type uuid/i.test(error.message)) return res.status(404).json({ error: 'Payment not found.' })
    res.status(500).json({ error: error.message })
  }
}

// POST /api/v1/owner/subscription/payment/:paymentId/cancel — the owner did not send the money
// (or chose the wrong plan) and wants to start again.
export async function cancelSubscriptionPayment(req, res) {
  const businessId = req.user?.businessId
  try {
    const { rows } = await query(
      `UPDATE platform_payments SET status = 'failed', provider_status = 'CANCELLED_BY_OWNER'
       WHERE id = $1 AND business_id = $2 AND status = 'pending'
         AND provider_status IN ('AWAITING_BANK_TRANSFER', 'AWAITING_MANUAL_CONFIRMATION')
       RETURNING id, subscription_id`,
      [req.params.paymentId, businessId]
    )
    if (!rows.length) return res.status(409).json({ error: 'Only a payment waiting for confirmation can be cancelled.' })
    if (rows[0].subscription_id) {
      await query(`UPDATE subscriptions SET status = 'cancelled', payment_status = 'failed' WHERE id = $1 AND payment_status = 'pending'`, [rows[0].subscription_id])
    }
    await logAudit({
      userId: req.user.id,
      actorName: req.user.full_name || req.user.email,
      action: 'Cancelled a subscription payment waiting for confirmation',
      targetModule: 'Subscription',
      ipAddress: getClientIp(req),
      businessId,
      metadata: { paymentId: rows[0].id },
    })
    res.json({ success: true })
  } catch (error) {
    if (/invalid input syntax for type uuid/i.test(error.message)) return res.status(404).json({ error: 'Payment not found.' })
    res.status(500).json({ error: error.message })
  }
}

export async function getSubscriptionPaymentOptions(_req, res) {
  try {
    res.json(await subscriptionPaymentOptions())
  } catch (error) { res.status(500).json({ error: error.message }) }
}

// ──────────────────────────────────────────────
//  10. Branch & Inventory overview (for Owner)
// ──────────────────────────────────────────────

// GET /api/v1/owner/inventory
export async function getGlobalInventory(req, res) {
  try {
    const scope = await getBranchContext(req, { requestedBranchId: req.query.branchId, allowOwnerAll: true })
    const branchFilter = scope.branchId ? 'WHERE b.business_id = $1 AND inv.branch_id = $2' : 'WHERE b.business_id = $1'
    const params = scope.branchId ? [scope.businessId, scope.branchId] : [scope.businessId]
    const { rows } = await query(
      `SELECT inv.id, inv.name, inv.sku, inv.quantity, inv.cost_price, inv.selling_price,
              inv.min_stock_level, inv.unit, inv.expiry_date,
              b.name AS branch_name, b.id AS branch_id,
              inv.created_at, inv.updated_at
      FROM inventory inv
      LEFT JOIN branches b ON b.id = inv.branch_id
      ${branchFilter}
       ORDER BY inv.name ASC`
          , params
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
    const scope = await getBranchContext(req, { requestedBranchId: req.query.branchId, allowOwnerAll: true })
    const branchFilter = scope.branchId ? 'WHERE b.business_id = $1 AND inv.branch_id = $2' : 'WHERE b.business_id = $1'
    const params = scope.branchId ? [scope.businessId, scope.branchId] : [scope.businessId]
    const { rows } = await query(
      `SELECT sa.id, sa.inventory_id, inv.name AS item_name, sa.adjustment_type, sa.quantity,
              sa.reason, sa.created_at,
              u.full_name AS adjusted_by, b.name AS branch_name
       FROM stock_adjustments sa
       JOIN inventory inv ON inv.id = sa.inventory_id
       JOIN users u ON u.id = sa.adjusted_by
      LEFT JOIN branches b ON b.id = inv.branch_id
      ${branchFilter}
       ORDER BY sa.created_at DESC
      LIMIT 100`,
          params
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
    // Shared settings (no business) plus this business's own rows, which win.
    const { rows: settings } = await query(
      `SELECT * FROM system_settings
       WHERE business_id IS NULL OR business_id = $1
       ORDER BY (business_id IS NOT NULL), updated_at, setting_group, setting_key`,
      [businessId]
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

    // Subscription prices are not settings: they live on the plans (GET /subscription/plans).
    for (const k of Object.keys(flatSettings)) {
      if (k.startsWith('subscription_')) delete flatSettings[k]
    }
    // Email notifications are sent unless the owner turned them off.
    for (const k of OWNER_NOTIFICATION_KEYS) {
      if (flatSettings[k] === undefined) flatSettings[k] = 'true'
    }

    res.json({
      business: business.length
        ? {
            id: business[0].id,
            name: business[0].name,
            address: business[0].address || '',
            phone: business[0].contact_phone || '',
            email: business[0].contact_email || '',
            city: business[0].city || '',
            country: business[0].country || '',
            province: business[0].province || '',
            district: business[0].district || '',
            sector: business[0].sector || '',
            businessType: business[0].business_type || '',
            registrationCode: business[0].registration_code || '',
            description: business[0].description || '',
            currency: business[0].currency_code || 'RWF',
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
    const {
      name, address, phone, email, city, country, province, district, sector,
      businessType, registrationCode, description, currency, taxRate, settings,
    } = req.body

    // Update business info
    const fields = []
    const params = []
    let idx = 1

    if (name !== undefined) { fields.push(`name = $${idx++}`); params.push(name) }
    if (address !== undefined) { fields.push(`address = $${idx++}`); params.push(address) }
    if (phone !== undefined) { fields.push(`contact_phone = $${idx++}`); params.push(phone) }
    if (email !== undefined) { fields.push(`contact_email = $${idx++}`); params.push(email) }
    if (city !== undefined) { fields.push(`city = $${idx++}`); params.push(city) }
    if (country !== undefined) { fields.push(`country = $${idx++}`); params.push(country) }
    if (province !== undefined) { fields.push(`province = $${idx++}`); params.push(province) }
    if (district !== undefined) { fields.push(`district = $${idx++}`); params.push(district) }
    if (sector !== undefined) { fields.push(`sector = $${idx++}`); params.push(sector) }
    if (businessType !== undefined) { fields.push(`business_type = $${idx++}`); params.push(businessType) }
    if (registrationCode !== undefined) { fields.push(`registration_code = $${idx++}`); params.push(registrationCode) }
    if (description !== undefined) { fields.push(`description = $${idx++}`); params.push(description) }
    if (currency !== undefined) { fields.push(`currency_code = $${idx++}`); params.push(currency) }
    if (taxRate !== undefined) { fields.push(`tax_rate = $${idx++}`); params.push(taxRate) }

    if (fields.length) {
      await query(
        `UPDATE businesses SET ${fields.join(', ')} WHERE id = $${idx}`,
        [...params, businessId]
      )
    }

    // Business settings the owner may change. They are stored for THIS business only
    // (business_id = businessId); platform-wide values belong to the platform administrator.
    if (settings && typeof settings === 'object') {
      const allowed = new Set(['max_login_attempts', 'session_timeout', ...OWNER_NOTIFICATION_KEYS])
      const rejected = Object.keys(settings).filter((key) => !allowed.has(key))
      if (rejected.length) {
        return res.status(403).json({ error: 'Subscription plans and platform settings can only be changed by the platform administrator.' })
      }
      const clean = {}
      for (const [key, value] of Object.entries(settings)) {
        if (OWNER_NOTIFICATION_KEYS.includes(key)) {
          clean[key] = String(value) === 'true' ? 'true' : 'false'
        } else if (key === 'max_login_attempts') {
          const n = Math.round(Number(value))
          if (!Number.isFinite(n) || n < 3 || n > 20) return res.status(400).json({ error: 'Max login attempts must be between 3 and 20.' })
          clean[key] = String(n)
        } else if (key === 'session_timeout') {
          const n = Math.round(Number(value))
          if (!Number.isFinite(n) || n < 5 || n > 1440) return res.status(400).json({ error: 'Session timeout must be between 5 and 1440 minutes.' })
          clean[key] = String(n)
        }
      }
      for (const [key, value] of Object.entries(clean)) {
        const group = OWNER_NOTIFICATION_KEYS.includes(key) ? 'notifications' : 'security'
        const { rows: updatedRows } = await query(
          `UPDATE system_settings SET setting_value = $3, updated_at = NOW()
           WHERE business_id = $1 AND setting_key = $2 RETURNING id`,
          [businessId, key, value]
        )
        if (!updatedRows.length) {
          await query(
            `INSERT INTO system_settings (business_id, setting_key, setting_value, setting_group)
             VALUES ($1, $2, $3, $4)`,
            [businessId, key, value, group]
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
    const scope = await getBranchContext(req, { requestedBranchId: req.query.branchId, allowOwnerAll: true })
    const businessId = scope.businessId
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
             WHERE o.source = 'qr' AND o.business_id = $1${scope.branchId ? ' AND o.branch_id = $2' : ''}`
    const params = scope.branchId ? [businessId, scope.branchId] : [businessId]
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
    const scope = await getBranchContext(req, { requestedBranchId: req.query.branchId, allowOwnerAll: true })
    const businessId = scope.businessId
    const branchFilter = scope.branchId ? ' AND branch_id = $2' : ''
    const { rows } = await query(
      `SELECT id, full_name AS name, email, phone, is_active
       FROM users
      WHERE role = 'waiter' AND business_id = $1${branchFilter}
       ORDER BY full_name ASC`,
          scope.branchId ? [businessId, scope.branchId] : [businessId]
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
    const scope = await getBranchContext(req, { requestedBranchId: req.query.branchId, allowOwnerAll: true })
    const businessId = scope.businessId
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
             WHERE o.user_id = $1 AND o.source = 'waiter' AND o.business_id = $2${scope.branchId ? ' AND o.branch_id = $3' : ''}
    `
    const params = scope.branchId ? [userId, businessId, scope.branchId] : [userId, businessId]
    if (status) {
      sql += ` AND o.status = $${params.length + 1}`
      params.push(status)
    }
    sql += ' ORDER BY o.created_at DESC'

    const { rows } = await query(sql, params)
    const { rows: userRows } = await query(
      `SELECT full_name AS name FROM users WHERE id = $1 AND business_id = $2 AND ($3::uuid IS NULL OR branch_id = $3)`,
      [userId, businessId, scope.branchId]
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
// Adds the payment_methods column if the startup migration hasn't run yet.
let paymentMethodsColumnReady = null
export function ensurePaymentMethodsColumn() {
  if (!paymentMethodsColumnReady) {
    paymentMethodsColumnReady = query(
      `ALTER TABLE payment_settings ADD COLUMN IF NOT EXISTS payment_methods JSONB NOT NULL DEFAULT '[]'::jsonb`
    ).catch((error) => {
      paymentMethodsColumnReady = null
      throw error
    })
  }
  return paymentMethodsColumnReady
}

const emptyPaymentSettings = (businessId = null) => ({
  businessId,
  qrPaymentEnabled: false,
  merchantName: 'BarFlow Business',
  paymentMethods: [],
  mtnMomoNumber: '',
  airtelMoneyNumber: '',
  merchantCode: '',
  bankAccount: '',
})

export async function getPaymentSettings(req, res) {
  try {
    const businessId = req.user?.businessId
    if (!businessId) return res.json(emptyPaymentSettings())
    await ensurePaymentMethodsColumn()
    const { rows } = await query('SELECT * FROM payment_settings WHERE business_id = $1', [businessId])
    if (!rows.length) return res.json(emptyPaymentSettings(businessId))
    const s = rows[0]
    res.json({
      businessId,
      qrPaymentEnabled: s.qr_payment_enabled,
      merchantName: s.merchant_name || 'BarFlow Business',
      paymentMethods: readPaymentMethods(s),
      mtnMomoNumber: s.mtn_momo_number || '',
      airtelMoneyNumber: s.airtel_money_number || '',
      merchantCode: s.merchant_code || '',
      bankAccount: s.bank_account || '',
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// PUT /api/v1/owner/payment-settings
export async function updatePaymentSettings(req, res) {
  const { qrPaymentEnabled, merchantName, paymentMethods } = req.body || {}
  try {
    const businessId = req.user?.businessId
    if (!businessId) {
      return res.status(400).json({ error: 'Business not found.' })
    }
    await ensurePaymentMethodsColumn()

    const methods = paymentMethods === undefined ? null : normalizePaymentMethods(paymentMethods)
    if (qrPaymentEnabled && methods && !methods.some((m) => m.enabled)) {
      return res.status(400).json({ error: 'Add at least one payment method before enabling QR payments.' })
    }
    const name = merchantName === undefined ? null : (String(merchantName).trim().slice(0, 80) || 'BarFlow Business')
    const methodsJson = methods ? JSON.stringify(methods) : null

    const existing = (await query('SELECT id FROM payment_settings WHERE business_id = $1', [businessId])).rows[0]
    if (existing) {
      await query(
        `UPDATE payment_settings SET
          qr_payment_enabled = COALESCE($1, qr_payment_enabled),
          merchant_name = COALESCE($2, merchant_name),
          payment_methods = COALESCE($3::jsonb, payment_methods),
          updated_at = NOW()
         WHERE id = $4`,
        [qrPaymentEnabled ?? null, name, methodsJson, existing.id]
      )
    } else {
      await query(
        `INSERT INTO payment_settings (business_id, qr_payment_enabled, merchant_name, payment_methods)
         VALUES ($1, $2, $3, COALESCE($4::jsonb, '[]'::jsonb))`,
        [businessId, qrPaymentEnabled ?? false, name || 'BarFlow Business', methodsJson]
      )
    }

    await logAudit({
      actorName: req.user?.name || req.user?.email || 'Owner',
      action: `Updated payment settings. QR payments: ${qrPaymentEnabled ? 'enabled' : 'disabled'}${methods ? `, ${methods.length} payment method(s)` : ''}`,
      targetModule: 'Payment',
      ipAddress: getClientIp(req),
      businessId: req.user?.businessId,
    })

    res.json({ success: true, paymentMethods: methods || undefined })
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
    const waiterBranchId = String(req.user?.role || '').toLowerCase() === 'waiter'
      ? req.user?.branchId || null
      : null
    const { rows: orderRows } = await query(
      `SELECT o.id, o.order_number, o.total_amount, o.table_number, b.name AS business_name
       FROM orders o
       JOIN businesses b ON b.id = o.business_id
       WHERE o.id = $1 AND o.business_id = $2
         AND ($3::uuid IS NULL OR o.branch_id = $3::uuid)`,
      [orderId, businessId, waiterBranchId]
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

    const availableProviders = []
    if (process.env.MTN_MOMO_SUBSCRIPTION_KEY && process.env.MTN_MOMO_API_USER && process.env.MTN_MOMO_API_KEY) {
      availableProviders.push('mtn_momo')
    }
    if (process.env.AIRTEL_MONEY_CLIENT_ID && process.env.AIRTEL_MONEY_CLIENT_SECRET) {
      availableProviders.push('airtel_money')
    }
    if (!availableProviders.length) {
      return res.status(503).json({ error: 'Automatic QR payments need MTN MoMo or Airtel Money credentials configured on the server.' })
    }

    const frontendUrl = await appBaseUrl(req)
    if (!frontendUrl) {
      return res.status(503).json({ error: 'The platform administrator must set the app address (Settings → Platform Info) before payment QR codes can be generated.' })
    }
    const paymentUrl = new URL('/payment', frontendUrl)
    paymentUrl.searchParams.set('orderId', order.id)
    paymentUrl.searchParams.set('providers', availableProviders.join(','))
    const qrPayload = paymentUrl.toString()

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
