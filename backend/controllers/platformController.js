import { query, pool as dbPool } from '../config/database.js'
import { sign, verify as verifyToken } from '../config/jwt.js'
import { ensurePlanPriceColumns, parsePlanInput, planForClient, planPrices } from '../services/subscriptionPricing.js'
import bcrypt from 'bcryptjs'
import { deleteBusinessCompletely, ensureBusinessStatusSchema } from '../services/businessStatus.js'
import { clearFailedLogins, lockedMinutes, lockedResponse, recordFailedLogin, wrongPasswordMessage } from '../services/loginSecurity.js'
import { adminIpWhitelist, ipAllowed, invalidatePlatformSettings, normalizeIp, passwordPolicyError, requestIp } from '../services/platformSettings.js'
import os from 'os'
import { sendVerificationEmail } from '../services/emailService.js'
import { logAudit, getClientIp } from '../utils/audit.js'
import { adminCan, normalizeAdminPermissions, PLATFORM_MODULES } from '../middleware/authMiddleware.js'
import fs from 'fs'
import { restoreBackup as restoreBackupFile } from '../utils/backup.js'
import { recordBackup } from '../services/dailyJobs.js'
import {
  sendSubscriptionActivation,
  sendAdminSubscriptionActivation,
  sendAccountSuspended,
  sendAccountReactivated,
  sendPlanPriceChange,
} from '../services/emailNotificationService.js'
import { forgetSubscriptionAccess } from '../services/subscriptionAccess.js'
import { displayPhone, ensurePaymentCollectionSchema, shortReference } from '../services/subscriptionCollection.js'
import { isMobileMoneyApiConfigured, normalizeRwandaPhone } from '../services/mobileMoneyProviders.js'

