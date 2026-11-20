import { Router } from 'express'
import { query, pool } from '../config/database.js'
import authMiddleware from '../middleware/authMiddleware.js'
import roleMiddleware from '../middleware/roleMiddleware.js'
import { logAudit, getClientIp } from '../utils/audit.js'
import { GRANTABLE_PERMISSIONS, GRANTABLE_KEYS, getUserGrants, canReceivePermission } from '../utils/staffPermissions.js'

const router = Router()
const ownerOnly = [authMiddleware, roleMiddleware('owner')]

// GET /api/staff-permissions/me — the caller's grants (owner: all)
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const grants = await getUserGrants(req)
    res.json({ permissions: [...grants], catalog: GRANTABLE_PERMISSIONS })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// GET /api/staff-permissions — every active worker with their grants (owner)
router.get('/', ...ownerOnly, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT u.id, u.full_name, u.role::text AS role, b.name AS branch_name,
              COALESCE(ARRAY_AGG(up.permission) FILTER (WHERE up.permission IS NOT NULL), '{}') AS permissions
       FROM users u
       LEFT JOIN branches b ON b.id = u.branch_id
       LEFT JOIN user_permissions up ON up.user_id = u.id AND up.business_id = u.business_id
       WHERE u.business_id = $1 AND u.is_active = TRUE AND LOWER(u.role::text) <> 'owner'
       GROUP BY u.id, b.name
       ORDER BY b.name NULLS LAST, u.role, u.full_name`,
      [req.user.businessId]
    )
    res.json({
      catalog: GRANTABLE_PERMISSIONS,
      users: rows.map((r) => ({
        id: r.id,
        name: r.full_name,
        role: r.role,
        branch: r.branch_name || '',
        permissions: r.permissions.filter((p) => GRANTABLE_KEYS.has(p) && canReceivePermission(p, r.role)),
      })),
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// PUT /api/staff-permissions/:userId  Body: { permissions: [...] } (owner)
// Replaces the worker's grant set; audit-logs what was granted / revoked.
router.put('/:userId', ...ownerOnly, async (req, res) => {
  const requested = Array.isArray(req.body?.permissions) ? req.body.permissions : null
  if (!requested) return res.status(400).json({ error: 'permissions array is required.' })
  const invalid = requested.filter((p) => !GRANTABLE_KEYS.has(p))
  if (invalid.length) return res.status(400).json({ error: `Unknown permission(s): ${invalid.join(', ')}` })
  const next = new Set(requested)

  const client = await pool.connect()
  try {
    const { rows: users } = await client.query(
      `SELECT id, full_name, role::text AS role FROM users
       WHERE id = $1 AND business_id = $2 AND is_active = TRUE`,
      [req.params.userId, req.user.businessId]
    )
    if (!users.length) return res.status(404).json({ error: 'User not found.' })
    if (users[0].role.toLowerCase() === 'owner') return res.status(400).json({ error: 'The owner already has full access.' })
    const notAllowed = [...next].filter((p) => !canReceivePermission(p, users[0].role))
    if (notAllowed.length) {
      const labels = notAllowed.map((p) => GRANTABLE_PERMISSIONS.find((d) => d.key === p)?.label || p)
      return res.status(400).json({ error: `${labels.join(', ')} can't be granted to a ${users[0].role}.` })
    }

    await client.query('BEGIN')
    const { rows: current } = await client.query(
      'SELECT permission FROM user_permissions WHERE user_id = $1 AND business_id = $2 FOR UPDATE',
      [req.params.userId, req.user.businessId]
    )
    const before = new Set(current.map((r) => r.permission))
    const granted = [...next].filter((p) => !before.has(p))
    const revoked = [...before].filter((p) => !next.has(p))

    if (revoked.length) {
      await client.query(
        'DELETE FROM user_permissions WHERE user_id = $1 AND business_id = $2 AND permission = ANY($3::text[])',
        [req.params.userId, req.user.businessId, revoked]
      )
    }
    for (const permission of granted) {
      await client.query(
        `INSERT INTO user_permissions (business_id, user_id, permission, granted_by)
         VALUES ($1, $2, $3, $4) ON CONFLICT (user_id, permission) DO NOTHING`,
        [req.user.businessId, req.params.userId, permission, req.user.id]
      )
    }
    await client.query('COMMIT')

    if (granted.length || revoked.length) {
      const parts = []
      if (granted.length) parts.push(`granted ${granted.join(', ')}`)
      if (revoked.length) parts.push(`revoked ${revoked.join(', ')}`)
      await logAudit({
        userId: req.user.id,
        actorName: req.user.full_name || req.user.email || 'Owner',
        action: `Access for "${users[0].full_name}": ${parts.join('; ')}`,
        targetModule: 'Staff Access',
        ipAddress: getClientIp(req),
        businessId: req.user.businessId,
      })
    }

    res.json({ userId: req.params.userId, permissions: [...next], granted, revoked })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    res.status(500).json({ error: error.message })
  } finally {
    client.release()
  }
})

export default router
