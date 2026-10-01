import { query } from '../config/database.js'

export async function getBranchContext(req, { requestedBranchId = null, allowOwnerAll = false } = {}) {
  const role = String(req.user?.role || '').toLowerCase()
  const businessId = req.user?.businessId || null

  if (!businessId) {
    const error = new Error('No business associated with this account.')
    error.statusCode = 403
    throw error
  }

  if (role === 'owner') {
    if (allowOwnerAll && (!requestedBranchId || requestedBranchId === 'all')) {
      return { businessId, branchId: null, isAllBranches: true }
    }
    if (!requestedBranchId) {
      const error = new Error('Select a branch for this operation.')
      error.statusCode = 400
      throw error
    }
    const { rows } = await query(
      'SELECT id FROM branches WHERE id = $1 AND business_id = $2 AND is_active = TRUE',
      [requestedBranchId, businessId]
    )
    if (!rows.length) {
      const error = new Error('Branch does not belong to this business or is inactive.')
      error.statusCode = 403
      throw error
    }
    return { businessId, branchId: rows[0].id, isAllBranches: false }
  }

  const branchId = req.user?.branchId || null
  if (!branchId) {
    const error = new Error('This user is not assigned to a branch.')
    error.statusCode = 403
    throw error
  }
  if (requestedBranchId && requestedBranchId !== branchId) {
    const error = new Error('You can only access your assigned branch.')
    error.statusCode = 403
    throw error
  }
  const { rows } = await query(
    'SELECT id FROM branches WHERE id = $1 AND business_id = $2 AND is_active = TRUE',
    [branchId, businessId]
  )
  if (!rows.length) {
    const error = new Error('Your assigned branch does not belong to this business or is inactive.')
    error.statusCode = 403
    throw error
  }
  return { businessId, branchId: rows[0].id, isAllBranches: false }
}

export function branchClause({ businessId, branchId }, alias = '') {
  const prefix = alias ? `${alias}.` : ''
  if (branchId) return { sql: `${prefix}business_id = $1 AND ${prefix}branch_id = $2`, params: [businessId, branchId] }
  return { sql: `${prefix}business_id = $1`, params: [businessId] }
}
