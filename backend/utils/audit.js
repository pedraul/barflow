import { query } from '../config/database.js'
import { settingBool } from '../services/platformSettings.js'

function normalizeActorId(userId) {
  if (!userId) return null
  if (typeof userId === 'string') {
    const trimmed = userId.trim()
    if (!trimmed) return null
    if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(trimmed)) {
      return trimmed
    }
    return null
  }
  return null
}

function normalizeMetadata(metadata) {
  if (!metadata) return {}
  if (typeof metadata === 'string') {
    try {
      return JSON.parse(metadata)
    } catch {
      return { detail: metadata }
    }
  }
  return metadata
}

function normalizeAuditRow(row) {
  return {
    timestamp: row.created_at ? new Date(row.created_at).toISOString() : null,
    userId: row.actor_id ?? row.user_id ?? null,
    actor: row.actor_name ?? row.actor ?? null,
    action: row.action ?? null,
    targetModule: row.target_module ?? row.targetModule ?? null,
    ipAddress: row.ip_address ?? row.ipAddress ?? null,
    businessId: row.business_id ?? row.businessId ?? null,
    metadata: normalizeMetadata(row.metadata ?? null),
  }
}

export function serializeAuditLogs(rows = [], format = 'csv') {
  const normalizedRows = (rows || []).map(normalizeAuditRow)
  const resolvedFormat = String(format || 'csv').toLowerCase()

  if (resolvedFormat === 'json') {
    return JSON.stringify(normalizedRows, null, 2)
  }

  const escapeCsv = (value) => {
    const str = String(value ?? '')
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"'
    }
    return str
  }

  const header = 'Timestamp,User ID,Actor,Action,Target Module,IP Address,Business ID,Metadata'
  const body = normalizedRows.map((row) => [
    escapeCsv(row.timestamp),
    escapeCsv(row.userId),
    escapeCsv(row.actor),
    escapeCsv(row.action),
    escapeCsv(row.targetModule),
    escapeCsv(row.ipAddress),
    escapeCsv(row.businessId),
    escapeCsv(typeof row.metadata === 'string' ? row.metadata : JSON.stringify(row.metadata || {})),
  ].join(',')).join('\n')

  return [header, body].filter(Boolean).join('\n')
}

export async function logAudit({ userId, actorName, action, targetModule, ipAddress, businessId, metadata }) {
  try {
    const normalizedActorId = normalizeActorId(userId)
    const normalizedActorName = actorName || 'System'
    const normalizedAction = action || 'System activity'
    const normalizedTargetModule = targetModule || 'System'
    const normalizedIp = ipAddress || '0.0.0.0'
    const normalizedBusinessId = businessId || null
    const normalizedMetadata = normalizeMetadata(metadata)

    // Settings → Audit (platform admin). Platform-level records (no business) are always kept,
    // so changes made by platform admins stay accountable.
    if (normalizedBusinessId) {
      if (!(await settingBool('audit_log_enabled', true))) return
      const isLoginEvent = /authentication/i.test(normalizedTargetModule) || /\b(log ?in|log ?out|sign(ed)? ?(in|out))\b/i.test(normalizedAction)
      if (isLoginEvent && !(await settingBool('audit_log_login_events', true))) return
    } else if (/authentication/i.test(normalizedTargetModule) && !(await settingBool('audit_log_login_events', true))) {
      return
    }

    await query(
      `INSERT INTO audit_logs (actor_id, actor_name, action, entity_type, metadata, target_module, ip_address, business_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [normalizedActorId, normalizedActorName, normalizedAction, normalizedTargetModule || 'activity', normalizedMetadata, normalizedTargetModule, normalizedIp, normalizedBusinessId]
    )
  } catch (err) {
    console.error('Audit log write failed:', err.message)
  }
}

export function buildAuditVisibilityClause({ role, businessId, userId, actorName, tableAlias = 'al' }) {
  const normalizedRole = String(role || '').toLowerCase()
  const alias = tableAlias
  const clauses = []
  const params = []

  if (!businessId) {
    return { where: `WHERE ${alias}.business_id IS NULL`, params: [] }
  }

  clauses.push(`${alias}.business_id = $1`)
  params.push(businessId)

  if (normalizedRole === 'owner') {
    return { where: `WHERE ${clauses.join(' AND ')}`, params }
  }

  if (normalizedRole === 'manager') {
    clauses.push(`(${alias}.actor_id IS NULL OR EXISTS (SELECT 1 FROM users u WHERE u.id = ${alias}.actor_id AND u.business_id = $1 AND COALESCE(u.role, '') <> 'owner'))`)
    return { where: `WHERE ${clauses.join(' AND ')}`, params }
  }

  const selfClauses = []
  if (userId) {
    selfClauses.push(`${alias}.actor_id = $${params.length + 1}`)
    params.push(userId)
  }
  if (actorName) {
    selfClauses.push(`${alias}.actor_name = $${params.length + 1}`)
    params.push(actorName)
  }

  if (selfClauses.length) {
    clauses.push(`(${selfClauses.join(' OR ')})`)
  } else {
    clauses.push(`${alias}.actor_id IS NULL`)
  }

  return { where: `WHERE ${clauses.join(' AND ')}`, params }
}

export function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || '0.0.0.0'
}
