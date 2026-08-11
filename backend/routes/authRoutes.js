import { Router } from 'express'
import { query } from '../config/database.js'
import { sign } from '../config/jwt.js'
import authMiddleware from '../middleware/authMiddleware.js'
import bcrypt from 'bcryptjs'
import { logAudit, getClientIp } from '../utils/audit.js'
import { getPermissions } from '../middleware/permissionMiddleware.js'
import {
  forgotPassword as forgotPasswordCtrl,
  resetPassword as resetPasswordCtrl,
} from '../controllers/authController.js'
import twoFactorRoutes from './twoFactorRoutes.js'
import {
  sendRegistrationConfirmation,
  sendAdminNewBusinessNotification,
} from '../services/emailNotificationService.js'

const router = Router()

router.get('/permissions', authMiddleware, async (req, res) => {
  try {
    const perms = await getPermissions(req)
    res.json(perms)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.post('/login', async (req, res) => {
  const { username, password } = req.body
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' })
  }

  try {
    // Support login by username OR email
    const { rows } = await query(
      `SELECT u.*, b.name AS branch_name, bu.name AS business_name, bu.id AS business_id
       FROM users u
       LEFT JOIN branches b ON b.id = u.branch_id
       LEFT JOIN businesses bu ON bu.id = u.business_id
       WHERE (u.username = $1 OR u.email = $1) AND u.is_active = TRUE LIMIT 1`,
      [username]
    )

    if (!rows.length) {
      return res.status(401).json({ error: 'Invalid username or password.' })
    }

    const u = rows[0]
    const valid = await bcrypt.compare(password, u.password_hash)
    if (!valid) {
      return res.status(401).json({ error: 'Invalid username or password.' })
    }

    // Check if business is suspended
    if (u.business_id) {
      const { rows: biz } = await query('SELECT is_suspended, is_verified FROM businesses WHERE id = $1', [u.business_id])
      if (biz.length && biz[0].is_suspended) {
        return res.status(403).json({ error: 'Your business account has been suspended. Contact support.', code: 'BUSINESS_SUSPENDED' })
      }
    }

    // Check business verification and subscription status
    let subscriptionStatus = 'active'
    let subscriptionExpired = false
    if (u.business_id) {
      const { rows: biz } = await query('SELECT is_verified FROM businesses WHERE id = $1', [u.business_id])
      if (biz.length && !biz[0].is_verified) {
        subscriptionExpired = true
      } else {
        // A pending renewal must not block an already verified subscription.
        const { rows: subs } = await query(
          `SELECT is_active, current_period_end, status, payment_status
           FROM subscriptions
           WHERE business_id = $1
           ORDER BY (is_active = TRUE AND payment_status = 'verified') DESC, created_at DESC
           LIMIT 1`,
          [u.business_id]
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

    const businessId = u.business_id
    let twoFactorEnabled = false
    let twoFactorMethod = 'email'
    let businessHasTwoFactorRecord = false
    if (businessId) {
      const { rows: tfRows } = await query(
        'SELECT is_enabled, method FROM two_factor_settings WHERE business_id = $1 LIMIT 1',
        [businessId]
      )
      if (tfRows.length) {
        businessHasTwoFactorRecord = true
        if (tfRows[0].is_enabled) {
          twoFactorEnabled = true
          twoFactorMethod = tfRows[0].method
        }
      }
    }
    if (!businessHasTwoFactorRecord) {
      const { rows: tfRows } = await query(
        "SELECT is_enabled, method FROM two_factor_settings WHERE scope = 'platform' AND business_id IS NULL LIMIT 1"
      )
      if (tfRows.length && tfRows[0].is_enabled) {
        twoFactorEnabled = true
        twoFactorMethod = tfRows[0].method
      }
    }

    if (twoFactorEnabled) {
      const tempToken = sign({
        id: u.id,
        name: u.full_name,
        email: u.email,
        phone: u.phone || '',
        role: u.role,
        branch: u.branch_name || '',
        avatar: u.avatar_url || '',
        businessId: u.business_id,
        businessName: u.business_name,
        subscriptionStatus,
        subscriptionExpired,
        twoFactorPending: true,
      })

      return res.json({ requires2FA: true, tempToken, method: twoFactorMethod, user: { id: u.id, email: u.email, name: u.full_name, phone: u.phone || '', role: u.role, businessId: u.business_id, subscriptionStatus, subscriptionExpired } })
    }

    await query('UPDATE users SET last_login = NOW() WHERE id = $1', [u.id])

    const payload = {
      id: u.id,
      name: u.full_name,
      email: u.email,
      phone: u.phone || '',
      role: u.role,
      branch: u.branch_name || '',
      avatar: u.avatar_url || '',
      businessId: u.business_id,
      businessName: u.business_name,
      subscriptionStatus,
      subscriptionExpired,
    }
    const token = sign(payload)

    await logAudit({
      userId: u.id,
      actorName: u.full_name || u.email,
      action: 'User login',
      targetModule: 'Authentication',
      ipAddress: getClientIp(req),
    })

    res.json({ token, user: payload })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.post('/forgot-password', forgotPasswordCtrl)
router.post('/reset-password', resetPasswordCtrl)

router.post('/logout', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id
    const actorName = req.user?.full_name || req.user?.email || 'User'
    const role = req.user?.role || 'Unknown'

    await logAudit({
      userId,
      actorName,
      action: `User logout (${role})`,
      targetModule: 'Authentication',
      ipAddress: getClientIp(req),
    })

    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.put('/profile/avatar', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id
    const { avatarUrl } = req.body
    if (!userId) return res.status(401).json({ error: 'Unauthorized.' })
    if (!avatarUrl || typeof avatarUrl !== 'string') {
      return res.status(400).json({ error: 'avatarUrl is required.' })
    }

    const { rows } = await query(
      `UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2 RETURNING id, full_name, email, phone, role, avatar_url`,
      [avatarUrl, userId]
    )

    if (!rows.length) {
      return res.status(404).json({ error: 'User not found.' })
    }

    await logAudit({
      userId: req.user?.id,
      actorName: req.user?.full_name || req.user?.email || 'User',
      action: 'Updated profile avatar',
      targetModule: 'Profile',
      ipAddress: getClientIp(req),
    })

    const u = rows[0]
    res.json({
      id: u.id,
      name: u.full_name,
      email: u.email,
      phone: u.phone || '',
      role: u.role,
      avatar: u.avatar_url || '',
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Business registration (self-service signup)
router.post('/register-business', async (req, res) => {
  const { businessName, contactEmail, contactPhone, address, city, country, businessType, currencyCode, timeZone, registrationCode, ownerName, ownerEmail, ownerPhone, username, password, planId, billingCycle, description } = req.body
  if (!businessName || !ownerEmail || !password) {
    return res.status(400).json({ error: 'Business name, owner email, and password are required.' })
  }
  if (!planId) {
    return res.status(400).json({ error: 'Subscription plan is required.' })
  }
  try {
    // Check if email already exists
    const { rows: existing } = await query('SELECT id FROM users WHERE email = $1', [ownerEmail])
    if (existing.length) {
      return res.status(409).json({ error: 'An account with this email already exists.' })
    }

    // Create business
    const regCode = (registrationCode && registrationCode.trim()) || ('BR-' + Date.now().toString(36).toUpperCase())
    const { rows: biz } = await query(
      `INSERT INTO businesses (name, contact_email, contact_phone, address, city, country, business_type, registration_code, currency_code, is_verified, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [
        businessName,
        contactEmail || ownerEmail,
        contactPhone || ownerPhone,
        address || '',
        city || '',
        country || 'Rwanda',
        businessType || 'bar',
        regCode,
        currencyCode || 'RWF',
        false, // not verified until super admin approves
        description || '',
      ]
    )

    // Hash password and create owner user
    const passwordHash = await bcrypt.hash(password, 10)
    const { rows: user } = await query(
      `INSERT INTO users (business_id, full_name, email, username, password_hash, role, is_active)
       VALUES ($1, $2, $3, $4, $5, 'owner', TRUE) RETURNING *`,
      [biz[0].id, ownerName || 'Business Owner', ownerEmail, username || ownerEmail, passwordHash]
    )

    // Create default branch
    const { rows: branch } = await query(
      `INSERT INTO branches (business_id, name, address) VALUES ($1, 'Main Branch', $2) RETURNING *`,
      [biz[0].id, city || 'Main Location']
    )

    // Assign branch to owner
    await query('UPDATE users SET branch_id = $1 WHERE id = $2', [branch[0].id, user[0].id])

    // Create subscription from selected plan
    const { rows: planRows } = await query('SELECT * FROM subscription_plans WHERE id = $1 AND is_active = TRUE', [planId])
    const selectedPlan = planRows[0]
    if (!selectedPlan) {
      return res.status(400).json({ error: 'Selected subscription plan is not available.' })
    }

    const cycle = String(billingCycle || 'monthly').toLowerCase()
    let amount = Number(selectedPlan.price_monthly) || 0
    let monthsToAdd = 1
    let discountPercent = 0
    if (cycle === 'quarterly') {
      monthsToAdd = 3
      discountPercent = Number(selectedPlan.discount_quarterly ?? 8)
      const fullQuarter = amount * 3
      amount = Math.round(fullQuarter * (1 - discountPercent / 100))
    } else if (cycle === 'annually' || cycle === 'yearly') {
      monthsToAdd = 12
      discountPercent = Number(selectedPlan.discount_annually ?? 14)
      const fullYear = amount * 12
      amount = Math.round(fullYear * (1 - discountPercent / 100))
      if (Number(selectedPlan.price_yearly) > 0) {
        amount = Number(selectedPlan.price_yearly)
      }
    }

    const now = new Date()
    const periodEnd = new Date(now)
    periodEnd.setMonth(periodEnd.getMonth() + monthsToAdd)

    await query(
      `INSERT INTO subscriptions (business_id, plan_id, plan, status, is_active, start_date, current_period_end, billing_cycle, amount_paid, payment_status, discount_percent)
       VALUES ($1, $2, $3, 'pending', FALSE, $4, $5, $6, $7, 'pending', $8)`,
      [biz[0].id, selectedPlan.id, selectedPlan.name, now, periodEnd, cycle, amount, discountPercent]
    )

    const token = sign({
      id: user[0].id,
      name: ownerName || 'Business Owner',
      email: ownerEmail,
      phone: ownerPhone || '',
      role: 'owner',
      branch: branch[0].name || '',
      avatar: '',
      businessId: biz[0].id,
      businessName: businessName,
      subscriptionStatus: 'pending',
      subscriptionExpired: true,
    })

    await logAudit({
      actorName: ownerEmail,
      action: `Business registered: ${businessName} with plan ${selectedPlan.name}`,
      targetModule: 'Platform',
      ipAddress: getClientIp(req),
    })

    // Send registration confirmation email to owner
    sendRegistrationConfirmation({
      businessName,
      ownerName: ownerName || 'Business Owner',
      ownerEmail,
      businessId: biz[0].id,
    }).catch(err => console.error('Failed to send registration confirmation email:', err.message))

    // Send notification email to platform admin
    sendAdminNewBusinessNotification({
      businessName,
      ownerName: ownerName || 'Business Owner',
      ownerEmail,
      ownerPhone: ownerPhone || contactPhone || '',
      registrationDate: new Date().toLocaleDateString(),
      businessId: biz[0].id,
    }).catch(err => console.error('Failed to send admin notification email:', err.message))

    res.status(201).json({
      success: true,
      message: 'Business registered successfully. Please wait for account verification.',
      businessId: biz[0].id,
      registrationCode: regCode,
      ownerUsername: username || ownerEmail,
      ownerEmail,
      token,
      user: {
        id: user[0].id,
        name: ownerName || 'Business Owner',
        email: ownerEmail,
        phone: ownerPhone || '',
        role: 'owner',
        branch: branch[0].name || '',
        avatar: '',
        businessId: biz[0].id,
        businessName: businessName,
        subscriptionStatus: 'pending',
        subscriptionExpired: true,
      },
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Check subscription status
router.get('/subscription-status', authMiddleware, async (req, res) => {
  const businessId = req.user?.businessId
  if (!businessId) return res.json({ hasSubscription: false, isActive: false })
  try {
    const { rows } = await query(
      `SELECT s.*, sp.name AS plan_name
       FROM subscriptions s
       LEFT JOIN subscription_plans sp ON sp.id = s.plan_id
       WHERE s.business_id = $1 AND s.is_active = TRUE
       ORDER BY s.created_at DESC LIMIT 1`,
      [businessId]
    )
    if (!rows.length) return res.json({ hasSubscription: false, isActive: false })
    const s = rows[0]
    const isExpired = s.current_period_end && new Date(s.current_period_end) < new Date()
    res.json({
      hasSubscription: true,
      isActive: !isExpired && s.status === 'active',
      isExpired,
      plan: s.plan_name || s.plan,
      planId: s.plan_id,
      startDate: s.start_date,
      currentPeriodEnd: s.current_period_end,
      billingCycle: s.billing_cycle,
      autoRenew: s.auto_renew,
      daysRemaining: s.current_period_end ? Math.max(0, Math.ceil((new Date(s.current_period_end) - new Date()) / (1000 * 60 * 60 * 24))) : 0,
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.use('/2fa', twoFactorRoutes)

export default router
