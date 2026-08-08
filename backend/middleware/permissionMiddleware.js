import { query } from '../config/database.js'

const PERMISSION_MAP = {
  can_withdraw: 'canWithdraw',
  can_transfer: 'canTransfer',
  can_manage_users: 'canManageUsers',
  can_view_revenue: 'canViewRevenue',
  can_manage_settings: 'canManageSettings',
  can_view_withdraw_logs: 'canViewWithdrawLogs',
  can_view_transfer_logs: 'canViewTransferLogs',
  can_approve_transfers: 'canApproveTransfers',
}

export async function getPermissions(req) {
  if (req._permissions) return req._permissions
  const role = req.user?.role
  if (!role) return {}
  const { rows } = await query(
    `SELECT can_withdraw, can_transfer, can_manage_users, can_view_revenue, can_manage_settings, can_view_withdraw_logs, can_view_transfer_logs, can_approve_transfers FROM role_permissions WHERE role = $1 LIMIT 1`,
    [role]
  )
  const dbPerms = rows.length ? rows[0] : {}
  const mappedPerms = Object.entries(PERMISSION_MAP).reduce((result, [snake, camel]) => {
    const value = !!dbPerms[snake]
    result[snake] = value
    result[camel] = value
    return result
  }, {})
  req._permissions = mappedPerms
  return mappedPerms
}

export function permissionMiddleware(...required) {
  return async (req, res, next) => {
    try {
      const perms = await getPermissions(req)
      const missing = required.filter((key) => !perms[key])
      if (missing.length) {
        return res.status(403).json({ error: 'Forbidden: insufficient permissions.' })
      }
      next()
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  }
}

export { PERMISSION_MAP }
