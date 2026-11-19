import { verify } from '../config/jwt.js'
import { query } from '../config/database.js'

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
    if (user.id && !['platform_admin', 'super_admin'].includes(String(user.role || '').toLowerCase())) {
      const { rows } = await query(
        `SELECT u.id, u.full_name, u.email, u.role, u.business_id, u.branch_id,
          b.name AS branch_name, bu.is_verified, bu.is_suspended,
          bu.unpaid_access_granted
         FROM users u
         LEFT JOIN branches b ON b.id = u.branch_id
         LEFT JOIN businesses bu ON bu.id = u.business_id
         WHERE u.id = $1 AND u.is_active = TRUE
         LIMIT 1`,
        [user.id]
      )
      if (!rows.length) return res.status(401).json({ error: 'User account is inactive or no longer exists.' })
      if (rows[0].is_suspended) {
        return res.status(403).json({ error: 'Your business account has been suspended. Contact support.', code: 'BUSINESS_SUSPENDED' })
      }
      const hasBusinessAccess = rows[0].is_verified || rows[0].unpaid_access_granted
      const ownerSubscriptionRoute = String(rows[0].role || '').toLowerCase() === 'owner'
        && req.originalUrl.includes('/owner/subscription')
      if (!hasBusinessAccess && !ownerSubscriptionRoute) {
        return res.status(403).json({
          error: 'Your business subscription is pending activation. Please complete payment or contact an administrator.',
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
        businessVerified: rows[0].is_verified === true,
      }
    } else {
      req.user = user
    }
    next()
  } catch (error) {
    console.error('Failed to load authenticated user context:', error.message)
    return res.status(500).json({ error: 'Unable to load account context.' })
  }
}