// Record a platform-level activity entry (not tied to a business).
export async function logPlatformActivity({ req, actorName, actorId, action, module = 'Platform', category = 'activity' }) {
  try {
    const ip = req ? getClientIp(req) : null
    const device = req?.headers?.['user-agent'] || null
    await query(
      `INSERT INTO platform_activity_logs (actor_name, actor_id, action, module, category, ip_address, device)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [actorName || 'System', actorId || null, action, module, category, ip, device]
    )
  } catch (e) {
    // Non-fatal: never block the main request because logging failed.
    console.error('platform activity log failed:', e.message)
  }
}

// ============================================================
// PLATFORM ADMIN AUTH
// ============================================================

export async function platformLogin(req, res) {
  const { email, password } = req.body
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' })
  }
  try {
    if (!ipAllowed(requestIp(req), await adminIpWhitelist())) {
      return res.status(403).json({ error: 'Platform admin sign-in is not allowed from this network.', code: 'IP_NOT_ALLOWED' })
    }
    const lockMinutes = await lockedMinutes('admin', email)
    if (lockMinutes) return lockedResponse(res, lockMinutes)
    const { rows } = await query(
      'SELECT * FROM platform_admins WHERE email = $1 LIMIT 1',
      [email]
    )
    if (!rows.length) {
      const result = await recordFailedLogin('admin', email)
      return res.status(401).json({ error: wrongPasswordMessage(result, 'Invalid email or password.') })
    }
    const admin = rows[0]
    if (!admin.is_active && admin.role === 'super_admin') {
      await query('UPDATE platform_admins SET is_active = TRUE WHERE id = $1', [admin.id])
      admin.is_active = true
    }
    if (!admin.is_active) {
      return res.status(403).json({ error: 'Platform admin account is disabled.', code: 'ADMIN_INACTIVE' })
    }
    const valid = await bcrypt.compare(password, admin.password_hash)
    if (!valid) {
      const result = await recordFailedLogin('admin', email)
      return res.status(401).json({ error: wrongPasswordMessage(result, 'Invalid email or password.') })
    }
    await clearFailedLogins('admin', email)

    // Check if 2FA is enabled for platform
    const { rows: tfRows } = await query(
      "SELECT is_enabled, method FROM two_factor_settings WHERE scope = 'platform' AND business_id IS NULL ORDER BY updated_at DESC LIMIT 1"
    )
    const twoFactorEnabled = tfRows.length && tfRows[0].is_enabled
    const twoFactorMethod = tfRows.length ? tfRows[0].method : 'email'

    if (twoFactorEnabled) {
      // Generate and store 2FA code in platform_admins table
      const code = Math.floor(100000 + Math.random() * 900000).toString()
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000)
      await query(
        'UPDATE platform_admins SET two_factor_code = $1, two_factor_expires_at = $2, two_factor_verified = FALSE WHERE id = $3',
        [code, expiresAt, admin.id]
      )

      // Send verification email
      const emailSent = await sendVerificationEmail(admin.email, code, admin.full_name || 'Platform Admin')
      if (!emailSent) {
        return res.status(500).json({ error: 'Failed to send verification email. Please check SMTP configuration.' })
      }

      await logAudit({
        actorName: admin.full_name || admin.email,
        action: 'Platform admin login - 2FA code sent',
        targetModule: 'Platform',
        ipAddress: getClientIp(req),
      })

      return res.json({
        requires2FA: true,
        tempToken: null,
        method: twoFactorMethod,
        user: { id: admin.id, email: admin.email, name: admin.full_name || admin.email, role: admin.role || 'super_admin', isPlatformAdmin: true },
      })
    }

    await query('UPDATE platform_admins SET last_login = NOW() WHERE id = $1', [admin.id])
    const payload = {
      id: admin.id,
      name: admin.full_name || admin.email,
      email: admin.email,
      role: admin.role || 'super_admin',
      phone: admin.phone || null,
      permissions: admin.role === 'super_admin' ? [...PLATFORM_MODULES] : normalizeAdminPermissions(admin.permissions),
      isPlatformAdmin: true,
      isActive: admin.is_active,
      lastLogin: admin.last_login,
      createdAt: admin.created_at,
    }
    const token = sign(payload)
    await logAudit({
      actorName: admin.full_name || admin.email,
      action: 'Platform admin login',
      targetModule: 'Platform',
      ipAddress: getClientIp(req),
    })
    await logPlatformActivity({ req, actorName: admin.full_name || admin.email, actorId: admin.id, action: 'Signed in to platform', module: 'Auth', category: 'login' })
    res.json({ token, user: payload })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function verifyPlatform2FA(req, res) {
  const { adminId, code } = req.body
  if (!adminId || !code) {
    return res.status(400).json({ error: 'Admin ID and code are required.' })
  }
  try {
    if (!ipAllowed(requestIp(req), await adminIpWhitelist())) {
      return res.status(403).json({ error: 'Platform admin sign-in is not allowed from this network.', code: 'IP_NOT_ALLOWED' })
    }
    const lockMinutes2fa = await lockedMinutes('admin2fa', adminId)
    if (lockMinutes2fa) return lockedResponse(res, lockMinutes2fa)
    const { rows } = await query(
      'SELECT * FROM platform_admins WHERE id = $1 LIMIT 1',
      [adminId]
    ).catch((error) => {
      if (/invalid input syntax for type uuid/i.test(error.message)) return { rows: [] }
      throw error
    })
    if (!rows.length) {
      return res.status(404).json({ error: 'Admin not found.' })
    }
    const admin = rows[0]
    if (!admin.is_active) {
      return res.status(403).json({ error: 'Platform admin account is disabled.', code: 'ADMIN_INACTIVE' })
    }

    if (!admin.two_factor_code || admin.two_factor_verified) {
      return res.status(400).json({ error: 'No pending 2FA verification.' })
    }

    if (admin.two_factor_expires_at && new Date(admin.two_factor_expires_at) < new Date()) {
      return res.status(400).json({ error: 'Verification code has expired. Please login again.' })
    }

    if (admin.two_factor_code !== String(code).trim()) {
      // Too many wrong codes: lock 2FA for this admin and void the code (they must sign in again).
      const result = await recordFailedLogin('admin2fa', adminId)
      if (result.locked) {
        await query('UPDATE platform_admins SET two_factor_code = NULL, two_factor_expires_at = NULL WHERE id = $1', [adminId])
      }
      return res.status(400).json({ error: wrongPasswordMessage(result, 'Invalid verification code.') })
    }
    await clearFailedLogins('admin2fa', adminId)

    // Mark as verified and clear code
    await query(
      'UPDATE platform_admins SET two_factor_verified = TRUE, two_factor_code = NULL, two_factor_expires_at = NULL, last_login = NOW() WHERE id = $1',
      [adminId]
    )

    const payload = {
      id: admin.id,
      name: admin.full_name || admin.email,
      email: admin.email,
      role: admin.role || 'super_admin',
      phone: admin.phone || null,
      permissions: admin.role === 'super_admin' ? [...PLATFORM_MODULES] : normalizeAdminPermissions(admin.permissions),
      isPlatformAdmin: true,
      isActive: admin.is_active,
      lastLogin: new Date(),
      createdAt: admin.created_at,
    }
    const token = sign(payload)

    await logAudit({
      actorName: admin.full_name || admin.email,
      action: 'Platform admin 2FA verified',
      targetModule: 'Platform',
      ipAddress: getClientIp(req),
    })

    res.json({ token, user: payload })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// ============================================================
// BUSINESS MANAGEMENT
// ============================================================

export async function listBusinesses(req, res) {
  try {
    await ensureBusinessStatusSchema().catch(() => {})
    const { province, district } = req.query
    const where = []
    const params = []
    let idx = 1
    if (province) { where.push(`province = $${idx++}`); params.push(province) }
    if (district) { where.push(`district = $${idx++}`); params.push(district) }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const { rows } = await query(
      `SELECT b.*, 
        s.plan, s.status AS sub_status, s.current_period_end, s.payment_status AS sub_payment_status,
        COALESCE(s.is_active AND s.payment_status = 'verified'
          AND (s.current_period_end IS NULL OR s.current_period_end > NOW()), FALSE) AS has_active_subscription,
        sp.name AS plan_name,
        (SELECT COUNT(*) FROM users u WHERE u.business_id = b.id) AS user_count
       FROM businesses b
       LEFT JOIN LATERAL (
         SELECT * FROM subscriptions
         WHERE business_id = b.id
         ORDER BY (is_active = TRUE AND payment_status = 'verified'
           AND (current_period_end IS NULL OR current_period_end > NOW())) DESC, created_at DESC
         LIMIT 1
       ) s ON TRUE
       LEFT JOIN subscription_plans sp ON sp.id = s.plan_id
       ${whereSql}
       ORDER BY b.created_at DESC`,
      params
    )
    res.json(
  rows.map((r) => ({
    id: r.id,
    name: r.name,
    registrationCode: r.registration_code,
    contactEmail: r.contact_email,
    contactPhone: r.contact_phone,
    address: r.address,
    province: r.province,
    district: r.district,
    sector: r.sector,
    city: r.city,
    country: r.country,
    businessType: r.business_type,
    isVerified: r.is_verified,
    isSuspended: r.is_suspended,
    isDeactivated: r.is_deactivated === true,
    deactivatedBy: r.is_deactivated ? (r.deactivated_by || 'platform') : null,
    statusReason: r.status_reason || '',
    statusChangedAt: r.status_changed_at || null,
    unpaidAccessGranted: r.unpaid_access_granted,
    hasActiveSubscription: r.has_active_subscription,
    plan: r.plan_name || r.plan || 'N/A',
    subStatus: r.sub_status || 'inactive',
    subPaymentStatus: r.sub_payment_status || 'pending',
    userCount: Number(r.user_count) || 0,
    createdAt: r.created_at,
  }))
);
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function getBusiness(req, res) {
  const { id } = req.params
  try {
    await ensureBusinessStatusSchema().catch(() => {})
    const { rows } = await query(
      `SELECT b.*,
        s.plan, s.status AS sub_status, s.current_period_end, s.start_date,
        sp.name AS plan_name, sp.price_monthly, sp.price_yearly,
        (SELECT COUNT(*) FROM users u WHERE u.business_id = b.id) AS user_count,
        (SELECT COUNT(*) FROM branches br WHERE br.business_id = b.id) AS branch_count
       FROM businesses b
       LEFT JOIN subscriptions s ON s.business_id = b.id AND s.is_active = TRUE
       LEFT JOIN subscription_plans sp ON sp.id = s.plan_id
       WHERE b.id = $1`,
      [id]
    )
    if (!rows.length) return res.status(404).json({ error: 'Business not found.' })
    const b = rows[0]
    res.json({
      id: b.id,
      name: b.name,
      registrationCode: b.registration_code,
      contactEmail: b.contact_email,
      contactPhone: b.contact_phone,
      address: b.address,
      city: b.city,
      country: b.country,
      businessType: b.business_type,
      isVerified: b.is_verified,
      isSuspended: b.is_suspended,
      isDeactivated: b.is_deactivated === true,
      deactivatedBy: b.is_deactivated ? (b.deactivated_by || 'platform') : null,
      statusReason: b.status_reason || '',
      statusChangedAt: b.status_changed_at || null,
      unpaidAccessGranted: b.unpaid_access_granted,
      plan: b.plan_name || b.plan || 'N/A',
      subStatus: b.sub_status || 'inactive',
      userCount: Number(b.user_count) || 0,
      branchCount: Number(b.branch_count) || 0,
      createdAt: b.created_at,
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function toggleBusinessStatus(req, res) {
  const { id } = req.params
  // verify   - approve a newly registered business
  // suspend  - block everyone temporarily (policy, payment dispute, ...) — reason required
  // deactivate - close the account (business closed, inactive, at the owner's request) — reason required
  // activate - lift a suspension or deactivation
  const { action } = req.body
  const reason = String(req.body?.reason || '').trim().slice(0, 500)
  if (['suspend', 'deactivate'].includes(action) && reason.length < 3) {
    return res.status(400).json({ error: 'Give a reason. The business owner will see it.' })
  }
  try {
    await ensureBusinessStatusSchema()
    let updateQuery
    if (action === 'verify') {
      updateQuery = query('UPDATE businesses SET is_verified = TRUE, status_changed_at = NOW() WHERE id = $1 RETURNING id, name', [id])
    } else if (action === 'suspend') {
      updateQuery = query('UPDATE businesses SET is_suspended = TRUE, unpaid_access_granted = FALSE, status_reason = $2, status_changed_at = NOW() WHERE id = $1 RETURNING id, name', [id, reason])
    } else if (action === 'deactivate') {
      updateQuery = query(
        `UPDATE businesses SET is_deactivated = TRUE, deactivated_by = 'platform', is_suspended = FALSE,
           unpaid_access_granted = FALSE, status_reason = $2, status_changed_at = NOW()
         WHERE id = $1 RETURNING id, name`,
        [id, reason]
      )
    } else if (action === 'activate') {
      updateQuery = query(
        `UPDATE businesses SET is_suspended = FALSE, is_deactivated = FALSE, deactivated_by = NULL,
           status_reason = NULL, status_changed_at = NOW()
         WHERE id = $1 RETURNING id, name`,
        [id]
      )
    } else {
      return res.status(400).json({ error: 'Invalid action. Use: verify, suspend, deactivate, activate' })
    }
    const { rows } = await updateQuery
    if (!rows.length) return res.status(404).json({ error: 'Business not found.' })

    // Send email notifications based on action
    try {
      const { rows: bizData } = await query(
        `SELECT b.name AS business_name, b.contact_email,
                u.full_name AS owner_name, u.email AS owner_email,
                s.plan, s.current_period_end, s.amount_paid
         FROM businesses b
         LEFT JOIN users u ON u.business_id = b.id AND u.role = 'owner'
         LEFT JOIN subscriptions s ON s.business_id = b.id AND s.is_active = TRUE
         WHERE b.id = $1
         LIMIT 1`,
        [id]
      )

      if (['suspend', 'deactivate'].includes(action) && bizData.length) {
        const b = bizData[0]
        sendAccountSuspended({
          businessName: b.business_name,
          ownerName: b.owner_name || 'Business Owner',
          ownerEmail: b.owner_email || b.contact_email,
          reason: `${action === 'deactivate' ? 'Account deactivated' : 'Account suspended'} by the platform administrator: ${reason}`,
          businessId: id,
        }).catch(err => console.error('Failed to send account suspension email:', err.message))
      }

      if (action === 'activate' && bizData.length) {
        const b = bizData[0]
        sendAccountReactivated({
          businessName: b.business_name,
          ownerName: b.owner_name || 'Business Owner',
          ownerEmail: b.owner_email || b.contact_email,
          businessId: id,
        }).catch(err => console.error('Failed to send account reactivation email:', err.message))
      }
    } catch (emailErr) {
      console.error('Failed to prepare notification emails:', emailErr.message)
    }

    await logAudit({
      actorName: req.user?.name || 'Platform Admin',
      action: `Business ${action}: ${rows[0].name}${reason ? ` (reason: ${reason})` : ''}`,
      targetModule: 'Platform',
      ipAddress: getClientIp(req),
    })
    res.json({ success: true, business: rows[0] })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function setUnpaidBusinessAccess(req, res) {
  const { id } = req.params
  const { granted } = req.body
  if (typeof granted !== 'boolean') {
    return res.status(400).json({ error: 'granted must be a boolean.' })
  }

  try {
    const { rows } = await query(
      `UPDATE businesses b
       SET unpaid_access_granted = $2
       WHERE b.id = $1
         AND ($2 = FALSE OR (COALESCE(b.is_suspended, FALSE) = FALSE AND COALESCE(b.is_deactivated, FALSE) = FALSE))
       RETURNING b.id, b.name, b.unpaid_access_granted`,
      [id, granted]
    )
    if (!rows.length) {
      const { rows: existing } = await query('SELECT id FROM businesses WHERE id = $1', [id])
      if (!existing.length) return res.status(404).json({ error: 'Business not found.' })
      return res.status(409).json({ error: 'Unpaid access cannot be granted to a suspended or deactivated business.' })
    }

    forgetSubscriptionAccess(id)
    await logAudit({
      userId: req.user?.id,
      actorName: req.user?.name || req.user?.full_name || 'Platform Admin',
      action: `${granted ? 'Granted' : 'Revoked'} unpaid business access: ${rows[0].name}`,
      targetModule: 'Platform',
      ipAddress: getClientIp(req),
      businessId: id,
      metadata: { unpaidAccessGranted: granted },
    })

    res.json({ success: true, business: rows[0] })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// ============================================================
// SUBSCRIPTION PLANS
// ============================================================

export async function listPlans(req, res) {
  try {
    // The registration page calls this without signing in: it only sees active plans.
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    const caller = token ? verifyToken(token) : null
    const includeInactive = caller?.isPlatformAdmin === true
    const { rows } = await query(
      `SELECT * FROM subscription_plans
       ${includeInactive ? '' : 'WHERE is_active = TRUE'}
       ORDER BY sort_order ASC, price_monthly ASC, created_at ASC`
    )
    let usage = {}
    if (includeInactive) {
      const { rows: counts } = await query(
        `SELECT plan_id, COUNT(*) FILTER (WHERE is_active AND payment_status = 'verified')::int AS active,
                COUNT(*)::int AS total
         FROM subscriptions WHERE plan_id IS NOT NULL GROUP BY plan_id`
      )
      usage = Object.fromEntries(counts.map((c) => [c.plan_id, c]))
    }
    res.json(rows.map((p) => ({
      ...planForClient(p),
      ...(includeInactive ? { activeSubscriptions: usage[p.id]?.active || 0, totalSubscriptions: usage[p.id]?.total || 0 } : {}),
    })))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

function planColumnsSql(values) {
  const columns = []
  const params = []
  for (const [column, value] of Object.entries(values)) {
    if (column.startsWith('__')) continue
    params.push(value)
    columns.push({ column, placeholder: `$${params.length}${column === 'features' ? '::jsonb' : ''}` })
  }
  return { columns, params }
}

// Keeps the stored annual price (reports) and discount columns in line with the cycle prices.
function storeDerivedPlanColumns(values, merged) {
  const prices = planPrices(merged)
  values.price_yearly = prices.priceAnnually
  values.discount_quarterly = prices.discountQuarterly
  values.discount_annually = prices.discountAnnually
}

// Emails the owner of every business currently subscribed to the plan. Returns how many were emailed.
async function notifyPlanSubscribers(plan, prices) {
  const { rows } = await query(
    `SELECT DISTINCT ON (b.id) b.id, b.name, b.contact_email, s.billing_cycle, s.current_period_end,
            u.full_name AS owner_name, u.email AS owner_email
     FROM subscriptions s
     JOIN businesses b ON b.id = s.business_id
     LEFT JOIN users u ON u.business_id = b.id AND u.role = 'owner' AND u.is_active = TRUE
     WHERE s.plan_id = $1 AND s.is_active AND s.payment_status = 'verified' AND s.current_period_end > NOW()
     ORDER BY b.id, s.current_period_end DESC`,
    [plan.id]
  )
  const recipients = rows.filter((b) => b.owner_email || b.contact_email)
  for (const b of recipients) {
    // Sent in the background: the admin does not wait for the mail server.
    sendPlanPriceChange({
      businessName: b.name,
      ownerName: b.owner_name,
      ownerEmail: b.owner_email || b.contact_email,
      planName: plan.name,
      billingCycle: b.billing_cycle === 'yearly' ? 'annually' : b.billing_cycle,
      prices,
      renewalDate: b.current_period_end,
      businessId: b.id,
    }).catch((error) => console.error('plan price email failed:', error.message))
  }
  return recipients.length
}

export async function createPlan(req, res) {
  const { errors, values } = parsePlanInput(req.body)
  if (errors.length) return res.status(400).json({ error: errors.join(' ') })
  try {
    await ensurePlanPriceColumns()
    const { rows: existing } = await query('SELECT id FROM subscription_plans WHERE LOWER(name) = $1', [values.name.toLowerCase()])
    if (existing.length) return res.status(409).json({ error: `A plan named "${values.name}" already exists. Edit it instead.` })
    if (values.features === undefined) values.features = '[]'
    if (values.is_active === undefined) values.is_active = true
    if (values.sort_order === undefined) {
      const { rows: max } = await query('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM subscription_plans')
      values.sort_order = Number(max[0].next) || 1
    }
    storeDerivedPlanColumns(values, values)
    const { columns, params } = planColumnsSql(values)
    const { rows } = await query(
      `INSERT INTO subscription_plans (${columns.map((c) => c.column).join(', ')})
       VALUES (${columns.map((c) => c.placeholder).join(', ')}) RETURNING *`,
      params
    )
    await logPlatformActivity({ req, actorName: req.user?.name, action: `Created subscription plan: ${values.name}`, module: 'Plans' })
    res.status(201).json(planForClient(rows[0]))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function updatePlan(req, res) {
  const { id } = req.params
  const { errors, values } = parsePlanInput(req.body, { partial: true })
  if (errors.length) return res.status(400).json({ error: errors.join(' ') })
  try {
    await ensurePlanPriceColumns()
    const { rows: current } = await query('SELECT * FROM subscription_plans WHERE id = $1', [id])
    if (!current.length) return res.status(404).json({ error: 'Plan not found.' })
    if (values.name) {
      const { rows: clash } = await query('SELECT id FROM subscription_plans WHERE LOWER(name) = $1 AND id <> $2', [values.name.toLowerCase(), id])
      if (clash.length) return res.status(409).json({ error: `Another plan is already named "${values.name}".` })
    }
    if (values.__recomputeYearly) storeDerivedPlanColumns(values, { ...current[0], ...values })
    const { columns, params } = planColumnsSql(values)
    if (!columns.length) return res.status(400).json({ error: 'Nothing to update.' })
    params.push(id)
    const { rows } = await query(
      `UPDATE subscription_plans SET ${columns.map((c) => `${c.column} = ${c.placeholder}`).join(', ')}, updated_at = NOW()
       WHERE id = $${params.length} RETURNING *`,
      params
    )
    // Prices are read live by registration, the owner's subscription page, renewal and the charge,
    // so every business sees the new prices at once. A period that is already paid keeps its
    // price; the next renewal is charged at the new price.
    const before = planPrices(current[0])
    const after = planPrices(rows[0])
    const priceChanged = ['priceMonthly', 'priceQuarterly', 'priceAnnually'].some((k) => before[k] !== after[k])
    const notified = priceChanged && values.__notifyBusinesses ? await notifyPlanSubscribers(rows[0], after) : 0
    const change = priceChanged
      ? ` (prices ${before.priceMonthly}/${before.priceQuarterly}/${before.priceAnnually} -> ${after.priceMonthly}/${after.priceQuarterly}/${after.priceAnnually}${notified ? `, ${notified} business(es) emailed` : ''})`
      : ''
    await logPlatformActivity({ req, actorName: req.user?.name, actorId: req.user?.id, action: `Updated subscription plan: ${rows[0].name}${change}`, module: 'Plans' })
    res.json({ ...planForClient(rows[0]), priceChanged, notifiedBusinesses: notified })
  } catch (error) {
    if (/invalid input syntax for type uuid/i.test(error.message)) return res.status(404).json({ error: 'Plan not found.' })
    res.status(500).json({ error: error.message })
  }
}

// DELETE /platform/plans/:id — removes an unused plan; a plan businesses have used is deactivated instead.
export async function deletePlan(req, res) {
  const { id } = req.params
  try {
    const { rows: plan } = await query('SELECT id, name FROM subscription_plans WHERE id = $1', [id])
    if (!plan.length) return res.status(404).json({ error: 'Plan not found.' })
    const { rows: used } = await query('SELECT COUNT(*)::int AS n FROM subscriptions WHERE plan_id = $1', [id])
    if (used[0].n > 0) {
      await query('UPDATE subscription_plans SET is_active = FALSE, updated_at = NOW() WHERE id = $1', [id])
      await logPlatformActivity({ req, actorName: req.user?.name, action: `Deactivated subscription plan: ${plan[0].name}`, module: 'Plans' })
      return res.json({ deleted: false, deactivated: true, message: `"${plan[0].name}" has subscriptions, so it was deactivated instead of deleted. Businesses can no longer choose it.` })
    }
    await query('DELETE FROM subscription_plans WHERE id = $1', [id])
    await logPlatformActivity({ req, actorName: req.user?.name, action: `Deleted subscription plan: ${plan[0].name}`, module: 'Plans' })
    res.json({ deleted: true })
  } catch (error) {
    if (/invalid input syntax for type uuid/i.test(error.message)) return res.status(404).json({ error: 'Plan not found.' })
    res.status(500).json({ error: error.message })
  }
}

export async function listEmailNotifications(req, res) {
  try {
    const { businessId, limit = 50, offset = 0 } = req.query
    const { getEmailNotifications } = await import('../services/emailNotificationService.js')
    const notifications = await getEmailNotifications({
      businessId: businessId || null,
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0,
    })
    res.json(notifications)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// ============================================================
// DASHBOARD STATS
// ============================================================

export async function platformStats(req, res) {
  try {
    await ensureBusinessStatusSchema().catch(() => {})
    const [businesses, users, subscriptions, plans, revenue, expiring, admins, awaiting, chart] = await Promise.all([
      query(`SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE is_verified)::int AS verified,
               COUNT(*) FILTER (WHERE is_suspended)::int AS suspended,
               COUNT(*) FILTER (WHERE COALESCE(is_deactivated, FALSE))::int AS deactivated,
               COUNT(*) FILTER (WHERE NOT COALESCE(is_verified, FALSE) AND NOT COALESCE(is_suspended, FALSE)
                                  AND NOT COALESCE(is_deactivated, FALSE))::int AS pending
             FROM businesses`),
      query('SELECT COUNT(*)::int AS total FROM users'),
      query(`SELECT
                COUNT(*) FILTER (WHERE is_active AND payment_status = 'verified' AND current_period_end > NOW())::int AS active,
                COUNT(DISTINCT business_id) FILTER (WHERE payment_status = 'verified' AND current_period_end IS NOT NULL AND current_period_end <= NOW()
                  AND NOT EXISTS (SELECT 1 FROM subscriptions s2 WHERE s2.business_id = subscriptions.business_id
                    AND s2.is_active AND s2.payment_status = 'verified' AND s2.current_period_end > NOW()))::int AS expired
              FROM subscriptions`),
      query('SELECT COUNT(*)::int AS total FROM subscription_plans WHERE is_active = TRUE'),
      query(`SELECT COALESCE(SUM(amount), 0)::numeric AS monthly
              FROM platform_payments
              WHERE status IN ('paid', 'settled') AND paid_at >= date_trunc('month', NOW())`),
      query(`SELECT COUNT(*)::int AS soon FROM subscriptions
              WHERE is_active AND current_period_end BETWEEN NOW() AND NOW() + INTERVAL '7 days'`),
      query('SELECT COUNT(*)::int AS total FROM platform_admins WHERE is_active = TRUE'),
      query(`SELECT COUNT(*)::int AS n FROM platform_payments WHERE status = 'pending'
             AND provider_status IN ('AWAITING_BANK_TRANSFER', 'AWAITING_MANUAL_CONFIRMATION')`),
      query(`SELECT
               to_char(gs, 'Mon') AS month,
               COALESCE(SUM(CASE WHEN COALESCE(s.billing_cycle, p.billing_cycle) IN ('quarterly', 'annually', 'yearly') THEN 0
                                 ELSE p.amount END), 0)::numeric AS monthly,
               COALESCE(SUM(CASE WHEN COALESCE(s.billing_cycle, p.billing_cycle) = 'quarterly' THEN p.amount ELSE 0 END), 0)::numeric AS quarterly,
               COALESCE(SUM(CASE WHEN COALESCE(s.billing_cycle, p.billing_cycle) IN ('annually', 'yearly') THEN p.amount ELSE 0 END), 0)::numeric AS annual
             FROM generate_series(date_trunc('month', NOW()) - INTERVAL '5 months', date_trunc('month', NOW()), INTERVAL '1 month') gs
             LEFT JOIN platform_payments p ON date_trunc('month', p.paid_at) = gs AND p.status IN ('paid', 'settled')
             LEFT JOIN subscriptions s ON s.id = p.subscription_id
             GROUP BY gs
             ORDER BY gs`),
    ])
    res.json({
      totalBusinesses: businesses.rows[0].total,
      verifiedBusinesses: businesses.rows[0].verified,
      suspendedBusinesses: businesses.rows[0].suspended,
      deactivatedBusinesses: businesses.rows[0].deactivated,
      pendingVerification: businesses.rows[0].pending,
      totalUsers: users.rows[0].total,
      activeSubscriptions: subscriptions.rows[0].active,
      expiredSubscriptions: subscriptions.rows[0].expired,
      expiringSoon: expiring.rows[0].soon,
      monthlyRevenue: Number(revenue.rows[0].monthly) || 0,
      activePlans: plans.rows[0].total,
      totalAdmins: admins.rows[0].total,
      paymentsAwaitingConfirmation: awaiting.rows[0].n,
      revenueTotal6m: chart.rows.reduce((sum, r) => sum + Number(r.monthly) + Number(r.quarterly) + Number(r.annual), 0),
      chartData: chart.rows.map((r) => ({
        month: r.month,
        monthly: Number(r.monthly) || 0,
        quarterly: Number(r.quarterly) || 0,
        annual: Number(r.annual) || 0,
      })),
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// ============================================================
// BUSINESS: UPDATE + DELETE
// ============================================================

export async function updateBusiness(req, res) {
  const { id } = req.params
  const { name, contactEmail, contactPhone, address, city, country, businessType, registrationCode, province, district, sector } = req.body
  try {
    const fields = []
    const params = []
    let i = 1
    const add = (col, val) => { if (val !== undefined) { fields.push(`${col} = $${i++}`); params.push(val) } }
    add('name', name)
    add('contact_email', contactEmail)
    add('contact_phone', contactPhone)
    add('address', address)
    add('city', city)
    add('country', country)
    add('business_type', businessType)
    add('registration_code', registrationCode)
    add('province', province)
    add('district', district)
    add('sector', sector)
    if (!fields.length) return res.status(400).json({ error: 'No fields to update.' })
    params.push(id)
    const { rows } = await query(`UPDATE businesses SET ${fields.join(', ')} WHERE id = $${i} RETURNING id, name`, params)
    if (!rows.length) return res.status(404).json({ error: 'Business not found.' })
    await logPlatformActivity({ req, actorName: req.user?.name, action: `Updated business: ${rows[0].name}`, module: 'Businesses' })
    res.json({ success: true, business: rows[0] })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function deleteBusiness(req, res) {
  const { id } = req.params
  try {
    // Removes every row that belongs to the business (users, branches, orders, payments, ...).
    const deleted = await deleteBusinessCompletely(id)
    if (!deleted) return res.status(404).json({ error: 'Business not found.' })
    await logPlatformActivity({ req, actorName: req.user?.name, action: `Deleted business: ${deleted.name}`, module: 'Businesses' })
    res.json({ success: true })
  } catch (error) {
    if (/invalid input syntax for type uuid/i.test(error.message)) return res.status(404).json({ error: 'Business not found.' })
    res.status(500).json({ error: error.message })
  }
}

// ============================================================
// SUBSCRIPTIONS (platform-wide)
// ============================================================

export async function listSubscriptions(req, res) {
  try {
    const { rows } = await query(
      `SELECT s.id, s.plan, s.billing_cycle, s.status, s.payment_status, s.is_active,
              s.start_date, s.current_period_end, s.next_renewal_date, s.amount_paid,
              s.discount_percent,
              GREATEST(0, CEIL(EXTRACT(EPOCH FROM (s.current_period_end - NOW())) / 86400))::int AS days_remaining,
              b.name AS business_name, b.id AS business_id, sp.name AS plan_name
       FROM subscriptions s
       LEFT JOIN businesses b ON b.id = s.business_id
       LEFT JOIN subscription_plans sp ON sp.id = s.plan_id
       ORDER BY s.created_at DESC
       LIMIT 500`
    )
    res.json(rows.map((r) => ({
      id: r.id,
      businessId: r.business_id,
      business: r.business_name || 'N/A',
      plan: r.plan_name || r.plan || 'N/A',
      billingCycle: r.billing_cycle || 'monthly',
      status: r.payment_status === 'verified' && r.is_active && new Date(r.current_period_end) > new Date() ? 'active'
        : r.payment_status === 'verified' && r.is_active ? 'expired'
          : r.status || r.payment_status,
      amount: Number(r.amount_paid) || 0,
      discountPercent: Number(r.discount_percent) || 0,
      startDate: r.start_date,
      expiryDate: r.current_period_end,
      nextRenewal: r.next_renewal_date,
      daysRemaining: Number(r.days_remaining) || 0,
    })))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// Active paid subscriptions, by billing cycle and by plan (prices live on the plans themselves).
export async function subscriptionSummary(req, res) {
  try {
    const [byCycle, byPlan] = await Promise.all([
      query(`SELECT billing_cycle, COUNT(*)::int AS count
             FROM subscriptions
             WHERE is_active AND payment_status = 'verified' AND COALESCE(current_period_end, expiration_date) > NOW()
             GROUP BY billing_cycle`),
      query(`SELECT COALESCE(sp.name, s.plan) AS plan, COUNT(*)::int AS count
             FROM subscriptions s LEFT JOIN subscription_plans sp ON sp.id = s.plan_id
             WHERE s.is_active AND s.payment_status = 'verified' AND COALESCE(s.current_period_end, s.expiration_date) > NOW()
             GROUP BY 1 ORDER BY 2 DESC`),
    ])
    const counts = { monthly: 0, quarterly: 0, annually: 0 }
    byCycle.rows.forEach((r) => { if (r.billing_cycle) counts[r.billing_cycle === 'yearly' ? 'annually' : r.billing_cycle] += r.count })
    res.json({ counts, byPlan: byPlan.rows })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function updateSubscriptionAdmin(req, res) {
  const { id } = req.params
  const { action } = req.body
  try {
    let rows
    if (action === 'cancel') {
      ({ rows } = await query(
        `UPDATE subscriptions SET status = 'cancelled', is_active = FALSE, cancelled_at = NOW()
         WHERE id = $1 RETURNING id, business_id`,
        [id]
      ))
    } else if (action === 'extend') {
      const days = Math.round(Number(req.body.days))
      if (!Number.isFinite(days) || days < 1 || days > 366) return res.status(400).json({ error: 'Extend by 1 to 366 days.' })
      ;({ rows } = await query(
        `UPDATE subscriptions
         SET current_period_end = GREATEST(COALESCE(current_period_end, NOW()), NOW()) + ($2 || ' days')::interval,
             expiration_date = GREATEST(COALESCE(current_period_end, NOW()), NOW()) + ($2 || ' days')::interval,
             next_renewal_date = GREATEST(COALESCE(current_period_end, NOW()), NOW()) + ($2 || ' days')::interval,
             is_active = TRUE, status = 'active', reminder_sent_at = NULL
         WHERE id = $1 AND payment_status = 'verified' AND cancelled_at IS NULL
         RETURNING id, business_id`,
        [id, String(days)]
      ))
      if (!rows.length) return res.status(409).json({ error: 'Only paid subscriptions that were not cancelled or refunded can be extended.' })
    } else {
      return res.status(400).json({ error: 'Invalid action. Use cancel or extend. To let a business work without a subscription, use "Grant unpaid access" on the business.' })
    }
    if (!rows.length) return res.status(404).json({ error: 'Subscription not found.' })
    forgetSubscriptionAccess(rows[0].business_id)
    await logPlatformActivity({ req, actorName: req.user?.name, action: `Subscription ${action}${action === 'extend' ? ` by ${req.body.days} days` : ''} (${id})`, module: 'Subscriptions' })
    res.json({ success: true })
  } catch (error) {
    if (/invalid input syntax for type uuid/i.test(error.message)) return res.status(404).json({ error: 'Subscription not found.' })
    res.status(500).json({ error: error.message })
  }
}

// ============================================================
// PAYMENTS + REFUNDS
// ============================================================

export async function listPayments(req, res) {
  try {
    await ensurePaymentCollectionSchema()
    const { rows } = await query(
      `SELECT p.*, b.name AS business_name
       FROM platform_payments p
       LEFT JOIN businesses b ON b.id = p.business_id
       ORDER BY p.paid_at DESC NULLS LAST, p.created_at DESC`
    )
    res.json(rows.map((p) => ({
      id: p.id,
      business: p.business_name || 'N/A',
      businessId: p.business_id,
      plan: p.plan || 'N/A',
      billingCycle: p.billing_cycle,
      amount: Number(p.amount) || 0,
      method: p.payment_method,
      transactionId: p.transaction_id,
      reference: shortReference(p.transaction_id),
      status: p.status,
      providerStatus: p.provider_status,
      payTo: p.pay_to || '',
      payerPhone: p.payer_phone ? displayPhone(p.payer_phone) : '',
      payerReference: p.payer_reference || '',
      reviewNote: p.review_note || '',
      awaitingConfirmation: p.status === 'pending' && ['AWAITING_BANK_TRANSFER', 'AWAITING_MANUAL_CONFIRMATION'].includes(p.provider_status),
      date: p.status === 'pending' ? p.created_at : (p.paid_at || p.created_at),
    })))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function paymentStats(req, res) {
  try {
    const { rows } = await query(
      `SELECT
         COALESCE(SUM(amount) FILTER (WHERE status IN ('paid', 'settled')), 0)::numeric AS collected,
         COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
         COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
         COUNT(*) FILTER (WHERE status = 'refunded')::int AS refunded,
         COUNT(*) FILTER (WHERE status = 'settled')::int AS settled
       FROM platform_payments`
    )
    const r = rows[0]
    res.json({ collected: Number(r.collected) || 0, pending: r.pending, failed: r.failed, refunded: r.refunded, settled: r.settled })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function refundPayment(req, res) {
  const { id } = req.params
  const { reason } = req.body
  try {
    const { rows: pay } = await query('SELECT * FROM platform_payments WHERE id = $1', [id])
    if (!pay.length) return res.status(404).json({ error: 'Payment not found.' })
    const p = pay[0]
    if (!['paid', 'settled'].includes(p.status)) {
      return res.status(400).json({ error: 'Only paid or settled payments can be refunded.' })
    }
    await query('UPDATE platform_payments SET status = \'refunded\' WHERE id = $1 RETURNING id', [id])
    // The refunded payment no longer pays for its subscription period.
    if (p.subscription_id) {
      await query(
        `UPDATE subscriptions SET is_active = FALSE, status = 'refunded', payment_status = 'refunded', cancelled_at = NOW()
         WHERE id = $1`,
        [p.subscription_id]
      )
      forgetSubscriptionAccess(p.business_id)
    }
    await query(
      `INSERT INTO platform_refunds (payment_id, business_id, amount, reason, processed_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, p.business_id, p.amount, reason || 'Refund issued by admin', req.user?.name || 'Platform Admin']
    )
    await logPlatformActivity({ req, actorName: req.user?.name, action: `Refunded payment ${p.transaction_id || id}`, module: 'Payments' })
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// POST /platform/payments/:id/confirm — the admin confirms a pending payment (e.g. a bank transfer
// they have received). Activates the subscription exactly like a provider confirmation.
export async function confirmPayment(req, res) {
  const { id } = req.params
  try {
    const { rows: pay } = await query('SELECT * FROM platform_payments WHERE id = $1', [id])
    if (!pay.length) return res.status(404).json({ error: 'Payment not found.' })
    const p = pay[0]
    if (p.status !== 'pending') return res.status(400).json({ error: 'Only pending payments can be confirmed.' })
    if (!p.subscription_id) return res.status(400).json({ error: 'This payment is not linked to a subscription.' })
    const { completeSubscriptionPayment } = await import('./ownerController.js')
    const result = await completeSubscriptionPayment(id, p.business_id, 'CONFIRMED_BY_ADMIN', { confirmedBy: req.user?.name || 'Platform Admin', confirmedAt: new Date().toISOString() })
    forgetSubscriptionAccess(p.business_id)
    await logPlatformActivity({ req, actorName: req.user?.name, action: `Confirmed ${p.payment_method || ''} payment ${p.transaction_id || id} (${p.amount})`, module: 'Payments' })
    res.json({ success: true, receiptNumber: result.receiptNumber })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// POST /platform/payments/:id/reject  { reason } — the money never arrived (or the wrong amount):
// the pending payment is closed so the business can start a new one.
export async function rejectPayment(req, res) {
  const { id } = req.params
  const reason = String(req.body?.reason || '').trim().slice(0, 300)
  if (reason.length < 3) return res.status(400).json({ error: 'Give a reason. The business owner will see it.' })
  try {
    await ensurePaymentCollectionSchema()
    const { rows } = await query(
      `UPDATE platform_payments SET status = 'failed', provider_status = 'REJECTED_BY_ADMIN', review_note = $2
       WHERE id = $1 AND status = 'pending' RETURNING id, subscription_id, business_id, transaction_id, amount`,
      [id, reason]
    )
    if (!rows.length) return res.status(409).json({ error: 'Only pending payments can be rejected.' })
    if (rows[0].subscription_id) {
      await query(`UPDATE subscriptions SET status = 'payment_failed', payment_status = 'failed' WHERE id = $1 AND payment_status = 'pending'`, [rows[0].subscription_id])
    }
    await logPlatformActivity({ req, actorName: req.user?.name, actorId: req.user?.id, action: `Rejected payment ${shortReference(rows[0].transaction_id)} (${rows[0].amount}): ${reason}`, module: 'Payments' })
    res.json({ success: true })
  } catch (error) {
    if (/invalid input syntax for type uuid/i.test(error.message)) return res.status(404).json({ error: 'Payment not found.' })
    res.status(500).json({ error: error.message })
  }
}

export async function settlePayment(req, res) {
  const { id } = req.params
  try {
    const { rows: pay } = await query('SELECT * FROM platform_payments WHERE id = $1', [id])
    if (!pay.length) return res.status(404).json({ error: 'Payment not found.' })
    const p = pay[0]
    if (p.status === 'settled') return res.status(400).json({ error: 'Payment is already settled.' })
    if (p.status !== 'paid') return res.status(400).json({ error: 'Only paid payments can be settled.' })
    await ensurePaymentCollectionSchema()
    await query('UPDATE platform_payments SET status = \'settled\', paid_at = COALESCE(paid_at, NOW()) WHERE id = $1 RETURNING id', [id])
    await logPlatformActivity({ req, actorName: req.user?.name, action: `Settled payment ${p.transaction_id || id}`, module: 'Payments' })
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// ============================================================
// PLATFORM ADMINS (Users page)
// ============================================================

const ADMIN_ROLES = ['super_admin', 'admin', 'billing']
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function adminForClient(a) {
  return {
    id: a.id,
    name: a.full_name,
    email: a.email,
    phone: a.phone || '',
    role: a.role,
    isActive: a.is_active,
    lastLogin: a.last_login,
    permissions: a.role === 'super_admin' ? [...PLATFORM_MODULES] : normalizeAdminPermissions(a.permissions),
    createdAt: a.created_at,
  }
}

async function activeSuperAdminCount(excludeId = null) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS n FROM platform_admins WHERE role = 'super_admin' AND is_active = TRUE ${excludeId ? 'AND id <> $1' : ''}`,
    excludeId ? [excludeId] : []
  )
  return rows[0].n
}

// GET /platform/me — the signed-in admin with fresh role and permissions.
export async function platformMe(req, res) {
  const u = req.user
  res.json({
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone || null,
    role: u.role,
    isPlatformAdmin: true,
    permissions: u.role === 'super_admin' ? [...PLATFORM_MODULES] : u.permissions || [],
  })
}

export async function listAdmins(req, res) {
  try {
    const { rows } = await query('SELECT id, email, full_name, role, phone, is_active, last_login, permissions, created_at FROM platform_admins ORDER BY created_at ASC')
    res.json(rows.map(adminForClient))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function createAdmin(req, res) {
  const name = String(req.body?.name || '').trim()
  const email = String(req.body?.email || '').trim().toLowerCase()
  const { password, phone } = req.body
  const role = req.body?.role || 'admin'
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, and password are required.' })
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' })
  if (!ADMIN_ROLES.includes(role)) return res.status(400).json({ error: `Role must be one of: ${ADMIN_ROLES.join(', ')}.` })
  if (role === 'super_admin' && req.user?.role !== 'super_admin') {
    return res.status(403).json({ error: 'Only a super admin can create another super admin.' })
  }
  const permissions = role === 'super_admin' ? [...PLATFORM_MODULES] : normalizeAdminPermissions(req.body?.permissions || [])
  // An admin cannot hand out modules they do not have themselves.
  const beyond = permissions.filter((p) => !adminCan(req.user, p))
  if (beyond.length) return res.status(403).json({ error: `You cannot grant access you do not have: ${beyond.join(', ')}.` })
  const passwordProblem = await passwordPolicyError(password)
  if (passwordProblem) return res.status(400).json({ error: passwordProblem })
  try {
    const { rows: existing } = await query('SELECT id FROM platform_admins WHERE LOWER(email) = $1', [email])
    if (existing.length) return res.status(409).json({ error: 'An admin with this email already exists.' })
    const hash = await bcrypt.hash(password, 10)
    const { rows } = await query(
      `INSERT INTO platform_admins (email, password_hash, full_name, role, phone, permissions)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, full_name, email`,
      [email, hash, name, role, phone || null, JSON.stringify(permissions)]
    )
    await logPlatformActivity({ req, actorName: req.user?.name, actorId: req.user?.id, action: `Created ${role.replace('_', ' ')}: ${email}`, module: 'Users', category: 'security' })
    res.status(201).json({ success: true, admin: rows[0] })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// Shared checks for changing another admin: only a super admin may touch a super admin.
async function loadTargetAdmin(req, res, id) {
  const { rows } = await query('SELECT id, role, email, is_active FROM platform_admins WHERE id = $1 LIMIT 1', [id]).catch((error) => {
    if (/invalid input syntax for type uuid/i.test(error.message)) return { rows: [] }
    throw error
  })
  if (!rows.length) { res.status(404).json({ error: 'Admin not found.' }); return null }
  if (rows[0].role === 'super_admin' && req.user?.role !== 'super_admin') {
    res.status(403).json({ error: 'Only a super admin can change a super admin account.' })
    return null
  }
  return rows[0]
}

export async function updateAdmin(req, res) {
  const { id } = req.params
  const { name, email, role, phone, isActive, permissions } = req.body
  try {
    const target = await loadTargetAdmin(req, res, id)
    if (!target) return
    const self = target.id === req.user?.id
    const nextRole = role === undefined ? target.role : role
    if (!ADMIN_ROLES.includes(nextRole)) return res.status(400).json({ error: `Role must be one of: ${ADMIN_ROLES.join(', ')}.` })
    if (self && role !== undefined && role !== target.role) return res.status(400).json({ error: 'You cannot change your own role.' })
    if (self && permissions !== undefined && target.role !== 'super_admin') return res.status(400).json({ error: 'You cannot change your own permissions.' })
    if (self && isActive === false) return res.status(400).json({ error: 'You cannot deactivate your own account.' })
    if (nextRole === 'super_admin' && target.role !== 'super_admin' && req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only a super admin can promote an admin to super admin.' })
    }
    // Never leave the platform without an active super admin.
    const losesSuper = target.role === 'super_admin' && target.is_active && (nextRole !== 'super_admin' || isActive === false)
    if (losesSuper && await activeSuperAdminCount(target.id) === 0) {
      return res.status(400).json({ error: 'This is the last active super admin. Make another admin super admin first.' })
    }

    const fields = []
    const params = []
    let i = 1
    const add = (col, val) => { fields.push(`${col} = $${i++}`); params.push(val) }
    if (name !== undefined) {
      if (!String(name).trim()) return res.status(400).json({ error: 'Name cannot be empty.' })
      add('full_name', String(name).trim())
    }
    if (email !== undefined) {
      const clean = String(email).trim().toLowerCase()
      if (!EMAIL_RE.test(clean)) return res.status(400).json({ error: 'Enter a valid email address.' })
      const { rows: clash } = await query('SELECT id FROM platform_admins WHERE LOWER(email) = $1 AND id <> $2', [clean, id])
      if (clash.length) return res.status(409).json({ error: 'Another admin already uses this email.' })
      add('email', clean)
    }
    if (role !== undefined) add('role', nextRole)
    if (phone !== undefined) add('phone', phone || null)
    if (isActive !== undefined) add('is_active', isActive === true)
    if (nextRole === 'super_admin') {
      if (role !== undefined || permissions !== undefined) add('permissions', JSON.stringify([...PLATFORM_MODULES]))
    } else if (permissions !== undefined) {
      const list = normalizeAdminPermissions(permissions)
      const beyond = list.filter((p) => !adminCan(req.user, p))
      if (beyond.length) return res.status(403).json({ error: `You cannot grant access you do not have: ${beyond.join(', ')}.` })
      add('permissions', JSON.stringify(list))
    }
    if (!fields.length) return res.status(400).json({ error: 'No fields to update.' })
    fields.push('updated_at = NOW()')
    params.push(id)
    const { rows } = await query(`UPDATE platform_admins SET ${fields.join(', ')} WHERE id = $${i} RETURNING id, email`, params)
    if (!rows.length) return res.status(404).json({ error: 'Admin not found.' })
    const onlyStatus = isActive !== undefined && Object.keys(req.body).length === 1
    const what = onlyStatus
      ? `${isActive ? 'Activated' : 'Deactivated'} admin: ${rows[0].email}`
      : `Updated admin: ${rows[0].email}${role !== undefined && role !== target.role ? ` (role ${target.role} -> ${nextRole})` : ''}`
    await logPlatformActivity({ req, actorName: req.user?.name, actorId: req.user?.id, action: what, module: 'Users', category: 'security' })
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function resetAdminPassword(req, res) {
  const { id } = req.params
  const { password } = req.body
  const passwordProblem = await passwordPolicyError(password)
  if (passwordProblem) return res.status(400).json({ error: passwordProblem })
  try {
    const target = await loadTargetAdmin(req, res, id)
    if (!target) return
    const hash = await bcrypt.hash(password, 10)
    const { rows } = await query('UPDATE platform_admins SET password_hash = $1, updated_at = NOW() WHERE id = $2 RETURNING email', [hash, id])
    if (!rows.length) return res.status(404).json({ error: 'Admin not found.' })
    await clearFailedLogins('admin', rows[0].email)
    await logPlatformActivity({ req, actorName: req.user?.name, actorId: req.user?.id, action: `Reset password for admin: ${rows[0].email}`, module: 'Users', category: 'security' })
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function deleteAdmin(req, res) {
  const { id } = req.params
  try {
    if (req.user?.id === id) return res.status(400).json({ error: 'You cannot delete your own account.' })
    const target = await loadTargetAdmin(req, res, id)
    if (!target) return
    if (target.role === 'super_admin' && await activeSuperAdminCount(target.id) === 0) {
      return res.status(400).json({ error: 'This is the last active super admin and cannot be deleted.' })
    }
    const { rows } = await query('DELETE FROM platform_admins WHERE id = $1 RETURNING email', [id])
    if (!rows.length) return res.status(404).json({ error: 'Admin not found.' })
    await logPlatformActivity({ req, actorName: req.user?.name, actorId: req.user?.id, action: `Deleted admin: ${rows[0].email}`, module: 'Users', category: 'security' })
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// GET /platform/activity?module=&category=&q=&limit=&offset= — platform admin activity log.
export async function listPlatformActivity(req, res) {
  try {
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50))
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0)
    const where = []
    const params = []
    const { module, category, q } = req.query
    if (module) { params.push(String(module)); where.push(`module = $${params.length}`) }
    if (category) { params.push(String(category)); where.push(`category = $${params.length}`) }
    if (q) { params.push(`%${String(q).trim()}%`); where.push(`(action ILIKE $${params.length} OR actor_name ILIKE $${params.length})`) }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const [list, total, modules] = await Promise.all([
      query(`SELECT * FROM platform_activity_logs ${whereSql} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`, params),
      query(`SELECT COUNT(*)::int AS n FROM platform_activity_logs ${whereSql}`, params),
      query('SELECT DISTINCT module FROM platform_activity_logs WHERE module IS NOT NULL ORDER BY module'),
    ])
    res.json({
      total: total.rows[0].n,
      modules: modules.rows.map((m) => m.module),
      items: list.rows.map((r) => ({
        id: r.id,
        actor: r.actor_name || 'System',
        action: r.action,
        module: r.module,
        category: r.category,
        ip: r.ip_address,
        device: r.device,
        createdAt: r.created_at,
      })),
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// GET /platform/health — real checks behind the dashboard "System Status" panel.
export async function platformHealth(req, res) {
  const started = Date.now()
  let database = { ok: false, latencyMs: null, error: null }
  try {
    await query('SELECT 1')
    database = { ok: true, latencyMs: Date.now() - started, error: null }
  } catch (error) {
    database.error = String(error.message).split('\n')[0]
  }
  let email = { configured: false }
  let lastBackup = null
  if (database.ok) {
    try {
      const { rows } = await query(`SELECT setting_key, setting_value FROM platform_settings WHERE setting_key IN ('email_smtp_host', 'email_smtp_user')`)
      const map = Object.fromEntries(rows.map((r) => [r.setting_key, r.setting_value]))
      email = { configured: Boolean((map.email_smtp_host && map.email_smtp_user) || process.env.SMTP_HOST || process.env.SMTP_USER || process.env.EMAIL_USER) }
    } catch { /* settings table missing */ }
    try {
      const { rows } = await query('SELECT created_at, status FROM platform_backups ORDER BY created_at DESC LIMIT 1')
      lastBackup = rows[0] ? { at: rows[0].created_at, status: rows[0].status } : null
    } catch { /* no backups table */ }
  }
  const mem = process.memoryUsage()
  res.json({
    server: { ok: true, uptimeSeconds: Math.round(process.uptime()), node: process.version, memoryMb: Math.round(mem.rss / 1048576) },
    database,
    email,
    lastBackup,
    checkedAt: new Date().toISOString(),
  })
}

// ============================================================
// REPORTS / ANALYTICS
// ============================================================

export async function reportsOverview(req, res) {
  try {
    const [income, growth, byPlan, paymentStatsRow] = await Promise.all([
      query(`SELECT
               COALESCE(SUM(amount) FILTER (WHERE status IN ('paid','settled') AND paid_at >= date_trunc('month', NOW())), 0)::numeric AS this_month,
               COALESCE(SUM(amount) FILTER (WHERE status IN ('paid','settled') AND paid_at >= date_trunc('year', NOW())), 0)::numeric AS this_year,
               COALESCE(SUM(amount) FILTER (WHERE status IN ('paid','settled')), 0)::numeric AS all_time
             FROM platform_payments`),
      query(`SELECT to_char(gs, 'Mon') AS label,
                    (SELECT COUNT(*)::int FROM businesses b WHERE date_trunc('month', b.created_at) = date_trunc('month', gs)) AS registrations,
                    (SELECT COALESCE(SUM(amount),0)::numeric FROM platform_payments p WHERE p.status IN ('paid','settled') AND date_trunc('month', p.paid_at) = date_trunc('month', gs)) AS revenue
             FROM generate_series(date_trunc('month', NOW()) - INTERVAL '5 months', date_trunc('month', NOW()), INTERVAL '1 month') gs
             ORDER BY gs`),
      query(`SELECT COALESCE(sp.name, s.plan) AS plan, COUNT(*)::int AS count
             FROM subscriptions s LEFT JOIN subscription_plans sp ON sp.id = s.plan_id
             WHERE s.is_active AND s.payment_status = 'verified'
               AND COALESCE(s.current_period_end, s.expiration_date) > NOW()
             GROUP BY COALESCE(sp.name, s.plan) ORDER BY count DESC`),
      query(`SELECT status, COUNT(*)::int AS count FROM platform_payments GROUP BY status`),
    ])
    res.json({
      income: {
        thisMonth: Number(income.rows[0].this_month) || 0,
        thisYear: Number(income.rows[0].this_year) || 0,
        allTime: Number(income.rows[0].all_time) || 0,
      },
      growth: growth.rows.map((g) => ({ label: g.label, registrations: Number(g.registrations) || 0, revenue: Number(g.revenue) || 0 })),
      byPlan: byPlan.rows.map((p) => ({ plan: p.plan || 'N/A', count: p.count })),
      paymentStats: paymentStatsRow.rows.map((p) => ({ status: p.status, count: p.count })),
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// ============================================================
// PLATFORM SETTINGS
// ============================================================

// Settings the admin can change, their group and how each value is checked.
// Anything not listed here (old SMS / API / global price keys) is ignored.
const SETTING_RULES = {
  platform_name: { group: 'general', type: 'text', max: 60 },
  platform_language: { group: 'general', type: 'enum', values: ['en', 'fr', 'rw'] },
  platform_currency: { group: 'general', type: 'enum', values: ['RWF', 'USD', 'EUR', 'KES', 'UGX', 'TZS'] },
  maintenance_mode: { group: 'maintenance', type: 'bool' },
  maintenance_message: { group: 'maintenance', type: 'text', max: 300 },
  platform_logo: { group: 'platform_info', type: 'text', max: 500 },
  platform_website: { group: 'platform_info', type: 'text', max: 200 },
  platform_contact_email: { group: 'platform_info', type: 'email' },
  platform_contact_phone: { group: 'platform_info', type: 'text', max: 40 },
  platform_description: { group: 'platform_info', type: 'text', max: 500 },
  platform_app_url: { group: 'platform_info', type: 'url' },
  email_smtp_host: { group: 'email', type: 'text', max: 200 },
  email_smtp_port: { group: 'email', type: 'int', min: 1, max: 65535 },
  email_smtp_user: { group: 'email', type: 'text', max: 200 },
  email_smtp_password: { group: 'email', type: 'secret' },
  email_from_address: { group: 'email', type: 'email' },
  email_from_name: { group: 'email', type: 'text', max: 80 },
  email_notifications_enabled: { group: 'notification', type: 'bool' },
  notify_new_business: { group: 'notification', type: 'bool' },
  notify_payment_received: { group: 'notification', type: 'bool' },
  notify_subscription_expiry: { group: 'notification', type: 'bool' },
  security_min_password_length: { group: 'security', type: 'int', min: 6, max: 64 },
  security_require_2fa: { group: 'security', type: 'bool' },
  security_session_timeout: { group: 'security', type: 'int', min: 5, max: 10080 },
  security_max_login_attempts: { group: 'security', type: 'int', min: 3, max: 50 },
  security_ip_whitelist: { group: 'security', type: 'iplist' },
  backup_auto_enabled: { group: 'backup', type: 'bool' },
  backup_frequency: { group: 'backup', type: 'enum', values: ['daily', 'weekly', 'monthly'] },
  backup_retention_days: { group: 'backup', type: 'int', min: 1, max: 3650 },
  audit_log_enabled: { group: 'audit', type: 'bool' },
  audit_log_login_events: { group: 'audit', type: 'bool' },
  audit_log_retention_days: { group: 'audit', type: 'int', min: 7, max: 3650 },
  payment_momo_enabled: { group: 'payment', type: 'bool' },
  payment_momo_mode: { group: 'payment', type: 'enum', values: ['manual', 'api'] },
  payment_momo_number: { group: 'payment', type: 'rwphone' },
  payment_momo_name: { group: 'payment', type: 'text', max: 80 },
  payment_momo_code: { group: 'payment', type: 'text', max: 40 },
  payment_airtel_enabled: { group: 'payment', type: 'bool' },
  payment_airtel_mode: { group: 'payment', type: 'enum', values: ['manual', 'api'] },
  payment_airtel_number: { group: 'payment', type: 'rwphone' },
  payment_airtel_name: { group: 'payment', type: 'text', max: 80 },
  payment_airtel_code: { group: 'payment', type: 'text', max: 40 },
  payment_bank_enabled: { group: 'payment', type: 'bool' },
  payment_bank_account: { group: 'payment', type: 'text', max: 200 },
  qr_error_correction: { group: 'qr', type: 'enum', values: ['L', 'M', 'Q', 'H'] },
  qr_include_logo: { group: 'qr', type: 'bool' },
  subscription_renewal_reminder_days: { group: 'subscription', type: 'int', min: 1, max: 60 },
  subscription_grace_days: { group: 'subscription', type: 'int', min: 0, max: 60 },
}
export const PLATFORM_SETTING_KEYS = Object.keys(SETTING_RULES)
const SECRET_KEYS = new Set(Object.entries(SETTING_RULES).filter(([, r]) => r.type === 'secret').map(([k]) => k))

function cleanSetting(key, raw) {
  const rule = SETTING_RULES[key]
  const label = key.replace(/_/g, ' ')
  const text = String(raw ?? '').trim()
  switch (rule.type) {
    case 'bool': return { value: ['true', '1', 'on', 'yes'].includes(text.toLowerCase()) ? 'true' : 'false' }
    case 'int': {
      const n = Number(text)
      if (!Number.isInteger(n) || n < rule.min || n > rule.max) return { error: `${label} must be a whole number from ${rule.min} to ${rule.max}.` }
      return { value: String(n) }
    }
    case 'enum':
      if (!rule.values.includes(text)) return { error: `${label} must be one of: ${rule.values.join(', ')}.` }
      return { value: text }
    case 'email':
      if (text && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return { error: `${label} must be a valid email address.` }
      return { value: text }
    case 'iplist': {
      const list = text.split(/[\s,]+/).map((ip) => ip.trim()).filter(Boolean)
      const bad = list.find((ip) => !/^[0-9a-fA-F:.*]+$/.test(ip))
      if (bad) return { error: `"${bad}" is not a valid IP address.` }
      return { value: list.join(', ') }
    }
    case 'url':
      if (text && !/^https?:\/\/[^\s/]+(\/[^\s]*)?$/i.test(text)) return { error: 'App address must start with http:// or https://, for example https://app.example.com.' }
      return { value: text.replace(/\/+$/, '') }
    case 'rwphone':
      if (!text) return { value: '' }
      try { return { value: normalizeRwandaPhone(text) } } catch { return { error: `${label} must be a Rwanda mobile number, for example 0788123456.` } }
    case 'secret': return { value: String(raw ?? '') }
    default: return { value: text.slice(0, rule.max || 500) }
  }
}

export async function getSettings(req, res) {
  try {
    const { rows } = await query('SELECT setting_key, setting_value, setting_group FROM platform_settings ORDER BY setting_group, setting_key')
    const grouped = {}
    const flat = {}
    rows.forEach((r) => {
      if (!SETTING_RULES[r.setting_key]) return
      // Secrets are never sent to the browser; the form shows whether one is saved.
      const value = SECRET_KEYS.has(r.setting_key) ? '' : r.setting_value
      if (SECRET_KEYS.has(r.setting_key)) flat[`${r.setting_key}_set`] = Boolean(r.setting_value)
      if (!grouped[r.setting_group]) grouped[r.setting_group] = {}
      grouped[r.setting_group][r.setting_key] = value
      flat[r.setting_key] = value
    })
    res.json({
      grouped,
      flat,
      yourIp: requestIp(req),
      providers: {
        mtn_momo: { apiConfigured: isMobileMoneyApiConfigured('mtn_momo') },
        airtel_money: { apiConfigured: isMobileMoneyApiConfigured('airtel_money') },
      },
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function updateSettings(req, res) {
  const { settings } = req.body // { key: value, ... }
  if (!settings || typeof settings !== 'object') return res.status(400).json({ error: 'settings object required.' })
  const clean = {}
  const errors = []
  const fullSettings = adminCan(req.user, 'settings')
  for (const [key, raw] of Object.entries(settings)) {
    if (!SETTING_RULES[key]) continue
    if (!fullSettings && SETTING_RULES[key].group !== 'backup') {
      errors.push(`You can only change backup settings (not ${key.replace(/_/g, ' ')}).`)
      continue
    }
    // An empty secret field means "keep the saved one".
    if (SECRET_KEYS.has(key) && String(raw ?? '') === '') continue
    const { value, error } = cleanSetting(key, raw)
    if (error) errors.push(error)
    else clean[key] = value
  }
  if (errors.length) return res.status(400).json({ error: errors.join(' ') })

  // Where subscription money goes: only a super admin may change it.
  const paymentKeys = Object.keys(clean).filter((k) => SETTING_RULES[k].group === 'payment')
  if (paymentKeys.length && req.user?.role !== 'super_admin') {
    return res.status(403).json({ error: 'Only a super admin can change where subscription payments are received.' })
  }
  let paymentBefore = {}
  if (paymentKeys.length) {
    const { rows } = await query(`SELECT setting_key, setting_value FROM platform_settings WHERE setting_group = 'payment' OR setting_key LIKE 'payment\_%'`)
    paymentBefore = Object.fromEntries(rows.map((r) => [r.setting_key, r.setting_value]))
    const after = { ...paymentBefore, ...clean }
    const on = (v, fallback) => (v === undefined || v === null || v === '' ? fallback : String(v) === 'true')
    for (const [prefix, method, label] of [['payment_momo', 'mtn_momo', 'MTN MoMo'], ['payment_airtel', 'airtel_money', 'Airtel Money']]) {
      // Only check the provider being changed; one that cannot receive money is simply not offered to owners.
      if (!Object.keys(clean).some((k) => k.startsWith(`${prefix}_`))) continue
      if (!on(after[`${prefix}_enabled`], true)) continue
      const apiConfigured = isMobileMoneyApiConfigured(method)
      const mode = after[`${prefix}_mode`] || (apiConfigured ? 'api' : 'manual')
      if (mode === 'api' && !apiConfigured) {
        errors.push(`Automatic ${label} needs the ${label} API keys on the server, and they are not set. Choose "Send to our number" instead, or turn ${label} off.`)
      }
      if (mode === 'manual' && !String(after[`${prefix}_number`] || '').trim() && !String(after[`${prefix}_code`] || '').trim()) {
        errors.push(`Enter the ${label} number (or merchant pay code) that receives subscription payments, or turn ${label} off.`)
      }
    }
    if (Object.keys(clean).some((k) => k.startsWith('payment_bank_')) && on(after.payment_bank_enabled, false) && !String(after.payment_bank_account || '').trim()) {
      errors.push('Enter the bank account that receives transfers, or turn bank transfer off.')
    }
    if (errors.length) return res.status(400).json({ error: errors.join(' ') })
  }

  // Never save an IP allow-list that would lock out the admin who is saving it.
  if (clean.security_ip_whitelist !== undefined) {
    const list = clean.security_ip_whitelist.split(/[\s,]+/).filter(Boolean)
    if (list.length && !ipAllowed(requestIp(req), list)) {
      return res.status(400).json({ error: `The IP allow-list must include your current address (${requestIp(req)}), or you would lock yourself out.` })
    }
  }

  try {
    for (const [key, value] of Object.entries(clean)) {
      await query(
        `INSERT INTO platform_settings (setting_key, setting_value, setting_group)
         VALUES ($1, $2, $3)
         ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = NOW()`,
        [key, value, SETTING_RULES[key].group]
      ).catch(async (error) => {
        // Older databases without a unique key on setting_key.
        if (!/no unique|ON CONFLICT/i.test(error.message)) throw error
        const { rows } = await query('UPDATE platform_settings SET setting_value = $2, updated_at = NOW() WHERE setting_key = $1 RETURNING id', [key, value])
        if (!rows.length) await query('INSERT INTO platform_settings (setting_key, setting_value, setting_group) VALUES ($1, $2, $3)', [key, value, SETTING_RULES[key].group])
      })
    }

    if (clean.security_require_2fa !== undefined) {
      // business_id is NULL here, so ON CONFLICT cannot match: update the one platform row, or create it.
      const enabled = clean.security_require_2fa === 'true'
      const { rows: tf } = await query(
        `UPDATE two_factor_settings SET is_enabled = $1, updated_at = NOW()
         WHERE scope = 'platform' AND business_id IS NULL RETURNING id`,
        [enabled]
      )
      if (!tf.length) {
        await query(
          `INSERT INTO two_factor_settings (scope, business_id, is_enabled, method, updated_at) VALUES ('platform', NULL, $1, 'email', NOW())`,
          [enabled]
        )
      } else if (tf.length > 1) {
        await query(`DELETE FROM two_factor_settings WHERE scope = 'platform' AND business_id IS NULL AND id <> $1`, [tf[0].id])
      }
    }

    invalidatePlatformSettings()
    // A change of where money is received is recorded in full, as a security event.
    const receiving = ['payment_momo_number', 'payment_momo_code', 'payment_momo_mode', 'payment_airtel_number', 'payment_airtel_code', 'payment_airtel_mode', 'payment_bank_account']
      .filter((k) => clean[k] !== undefined && String(clean[k]) !== String(paymentBefore[k] ?? ''))
    for (const k of receiving) {
      const show = (v) => (k.endsWith('_number') ? displayPhone(v) : v) || '(empty)'
      await logPlatformActivity({ req, actorName: req.user?.name, actorId: req.user?.id, action: `Changed subscription payment ${k.replace(/^payment_|_/g, ' ').trim()}: ${show(paymentBefore[k])} -> ${show(clean[k])}`, module: 'Settings', category: 'security' })
    }
    const changed = Object.keys(clean).map((k) => (SECRET_KEYS.has(k) ? `${k} (changed)` : k)).join(', ')
    await logPlatformActivity({ req, actorName: req.user?.name, action: `Updated platform settings: ${changed || 'nothing'}`, module: 'Settings' })
    res.json({ success: true, saved: Object.keys(clean) })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// POST /platform/settings/test-email  { to } — sends a test email with the saved settings.
export async function sendTestEmail(req, res) {
  const to = String(req.body?.to || '').trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return res.status(400).json({ error: 'Enter the email address to send the test to.' })
  try {
    const { sendMail } = await import('../services/mailer.js')
    const info = await sendMail({
      to,
      subject: 'BarFlow test email',
      text: 'This is a test email from the platform settings. If you received it, password resets and notifications can be delivered.',
    })
    await logPlatformActivity({ req, actorName: req.user?.name, action: `Sent a test email to ${to}`, module: 'Settings' })
    res.json({ success: true, usedAccount: info.account, message: info.account === 'environment' ? 'Sent using the server email account: the SMTP account in Settings was rejected or is not set.' : 'Sent using the SMTP account in Settings.' })
  } catch (error) {
    res.status(502).json({ error: `Could not send: ${String(error.message).split(/\r?\n/)[0]}` })
  }
}

// ============================================================
// BACKUP & RESTORE
// ============================================================

export async function listBackups(req, res) {
  try {
    await query('ALTER TABLE platform_backups ADD COLUMN IF NOT EXISTS file_path TEXT')
    const { rows } = await query('SELECT * FROM platform_backups ORDER BY created_at DESC')
    res.json(rows.map((b) => ({
      id: b.id,
      name: b.backup_name,
      type: b.backup_type,
      size: b.file_size,
      status: b.status,
      createdBy: b.created_by,
      createdAt: b.created_at,
      restorable: Boolean(b.file_path) && fs.existsSync(b.file_path),
    })))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function createBackup(req, res) {
  try {
    await query('ALTER TABLE platform_backups ADD COLUMN IF NOT EXISTS file_path TEXT')
    // A full database dump (pg_dump). The file is kept on this server.
    const backup = await recordBackup({ type: 'full', createdBy: req.user?.name || 'Platform Admin' })
    await logPlatformActivity({ req, actorName: req.user?.name, action: `Created backup ${backup.backup_name}`, module: 'Backup' })
    res.status(201).json({ success: true, backup })
  } catch (error) {
    const hint = /ENOENT|not recognized|not found/i.test(error.message)
      ? ' pg_dump was not found on the server: install the PostgreSQL client tools or set PGDUMP_PATH.'
      : ''
    res.status(500).json({ error: `${error.message}${hint}` })
  }
}

export async function deleteBackup(req, res) {
  const { id } = req.params
  try {
    await query('ALTER TABLE platform_backups ADD COLUMN IF NOT EXISTS file_path TEXT')
    const { rows } = await query('DELETE FROM platform_backups WHERE id = $1 RETURNING backup_name, file_path', [id])
    if (!rows.length) return res.status(404).json({ error: 'Backup not found.' })
    if (rows[0].file_path) fs.promises.unlink(rows[0].file_path).catch(() => {})
    await logPlatformActivity({ req, actorName: req.user?.name, action: `Deleted backup: ${rows[0].backup_name}`, module: 'Backup' })
    res.json({ success: true })
  } catch (error) {
    if (/invalid input syntax for type uuid/i.test(error.message)) return res.status(404).json({ error: 'Backup not found.' })
    res.status(500).json({ error: error.message })
  }
}

// POST /platform/backups/:id/restore  { confirm: 'RESTORE' }
// Replaces the whole database with the backup. Everything changed since the backup is lost.
export async function restoreBackup(req, res) {
  const { id } = req.params
  if (String(req.body?.confirm || '') !== 'RESTORE') {
    return res.status(400).json({ error: 'Type RESTORE to confirm. Restoring replaces all current data with the backup.' })
  }
  try {
    await query('ALTER TABLE platform_backups ADD COLUMN IF NOT EXISTS file_path TEXT')
    const { rows } = await query('SELECT * FROM platform_backups WHERE id = $1', [id])
    if (!rows.length) return res.status(404).json({ error: 'Backup not found.' })
    const backup = rows[0]
    if (!backup.file_path || !fs.existsSync(backup.file_path)) {
      return res.status(409).json({ error: 'The file for this backup is not on this server, so it cannot be restored. Only backups made on this server can be restored.' })
    }
    await restoreBackupFile(backup.file_path)
    invalidatePlatformSettings()
    forgetSubscriptionAccess()
    await logPlatformActivity({ req, actorName: req.user?.name, action: `Restored backup: ${backup.backup_name}`, module: 'Backup' })
    res.json({ success: true, message: `The database was restored from "${backup.backup_name}".` })
  } catch (error) {
    if (/invalid input syntax for type uuid/i.test(error.message)) return res.status(404).json({ error: 'Backup not found.' })
    res.status(500).json({ error: error.message })
  }
}

// ============================================================
// DASHBOARD STATS
// ============================================================
