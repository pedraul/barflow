import { verify } from '../config/jwt.js'
import { query } from '../config/database.js'
import { businessAccessBlock, ensureBusinessStatusSchema } from '../services/businessStatus.js'
import { sessionTimeoutMinutes } from '../services/loginSecurity.js'
import { adminIpWhitelist, ipAllowed, requestIp } from '../services/platformSettings.js'
import { businessAccess, SUBSCRIPTION_BLOCKED_MESSAGE } from '../services/subscriptionAccess.js'

// Platform admin modules. super_admin always has all of them.
export const PLATFORM_MODULES = ['businesses', 'subscriptions', 'payments', 'users', 'reports', 'settings', 'backup']

export function normalizeAdminPermissions(raw) {
  let value = raw
  if (typeof value === 'string') {
    try { value = JSON.parse(value) } catch { value = [] }
  }
  if (Array.isArray(value)) return value.filter((p) => PLATFORM_MODULES.includes(p))
  if (value && typeof value === 'object') return PLATFORM_MODULES.filter((p) => value[p] === true)
  return []
}

export function adminCan(user, module) {
  if (!user?.isPlatformAdmin) return false
  if (user.role === 'super_admin') return true
  return Array.isArray(user.permissions) && user.permissions.includes(module)
}

// Route guard: the signed-in platform admin needs at least one of the given modules.
export function requirePlatformPermission(...modules) {
  return (req, res, next) => {
    if (modules.some((m) => adminCan(req.user, m))) return next()
    return res.status(403).json({ error: `You do not have access to ${modules.join(' / ')}. Ask a super admin to grant it.`, code: 'PLATFORM_PERMISSION_DENIED' })
  }
}

export function requireSuperAdmin(req, res, next) {
  if (req.user?.isPlatformAdmin && req.user.role === 'super_admin') return next()
  return res.status(403).json({ error: 'Only a super admin can do this.', code: 'SUPER_ADMIN_REQUIRED' })
}

function sessionExpired(res) {
  return res.status(401).json({ error: 'Your session has expired. Please sign in again.', code: 'SESSION_EXPIRED' })
}

const tokenAgeMinutes = (user) => (Number.isFinite(Number(user?.iat)) ? (Date.now() / 1000 - Number(user.iat)) / 60 : Infinity)

export default async function authMiddleware(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  const user = verify(token)
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const platformToken = user.isPlatformAdmin === true || ['platform_admin', 'super_admin'].includes(String(user.role || '').toLowerCase())
    if (user.id && !platformToken) {
      await ensureBusinessStatusSchema().catch(() => {})
      const { rows } = await query(
        `SELECT u.id, u.full_name, u.email, u.role, u.business_id, u.branch_id,
          b.name AS branch_name, bu.is_verified, bu.is_suspended,
          COALESCE(bu.is_deactivated, FALSE) AS is_deactivated, bu.deactivated_by, bu.status_reason,
          bu.unpaid_access_granted
         FROM users u
         LEFT JOIN branches b ON b.id = u.branch_id
         LEFT JOIN businesses bu ON bu.id = u.business_id
         WHERE u.id = $1 AND u.is_active = TRUE
         LIMIT 1`,
        [user.id]
      )
      if (!rows.length) return res.status(401).json({ error: 'User account is inactive or no longer exists.' })
      // Session timeout (Settings → Security; the stricter of platform and business values).
      if (tokenAgeMinutes(user) > await sessionTimeoutMinutes(rows[0].business_id)) return sessionExpired(res)
      const blocked = businessAccessBlock(rows[0], rows[0].role)
      if (blocked) {
        return res.status(blocked.status).json({ error: blocked.error, code: blocked.code, reason: blocked.reason })
      }
      const access = rows[0].business_id ? await businessAccess(rows[0].business_id, rows[0].unpaid_access_granted === true) : { allowed: true, viaSubscription: false }
      const hasBusinessAccess = access.allowed
      const ownerSubscriptionRoute = String(rows[0].role || '').toLowerCase() === 'owner'
        && (req.originalUrl.includes('/owner/subscription') || req.originalUrl.includes('/owner/business'))
      if (!hasBusinessAccess && !ownerSubscriptionRoute) {
        return res.status(403).json({
          error: SUBSCRIPTION_BLOCKED_MESSAGE,
          code: 'SUBSCRIPTION_PENDING',
        })
      }
      req.user = {
        ...user,
        id: rows[0].id,
        full_name: rows[0].full_name,
        email: rows[0].email,
        role: rows[0].role,
        businessId: rows[0].business_id || user.businessId,
        branchId: rows[0].branch_id || null,
        branchName: rows[0].branch_name || '',
        unpaidAccessGranted: rows[0].unpaid_access_granted === true,
        businessVerified: access.viaSubscription === true,
        assignedBranchId: rows[0].branch_id || null,
      }

      // Accountants work for the whole business: the X-Branch-Id header picks the branch
      // they are working in ("all" = every branch, view only). Checked against the business.
      const requestedBranch = String(req.headers['x-branch-id'] || '').trim()
      if (String(rows[0].role || '').toLowerCase() === 'accountant' && requestedBranch) {
        if (requestedBranch.toLowerCase() === 'all') {
          req.user.branchScope = 'all'
        } else if (requestedBranch !== req.user.branchId) {
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestedBranch)
          const { rows: branchRows } = isUuid
            ? await query(
              'SELECT id, name FROM branches WHERE id = $1 AND business_id = $2 AND is_active = TRUE',
              [requestedBranch, req.user.businessId]
            )
            : { rows: [] }
          if (!branchRows.length) {
            return res.status(403).json({ error: 'The selected branch does not belong to your business or is inactive.', code: 'BRANCH_NOT_ALLOWED' })
          }
          req.user.branchId = branchRows[0].id
          req.user.branchName = branchRows[0].name
        }
      }
    } else {
      // Platform admin: platform session timeout and IP allow-list.
      if (platformToken) {
        if (tokenAgeMinutes(user) > await sessionTimeoutMinutes(null)) return sessionExpired(res)
        if (!ipAllowed(requestIp(req), await adminIpWhitelist())) {
          return res.status(403).json({ error: 'Platform admin access is not allowed from this network.', code: 'IP_NOT_ALLOWED' })
        }
        // Role, permissions and active state come from the database, so a disabled, deleted
        // or re-permissioned admin is affected immediately, not when the token expires.
        const { rows } = user.id
          ? await query('SELECT id, full_name, email, role, phone, is_active, permissions FROM platform_admins WHERE id = $1 LIMIT 1', [user.id])
          : { rows: [] }
        if (!rows.length || !rows[0].is_active) {
          return res.status(401).json({ error: 'Platform admin account is disabled or no longer exists.', code: 'ADMIN_INACTIVE' })
        }
        const admin = rows[0]
        req.user = {
          ...user,
          id: admin.id,
          name: admin.full_name || admin.email,
          full_name: admin.full_name,
          email: admin.email,
          role: admin.role || 'admin',
          phone: admin.phone || null,
          permissions: normalizeAdminPermissions(admin.permissions),
          isPlatformAdmin: true,
        }
        return next()
      }
      req.user = user
    }
    next()
  } catch (error) {
    console.error('Failed to load authenticated user context:', error.message)
    return res.status(500).json({ error: 'Unable to load account context.' })
  }
}
