import { Router } from 'express'
import { query } from '../config/database.js'
import { sign } from '../config/jwt.js'
import authMiddleware from '../middleware/authMiddleware.js'
import bcrypt from 'bcryptjs'
import { businessAccessBlock, ensureBusinessStatusSchema } from '../services/businessStatus.js'
import { clearFailedLogins, lockedMinutes, lockedResponse, recordFailedLogin, wrongPasswordMessage } from '../services/loginSecurity.js'
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
import { businessAccess, SUBSCRIPTION_BLOCKED_MESSAGE } from '../services/subscriptionAccess.js'
import { passwordPolicyError, settingText } from '../services/platformSettings.js'
import { normalizeCycle, priceFor } from '../services/subscriptionPricing.js'

const router = Router()

function slugifyBusinessName(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'business'
}

async function createBusinessSlug(name) {
  const baseSlug = slugifyBusinessName(name)
  let slug = baseSlug
  let suffix = 2

  while ((await query('SELECT 1 FROM businesses WHERE slug = $1 LIMIT 1', [slug])).rows.length) {
    const suffixText = `-${suffix++}`
    slug = `${baseSlug.slice(0, 120 - suffixText.length)}${suffixText}`
  }

  return slug
}

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
    const lockMinutes = await lockedMinutes('user', username)
    if (lockMinutes) return lockedResponse(res, lockMinutes)

    // Support login by username OR email
    const { rows } = await query(
      `SELECT u.*, b.id AS verified_branch_id, b.name AS branch_name,
              bu.name AS business_name, bu.id AS business_id, bu.slug AS business_slug
       FROM users u
       LEFT JOIN branches b ON b.id = u.branch_id
         AND b.business_id = u.business_id AND b.is_active = TRUE
       LEFT JOIN businesses bu ON bu.id = u.business_id
       WHERE (u.username = $1 OR u.email = $1) AND u.is_active = TRUE LIMIT 1`,
      [username]
    )

    if (!rows.length) {
      const result = await recordFailedLogin('user', username)
      return res.status(401).json({ error: wrongPasswordMessage(result, 'Invalid username or password.') })
    }

    const u = rows[0]
    const valid = await bcrypt.compare(password, u.password_hash)
    if (!valid) {
      const result = await recordFailedLogin('user', username, u.business_id)
      return res.status(401).json({ error: wrongPasswordMessage(result, 'Invalid username or password.') })
    }
    await clearFailedLogins('user', username)

    const isOwner = String(u.role || '').toLowerCase() === 'owner'
    if ((u.branch_id && !u.verified_branch_id) || (!u.branch_id && !isOwner)) {
      return res.status(403).json({
        error: 'Your account is not assigned to an active branch in this business. Contact your business owner.',
        code: 'BRANCH_UNAVAILABLE',
      })
    }

    let business = null
    let unpaidAccessGranted = false
    let businessVerified = false
    if (u.business_id) {
      await ensureBusinessStatusSchema().catch(() => {})
      const { rows: bizRows } = await query(
        `SELECT is_suspended, is_verified, unpaid_access_granted,
                COALESCE(is_deactivated, FALSE) AS is_deactivated, deactivated_by, status_reason
         FROM businesses WHERE id = $1`,
        [u.business_id]
      )
      business = bizRows[0] || null
      const blocked = businessAccessBlock(business, u.role)
      if (blocked) {
        return res.status(blocked.status).json({ error: blocked.error, code: blocked.code, reason: blocked.reason })
      }
      unpaidAccessGranted = business?.unpaid_access_granted === true
    }

    // Access needs an active paid subscription, or access granted by the platform admin.
    // businessVerified tells the app the business has an active subscription.
    let subscriptionStatus = 'active'
    let subscriptionExpired = false
    if (u.business_id) {
      const access = await businessAccess(u.business_id, unpaidAccessGranted)
      businessVerified = access.viaSubscription
      if (access.viaSubscription) subscriptionStatus = 'verified_access'
      else if (access.viaAdminAccess) subscriptionStatus = 'access_granted'
      else subscriptionExpired = true
    }

    if (subscriptionExpired && !isOwner) {
      return res.status(403).json({
        error: SUBSCRIPTION_BLOCKED_MESSAGE,
        code: 'SUBSCRIPTION_PENDING',
        subscriptionStatus,
        subscriptionExpired: true,
        businessVerified,
      })
    }

    const businessId = u.business_id
    // Two-factor applies when the business turns it on, or when the platform admin requires it
    // (Settings → Security → Require two-factor). A business cannot switch off a platform requirement.
    let twoFactorEnabled = false
    let twoFactorMethod = 'email'
    if (businessId) {
      const { rows: tfRows } = await query(
        'SELECT is_enabled, method FROM two_factor_settings WHERE business_id = $1 LIMIT 1',
        [businessId]
      )
      if (tfRows.length && tfRows[0].is_enabled) {
        twoFactorEnabled = true
        twoFactorMethod = tfRows[0].method || 'email'
      }
    }
    if (!twoFactorEnabled) {
      const { rows: tfRows } = await query(
        "SELECT is_enabled, method FROM two_factor_settings WHERE scope = 'platform' AND business_id IS NULL ORDER BY updated_at DESC LIMIT 1"
      )
      if (tfRows.length && tfRows[0].is_enabled) {
        twoFactorEnabled = true
        twoFactorMethod = tfRows[0].method || 'email'
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
        branchId: u.verified_branch_id || null,
        avatar: u.avatar_url || '',
        businessId: u.business_id,
        businessName: u.business_name,
        businessSlug: u.business_slug,
        subscriptionStatus,
        subscriptionExpired,
        unpaidAccessGranted,
        businessVerified,
        twoFactorPending: true,
      })

      return res.json({ requires2FA: true, tempToken, method: twoFactorMethod, user: { id: u.id, email: u.email, name: u.full_name, phone: u.phone || '', role: u.role, branch: u.branch_name || '', branchId: u.verified_branch_id || null, businessId: u.business_id, businessName: u.business_name, businessSlug: u.business_slug, subscriptionStatus, subscriptionExpired, unpaidAccessGranted, businessVerified } })
    }

    await query('UPDATE users SET last_login = NOW() WHERE id = $1', [u.id])

    const payload = {
      id: u.id,
      name: u.full_name,
      email: u.email,
      phone: u.phone || '',
      role: u.role,
      branch: u.branch_name || '',
      branchId: u.verified_branch_id || null,
      avatar: u.avatar_url || '',
      businessId: u.business_id,
      businessName: u.business_name,
      businessSlug: u.business_slug,
      subscriptionStatus,
      subscriptionExpired,
      unpaidAccessGranted,
      businessVerified,
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
  const { businessName, contactEmail, contactPhone, address, city, country, businessType, currencyCode, timeZone, registrationCode, ownerName, ownerEmail, ownerPhone, username, password, planId, billingCycle, description, province, district, sector } = req.body
  if (!businessName || !ownerEmail || !password) {
    return res.status(400).json({ error: 'Business name, owner email, and password are required.' })
  }
  if (!planId) {
    return res.status(400).json({ error: 'Subscription plan is required.' })
  }
  const passwordProblem = await passwordPolicyError(password)
  if (passwordProblem) return res.status(400).json({ error: passwordProblem })
  const registrationCycle = normalizeCycle(billingCycle || 'monthly')
  if (!registrationCycle) return res.status(400).json({ error: 'Billing cycle must be monthly, quarterly or annually.' })
  // Check the plan before anything is created, so a bad plan never leaves a half-registered business.
  const { rows: chosenPlan } = await query('SELECT id FROM subscription_plans WHERE id::text = $1 AND is_active = TRUE', [String(planId)])
    .catch(() => ({ rows: [] }))
  if (!chosenPlan.length) return res.status(400).json({ error: 'Selected subscription plan is not available.' })
  const defaultCurrency = await settingText('platform_currency', 'RWF')
  try {
    // Check if email already exists
    const { rows: existing } = await query('SELECT id FROM users WHERE email = $1', [ownerEmail])
    if (existing.length) {
      return res.status(409).json({ error: 'An account with this email already exists.' })
    }

    // Create business
    const regCode = (registrationCode && registrationCode.trim()) || ('BR-' + Date.now().toString(36).toUpperCase())
    const businessSlug = await createBusinessSlug(businessName)
    const { rows: biz } = await query(
      `INSERT INTO businesses (name, slug, contact_email, contact_phone, address, city, country, business_type, registration_code, currency_code, is_verified, description, province, district, sector)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`,
      [
        businessName,
        businessSlug,
        contactEmail || ownerEmail,
        contactPhone || ownerPhone,
        address || '',
        city || '',
        country || 'Rwanda',
        businessType || 'bar',
        regCode,
        currencyCode || defaultCurrency,
        false, // not verified until super admin approves
        description || '',
        province || '',
        district || '',
        sector || '',
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

    // Same calculation as the prices shown on the registration page (services/subscriptionPricing.js).
    const { cycle, amount, months: monthsToAdd, discountPercent } = priceFor(selectedPlan, registrationCycle)

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
      businessSlug,
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
      businessSlug,
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
        businessSlug,
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
