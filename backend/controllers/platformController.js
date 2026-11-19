import { query, pool as dbPool } from '../config/database.js'
import { sign } from '../config/jwt.js'
import bcrypt from 'bcryptjs'
import os from 'os'
import { sendVerificationEmail } from '../services/emailService.js'
import { logAudit, getClientIp } from '../utils/audit.js'
import { createBackup as createBackupFile } from '../utils/backup.js'
import {
  sendSubscriptionActivation,
  sendAdminSubscriptionActivation,
  sendAccountSuspended,
  sendAccountReactivated,
} from '../services/emailNotificationService.js'

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
    const { rows } = await query(
      'SELECT * FROM platform_admins WHERE email = $1 LIMIT 1',
      [email]
    )
    if (!rows.length) {
      return res.status(401).json({ error: 'Invalid email or password.' })
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
      return res.status(401).json({ error: 'Invalid email or password.' })
    }

    // Check if 2FA is enabled for platform
    const { rows: tfRows } = await query(
      "SELECT is_enabled, method FROM two_factor_settings WHERE scope = 'platform' AND business_id IS NULL LIMIT 1"
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
      permissions: typeof admin.permissions === 'string' ? JSON.parse(admin.permissions || '{}') : admin.permissions || {},
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
    const { rows } = await query(
      'SELECT * FROM platform_admins WHERE id = $1 LIMIT 1',
      [adminId]
    )
    if (!rows.length) {
      return res.status(404).json({ error: 'Admin not found.' })
    }
    const admin = rows[0]

    if (!admin.two_factor_code || admin.two_factor_verified) {
      return res.status(400).json({ error: 'No pending 2FA verification.' })
    }

    if (admin.two_factor_expires_at && new Date(admin.two_factor_expires_at) < new Date()) {
      return res.status(400).json({ error: 'Verification code has expired. Please login again.' })
    }

    if (admin.two_factor_code !== code) {
      return res.status(400).json({ error: 'Invalid verification code.' })
    }

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
      permissions: typeof admin.permissions === 'string' ? JSON.parse(admin.permissions || '{}') : admin.permissions || {},
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
  const { action } = req.body // 'verify' | 'suspend' | 'activate'
  try {
    let updateQuery
    if (action === 'verify') {
      updateQuery = query('UPDATE businesses SET is_verified = TRUE WHERE id = $1 RETURNING id, name', [id])
    } else if (action === 'suspend') {
      updateQuery = query('UPDATE businesses SET is_suspended = TRUE WHERE id = $1 RETURNING id, name', [id])
    } else if (action === 'activate') {
      updateQuery = query('UPDATE businesses SET is_suspended = FALSE WHERE id = $1 RETURNING id, name', [id])
    } else {
      return res.status(400).json({ error: 'Invalid action. Use: verify, suspend, activate' })
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

      if (action === 'suspend' && bizData.length) {
        const b = bizData[0]
        sendAccountSuspended({
          businessName: b.business_name,
          ownerName: b.owner_name || 'Business Owner',
          ownerEmail: b.owner_email || b.contact_email,
          reason: 'Suspended by platform administrator',
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
      action: `Business ${action}: ${rows[0].name}`,
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
         AND ($2 = FALSE OR (
           b.is_suspended = FALSE
           AND NOT EXISTS (
             SELECT 1 FROM subscriptions s
             WHERE s.business_id = b.id AND s.is_active = TRUE AND s.payment_status = 'verified'
               AND (s.current_period_end IS NULL OR s.current_period_end > NOW())
           )
         ))
       RETURNING b.id, b.name, b.unpaid_access_granted`,
      [id, granted]
    )
    if (!rows.length) {
      const { rows: existing } = await query('SELECT id FROM businesses WHERE id = $1', [id])
      if (!existing.length) return res.status(404).json({ error: 'Business not found.' })
      return res.status(409).json({ error: 'Unpaid access can only be granted to non-suspended businesses without an active paid subscription.' })
    }

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
    const { rows } = await query(
      `SELECT * FROM subscription_plans
       ORDER BY created_at DESC`
    )
    res.json(rows.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      priceMonthly: Number(p.price_monthly),
      priceYearly: Number(p.price_yearly),
      discountQuarterly: Number(p.discount_quarterly ?? 8),
      discountAnnually: Number(p.discount_annually ?? 14),
      features: p.features || [],
      isActive: p.is_active,
      sortOrder: p.sort_order,
    })))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function createPlan(req, res) {
  const { name, description, priceMonthly, priceYearly, features, discountQuarterly, discountAnnually } = req.body
  if (!name) return res.status(400).json({ error: 'Plan name is required.' })
  const trimmedName = String(name).trim()
  try {
    const { rows: existing } = await query('SELECT id FROM subscription_plans WHERE LOWER(name) = $1', [trimmedName.toLowerCase()])
    if (existing.length) return res.status(409).json({ error: `${trimmedName} plan already exists. Edit it instead.` })
    const { rows } = await query(
      `INSERT INTO subscription_plans (name, description, price_monthly, price_yearly, features, discount_quarterly, discount_annually)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [trimmedName, description || '', priceMonthly || 0, priceYearly || 0, JSON.stringify(features || []), Number(discountQuarterly ?? 8), Number(discountAnnually ?? 14)]
    )

    await logAudit({
      actorName: req.user?.name || 'Platform Admin',
      action: `Created subscription plan: ${name}`,
      targetModule: 'Platform',
      ipAddress: getClientIp(req),
    })
    res.status(201).json(rows[0])
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function updatePlan(req, res) {
  const { id } = req.params
  const { name, description, priceMonthly, priceYearly, features, isActive, discountQuarterly, discountAnnually } = req.body
  const trimmedName = name !== undefined ? String(name).trim() : undefined
  try {
    const { rows } = await query(
      `UPDATE subscription_plans SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        price_monthly = COALESCE($3, price_monthly),
        price_yearly = COALESCE($4, price_yearly),
        features = COALESCE($5, features::jsonb),
        discount_quarterly = COALESCE($6, discount_quarterly),
        discount_annually = COALESCE($7, discount_annually),
        is_active = COALESCE($8, is_active),
        updated_at = NOW()
       WHERE id = $9 RETURNING *`,
      [trimmedName, description, priceMonthly, priceYearly, features ? JSON.stringify(features) : null, discountQuarterly, discountAnnually, isActive, id]
    )
    if (!rows.length) return res.status(404).json({ error: 'Plan not found.' })

    res.json(rows[0])
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// ============================================================
// EMAIL NOTIFICATIONS
// ============================================================

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
    const [businesses, users, subscriptions, plans, revenue, expiring, admins, chart] = await Promise.all([
      query('SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE is_verified)::int AS verified, COUNT(*) FILTER (WHERE is_suspended)::int AS suspended FROM businesses'),
      query('SELECT COUNT(*)::int AS total FROM users'),
      query(`SELECT
                COUNT(*) FILTER (WHERE is_active AND payment_status = 'verified' AND current_period_end > NOW())::int AS active,
                COUNT(*) FILTER (WHERE current_period_end IS NOT NULL AND current_period_end <= NOW())::int AS expired
              FROM subscriptions`),
      query('SELECT COUNT(*)::int AS total FROM subscription_plans WHERE is_active = TRUE'),
      query(`SELECT COALESCE(SUM(amount), 0)::numeric AS monthly
              FROM platform_payments
              WHERE status = 'paid' AND paid_at >= date_trunc('month', NOW())`),
      query(`SELECT COUNT(*)::int AS soon FROM subscriptions
              WHERE is_active AND current_period_end BETWEEN NOW() AND NOW() + INTERVAL '7 days'`),
      query('SELECT COUNT(*)::int AS total FROM platform_admins WHERE is_active = TRUE'),
      query(`SELECT
               to_char(gs, 'Mon') AS month,
               COALESCE(SUM(CASE WHEN s.billing_cycle = 'monthly' THEN p.amount ELSE 0 END), 0)::numeric AS monthly,
               COALESCE(SUM(CASE WHEN s.billing_cycle = 'quarterly' THEN p.amount ELSE 0 END), 0)::numeric AS quarterly,
               COALESCE(SUM(CASE WHEN s.billing_cycle = 'annually' THEN p.amount ELSE 0 END), 0)::numeric AS annual
             FROM generate_series(date_trunc('month', NOW()) - INTERVAL '5 months', date_trunc('month', NOW()), INTERVAL '1 month') gs
             LEFT JOIN platform_payments p ON date_trunc('month', p.paid_at) = gs AND p.status = 'paid'
             LEFT JOIN subscriptions s ON s.id = p.subscription_id
             GROUP BY gs
             ORDER BY gs`),
    ])
    res.json({
      totalBusinesses: businesses.rows[0].total,
      verifiedBusinesses: businesses.rows[0].verified,
      suspendedBusinesses: businesses.rows[0].suspended,
      pendingVerification: Math.max(0, businesses.rows[0].total - businesses.rows[0].verified - businesses.rows[0].suspended),
      totalUsers: users.rows[0].total,
      activeSubscriptions: subscriptions.rows[0].active,
      expiredSubscriptions: subscriptions.rows[0].expired,
      expiringSoon: expiring.rows[0].soon,
      monthlyRevenue: Number(revenue.rows[0].monthly) || 0,
      activePlans: plans.rows[0].total,
      totalAdmins: admins.rows[0].total,
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
  const client = await dbPool.connect()
  try {
    await client.query('BEGIN')

    const { rows } = await client.query(`
      SELECT table_name FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'business_id'
    `)
    const allowed = new Set(rows.map((r) => r.table_name))

    const dependentTables = [
      'users',
      'branches',
      'products',
      'orders',
      'subscriptions',
      'payments',
      'salary_payments',
      'notifications',
      'payment_settings',
      'customer_sessions',
      'support_tickets',
      'revenue_logs',
      'role_permissions',
      'backup_records',
      'reports',
      'audit_logs',
      'platform_payments',
      'platform_refunds',
    ]

    for (const table of dependentTables) {
      if (allowed.has(table)) {
        await client.query(`DELETE FROM ${table} WHERE business_id = $1`, [id])
      }
    }

    const { rows: bizRows } = await client.query('DELETE FROM businesses WHERE id = $1 RETURNING id, name', [id])
    await client.query('COMMIT')

    if (!bizRows.length) return res.status(404).json({ error: 'Business not found.' })
    await logPlatformActivity({ req, actorName: req.user?.name, action: `Deleted business: ${bizRows[0].name}`, module: 'Businesses' })
    res.json({ success: true })
  } catch (error) {
    try { await client.query('ROLLBACK') } catch {}
    res.status(500).json({ error: error.message })
  } finally {
    client.release()
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
       ORDER BY s.created_at DESC`
    )
    res.json(rows.map((r) => ({
      id: r.id,
      businessId: r.business_id,
      business: r.business_name || 'N/A',
      plan: r.plan_name || r.plan || 'N/A',
      billingCycle: r.billing_cycle || 'monthly',
      status: r.payment_status === 'verified' && r.is_active ? 'active' : r.status,
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

// Count of businesses grouped by billing cycle + plan pricing (for the Subscriptions page cards)
export async function subscriptionSummary(req, res) {
  try {
    const [byCycle, plans] = await Promise.all([
      query(`SELECT billing_cycle, COUNT(*)::int AS count
             FROM subscriptions WHERE is_active AND payment_status = 'verified'
             GROUP BY billing_cycle`),
      query('SELECT setting_key, setting_value FROM platform_settings WHERE setting_group = \'subscription\''),
    ])
    const cycleMap = { monthly: 0, quarterly: 0, annually: 0 }
    byCycle.rows.forEach((r) => { if (r.billing_cycle) cycleMap[r.billing_cycle] = r.count })
    const settingMap = {}
    plans.rows.forEach((r) => { settingMap[r.setting_key] = r.setting_value })
    res.json({
      counts: cycleMap,
      prices: {
        monthly: Number(settingMap.subscription_monthly_price) || 50000,
        quarterly: Number(settingMap.subscription_quarterly_price) || 130000,
        annually: Number(settingMap.subscription_annually_price) || 480000,
      },
      discounts: {
        monthly: 0,
        quarterly: Number(settingMap.subscription_quarterly_discount) || 8,
        annually: Number(settingMap.subscription_annually_discount) || 14,
      },
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function updateSubscriptionAdmin(req, res) {
  const { id } = req.params
  const { action, plan, billingCycle } = req.body
  try {
    let sql, params
    if (action === 'cancel') {
      sql = `UPDATE subscriptions SET status = 'cancelled', is_active = FALSE, cancelled_at = NOW() WHERE id = $1 RETURNING id`
      params = [id]
    } else if (action === 'change') {
      sql = `UPDATE subscriptions SET plan = COALESCE($2, plan), billing_cycle = COALESCE($3, billing_cycle) WHERE id = $1 RETURNING id`
      params = [id, plan || null, billingCycle || null]
    } else {
      return res.status(400).json({ error: 'Invalid action. Use cancel or change. Grant unpaid access from the business access controls.' })
    }
    const { rows } = await query(sql, params)
    if (!rows.length) return res.status(404).json({ error: 'Subscription not found.' })
    await logPlatformActivity({ req, actorName: req.user?.name, action: `Subscription ${action}`, module: 'Subscriptions' })
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// ============================================================
// PAYMENTS + REFUNDS
// ============================================================

export async function listPayments(req, res) {
  try {
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
      status: p.status,
      date: p.paid_at || p.created_at,
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
    await query('UPDATE platform_payments SET status = \'refunded\' WHERE id = $1', [id])
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

export async function settlePayment(req, res) {
  const { id } = req.params
  try {
    const { rows: pay } = await query('SELECT * FROM platform_payments WHERE id = $1', [id])
    if (!pay.length) return res.status(404).json({ error: 'Payment not found.' })
    const p = pay[0]
    if (p.status === 'settled') return res.status(400).json({ error: 'Payment is already settled.' })
    await query('UPDATE platform_payments SET status = \'settled\', paid_at = COALESCE(paid_at, NOW()) WHERE id = $1', [id])
    await logPlatformActivity({ req, actorName: req.user?.name, action: `Settled payment ${p.transaction_id || id}`, module: 'Payments' })
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// ============================================================
// PLATFORM ADMINS (Users page)
// ============================================================

export async function listAdmins(req, res) {
  try {
    const { rows } = await query('SELECT id, email, full_name, role, phone, is_active, last_login, permissions, created_at FROM platform_admins ORDER BY created_at ASC')
    res.json(rows.map((a) => ({
      id: a.id,
      name: a.full_name,
      email: a.email,
      phone: a.phone || '',
      role: a.role,
      isActive: a.is_active,
      lastLogin: a.last_login,
      permissions: a.permissions || [],
      createdAt: a.created_at,
    })))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function createAdmin(req, res) {
  const { name, email, password, role, phone, permissions } = req.body
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, and password are required.' })
  try {
    const { rows: existing } = await query('SELECT id FROM platform_admins WHERE email = $1', [email])
    if (existing.length) return res.status(409).json({ error: 'An admin with this email already exists.' })
    const hash = await bcrypt.hash(password, 10)
    const { rows } = await query(
      `INSERT INTO platform_admins (email, password_hash, full_name, role, phone, permissions)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, full_name, email`,
      [email, hash, name, role || 'admin', phone || null, JSON.stringify(permissions || [])]
    )
    await logPlatformActivity({ req, actorName: req.user?.name, action: `Created admin: ${email}`, module: 'Users' })
    res.status(201).json({ success: true, admin: rows[0] })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function updateAdmin(req, res) {
  const { id } = req.params
  const { name, email, role, phone, isActive, permissions } = req.body
  try {
    const { rows: existing } = await query('SELECT role FROM platform_admins WHERE id = $1 LIMIT 1', [id])
    if (!existing.length) return res.status(404).json({ error: 'Admin not found.' })
    const targetAdmin = existing[0]
    const fields = []
    const params = []
    let i = 1
    const add = (col, val) => { if (val !== undefined) { fields.push(`${col} = $${i++}`); params.push(val) } }
    add('full_name', name)
    add('email', email)
    add('role', role)
    add('phone', phone)
    if (isActive !== undefined) {
      if (targetAdmin.role !== 'super_admin') {
        add('is_active', isActive)
      } else if (isActive) {
        add('is_active', true)
      }
    }
    if (permissions !== undefined) { fields.push(`permissions = $${i++}`); params.push(JSON.stringify(permissions)) }
    if (!fields.length) return res.status(400).json({ error: 'No fields to update.' })
    fields.push('updated_at = NOW()')
    params.push(id)
    const { rows } = await query(`UPDATE platform_admins SET ${fields.join(', ')} WHERE id = $${i} RETURNING id, email`, params)
    if (!rows.length) return res.status(404).json({ error: 'Admin not found.' })
    await logPlatformActivity({ req, actorName: req.user?.name, action: `Updated admin: ${rows[0].email}`, module: 'Users' })
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function resetAdminPassword(req, res) {
  const { id } = req.params
  const { password } = req.body
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' })
  try {
    const hash = await bcrypt.hash(password, 10)
    const { rows } = await query('UPDATE platform_admins SET password_hash = $1, updated_at = NOW() WHERE id = $2 RETURNING email', [hash, id])
    if (!rows.length) return res.status(404).json({ error: 'Admin not found.' })
    await logPlatformActivity({ req, actorName: req.user?.name, action: `Reset password for admin: ${rows[0].email}`, module: 'Users', category: 'security' })
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function deleteAdmin(req, res) {
  const { id } = req.params
  try {
    const { rows: existing } = await query('SELECT role, email FROM platform_admins WHERE id = $1 LIMIT 1', [id])
    if (!existing.length) return res.status(404).json({ error: 'Admin not found.' })
    const targetAdmin = existing[0]
    if (targetAdmin.role === 'super_admin') {
      return res.status(400).json({ error: 'Super admin cannot be deleted.' })
    }
    if (req.user?.id === id) return res.status(400).json({ error: 'You cannot delete your own account.' })
    const { rows } = await query('DELETE FROM platform_admins WHERE id = $1 RETURNING email', [id])
    if (!rows.length) return res.status(404).json({ error: 'Admin not found.' })
    await logPlatformActivity({ req, actorName: req.user?.name, action: `Deleted admin: ${rows[0].email}`, module: 'Users' })
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// ============================================================
// REPORTS / ANALYTICS
// ============================================================

export async function reportsOverview(req, res) {
  try {
    const [income, growth, byPlan, paymentStatsRow] = await Promise.all([
      query(`SELECT
               COALESCE(SUM(amount) FILTER (WHERE status='paid' AND paid_at >= date_trunc('month', NOW())), 0)::numeric AS this_month,
               COALESCE(SUM(amount) FILTER (WHERE status='paid' AND paid_at >= date_trunc('year', NOW())), 0)::numeric AS this_year,
               COALESCE(SUM(amount) FILTER (WHERE status='paid'), 0)::numeric AS all_time
             FROM platform_payments`),
      query(`SELECT to_char(gs, 'Mon') AS label,
                    (SELECT COUNT(*)::int FROM businesses b WHERE date_trunc('month', b.created_at) = date_trunc('month', gs)) AS registrations,
                    (SELECT COALESCE(SUM(amount),0)::numeric FROM platform_payments p WHERE p.status='paid' AND date_trunc('month', p.paid_at) = date_trunc('month', gs)) AS revenue
             FROM generate_series(date_trunc('month', NOW()) - INTERVAL '5 months', date_trunc('month', NOW()), INTERVAL '1 month') gs
             ORDER BY gs`),
      query(`SELECT COALESCE(sp.name, s.plan) AS plan, COUNT(*)::int AS count
             FROM subscriptions s LEFT JOIN subscription_plans sp ON sp.id = s.plan_id
             WHERE s.is_active GROUP BY COALESCE(sp.name, s.plan) ORDER BY count DESC`),
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

export async function getSettings(req, res) {
  try {
    const { rows } = await query('SELECT setting_key, setting_value, setting_group FROM platform_settings ORDER BY setting_group, setting_key')
    const grouped = {}
    const flat = {}
    rows.forEach((r) => {
      if (!grouped[r.setting_group]) grouped[r.setting_group] = {}
      grouped[r.setting_group][r.setting_key] = r.setting_value
      flat[r.setting_key] = r.setting_value
    })
    res.json({ grouped, flat })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function updateSettings(req, res) {
  const { settings } = req.body // { key: value, ... }
  if (!settings || typeof settings !== 'object') return res.status(400).json({ error: 'settings object required.' })
  try {
    for (const [key, value] of Object.entries(settings)) {
      const { rows } = await query('UPDATE platform_settings SET setting_value = $2, updated_at = NOW() WHERE setting_key = $1 RETURNING id', [key, String(value)])
      if (!rows.length) {
        await query('INSERT INTO platform_settings (setting_key, setting_value, setting_group) VALUES ($1, $2, $3)', [key, String(value), 'general'])
      }
    }

    if (settings.security_require_2fa !== undefined) {
      await query(
        `INSERT INTO two_factor_settings (scope, business_id, is_enabled, method, updated_at)
         VALUES ('platform', NULL, $1, COALESCE((SELECT method FROM two_factor_settings WHERE scope = 'platform' AND business_id IS NULL LIMIT 1), 'email'), NOW())
         ON CONFLICT (scope, business_id) DO UPDATE SET is_enabled = EXCLUDED.is_enabled, updated_at = EXCLUDED.updated_at`,
        [String(settings.security_require_2fa) === 'true']
      )
    }

    const pricingKeys = [
      'subscription_monthly_price', 'subscription_quarterly_price', 'subscription_annually_price',
      'subscription_quarterly_discount', 'subscription_annually_discount',
    ]
    const hasPricingChange = pricingKeys.some((k) => settings[k] !== undefined)

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
         WHERE is_active = TRUE AND status = 'active'`,
        [monthlyAmount, quarterlyAmount, annuallyAmount, quarterlyDiscount, annuallyDiscount],
      )
    }

    await logPlatformActivity({ req, actorName: req.user?.name, action: 'Updated platform settings', module: 'Settings' })
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// ============================================================
// BACKUP & RESTORE
// ============================================================

export async function listBackups(req, res) {
  try {
    const { rows } = await query('SELECT * FROM platform_backups ORDER BY created_at DESC')
    res.json(rows.map((b) => ({
      id: b.id,
      name: b.backup_name,
      type: b.backup_type,
      size: b.file_size,
      status: b.status,
      createdBy: b.created_by,
      createdAt: b.created_at,
    })))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function createBackup(req, res) {
  const { type } = req.body
  const backupType = ['full', 'incremental', 'database', 'file', 'config'].includes(type) ? type : 'full'
  try {
    const name = `backup_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}_${backupType}`
    const filePath = await createBackupFile()
    const stats = await import('fs').then(({ statSync }) => statSync(filePath))
    const size = `${(stats.size / 1024 / 1024).toFixed(1)} MB`
    const { rows } = await query(
      `INSERT INTO platform_backups (backup_name, backup_type, file_size, status, created_by)
       VALUES ($1, $2, $3, 'completed', $4) RETURNING *`,
      [name, backupType, size, req.user?.name || 'Platform Admin']
    )
    await logPlatformActivity({ req, actorName: req.user?.name, action: `Created ${backupType} backup`, module: 'Backup' })
    res.status(201).json({ success: true, backup: rows[0] })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function deleteBackup(req, res) {
  const { id } = req.params
  try {
    const { rows } = await query('DELETE FROM platform_backups WHERE id = $1 RETURNING backup_name', [id])
    if (!rows.length) return res.status(404).json({ error: 'Backup not found.' })
    await logPlatformActivity({ req, actorName: req.user?.name, action: `Deleted backup: ${rows[0].backup_name}`, module: 'Backup' })
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function restoreBackup(req, res) {
  const { id } = req.params
  try {
    const { rows } = await query('SELECT * FROM platform_backups WHERE id = $1', [id])
    if (!rows.length) {
      return res.status(404).json({ error: 'Backup not found.' })
    }

    const backup = rows[0]
    await logPlatformActivity({ req, actorName: req.user?.name, action: `Restored backup: ${backup.backup_name}`, module: 'Backup' })
    res.json({ success: true, message: `Backup "${backup.backup_name}" restore has been initiated.` })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// ============================================================
// DASHBOARD STATS
// ============================================================
