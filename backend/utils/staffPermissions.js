import { query } from '../config/database.js'

/**
 * Permissions the owner can grant to individual workers.
 * The owner implicitly holds all of them.
 */
export const GRANTABLE_PERMISSIONS = [
  { key: 'create_employees', label: 'Create employees', description: 'Add new staff accounts in their own branch.' },
  { key: 'edit_employees', label: 'Edit & deactivate employees', description: 'Change staff details, role or status in their own branch.' },
  { key: 'reset_passwords', label: 'Reset passwords', description: 'Set a new password for staff in their own branch.' },
  { key: 'view_staff_performance', label: 'View shifts & performance', description: 'See staff shifts and performance for their branch.' },
]
export const GRANTABLE_KEYS = new Set(GRANTABLE_PERMISSIONS.map((p) => p.key))

// Roles a non-owner (even with grants) may create or manage.
// Owner and Manager accounts stay under the owner's control.
export const DELEGABLE_ROLES = new Set(['accountant', 'waiter', 'kitchen', 'bar', 'operator'])

export const isOwner = (req) => String(req.user?.role || '').toLowerCase() === 'owner'

export async function getUserGrants(req) {
  if (req._grants) return req._grants
  if (isOwner(req)) {
    req._grants = new Set(GRANTABLE_KEYS)
    return req._grants
  }
  if (!req.user?.id || !req.user?.businessId) return new Set()
  const { rows } = await query(
    'SELECT permission FROM user_permissions WHERE user_id = $1 AND business_id = $2',
    [req.user.id, req.user.businessId]
  )
  req._grants = new Set(rows.map((r) => r.permission))
  return req._grants
}

export async function hasGrant(req, permission) {
  return (await getUserGrants(req)).has(permission)
}

/** Express middleware: owner, or a worker the owner granted `permission`. */
export function requireGrant(permission) {
  return async (req, res, next) => {
    try {
      if (await hasGrant(req, permission)) return next()
      return res.status(403).json({ error: 'You do not have access to this action. Ask the owner to grant it.' })
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  }
}

/**
 * Checks a non-owner actor may manage `targetUserId`: same business,
 * same branch, delegable role, and never themselves.
 * Returns an error message, or null when allowed. Owners are always allowed
 * (within their business).
 */
export async function checkCanManageUser(req, targetUserId) {
  const { rows } = await query(
    'SELECT id, role, branch_id FROM users WHERE id = $1 AND business_id = $2',
    [targetUserId, req.user?.businessId]
  )
  if (!rows.length) return { status: 404, error: 'User not found.' }
  if (isOwner(req)) return null
  const target = rows[0]
  if (String(target.id) === String(req.user.id)) return { status: 403, error: 'You cannot change your own account here.' }
  if (!DELEGABLE_ROLES.has(String(target.role).toLowerCase())) return { status: 403, error: 'Only the owner can manage this account.' }
  if (String(target.branch_id) !== String(req.user.branchId)) return { status: 403, error: 'You can only manage staff in your own branch.' }
  return null
}
