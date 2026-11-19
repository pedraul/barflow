import { Router } from 'express'
import { query } from '../config/database.js'
import authMiddleware from '../middleware/authMiddleware.js'
import { getBranchContext } from '../middleware/branchContext.js'
import { logAudit, getClientIp } from '../utils/audit.js'
import { hasGrant } from '../utils/staffPermissions.js'

const router = Router()

const SUPERVISOR_ROLES = new Set(['owner', 'manager'])
const roleOf = (req) => String(req.user?.role || '').toLowerCase()
// Owner/Manager, or a worker the owner granted 'view_staff_performance'.
const canSupervise = async (req) => SUPERVISOR_ROLES.has(roleOf(req)) || hasGrant(req, 'view_staff_performance')

// Per-shift performance metrics, computed over the shift window
// (an open shift is measured up to NOW()).
const METRICS_JOIN = `
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS orders_count,
           COALESCE(SUM(o.total_amount), 0)::numeric AS sales_total
    FROM orders o
    WHERE o.user_id = s.user_id
      AND o.business_id = s.business_id
      AND o.status <> 'Cancelled'
      AND o.created_at >= s.started_at
      AND o.created_at < COALESCE(s.ended_at, NOW())
  ) om ON TRUE
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS activity_count,
           COUNT(*) FILTER (WHERE al.action LIKE 'Marked order % as ready')::int AS orders_prepared
    FROM audit_logs al
    WHERE al.actor_id::text = s.user_id::text
      AND COALESCE(al.target_module, '') <> 'Shifts'
      AND al.created_at >= s.started_at
      AND al.created_at < COALESCE(s.ended_at, NOW())
  ) am ON TRUE
`

const SHIFT_COLUMNS = `
  s.id, s.user_id, s.role, s.branch_id, s.started_at, s.ended_at, s.start_note, s.end_note,
  u.full_name AS user_name, b.name AS branch_name,
  EXTRACT(EPOCH FROM (COALESCE(s.ended_at, NOW()) - s.started_at))::bigint AS duration_seconds,
  om.orders_count, om.sales_total, am.activity_count, am.orders_prepared
`

function mapShift(r) {
  return {
    id: r.id,
    userId: r.user_id,
    userName: r.user_name || '',
    role: r.role,
    branchId: r.branch_id,
    branchName: r.branch_name || '',
    startedAt: r.started_at,
    endedAt: r.ended_at,
    isOpen: !r.ended_at,
    startNote: r.start_note || '',
    endNote: r.end_note || '',
    durationMinutes: Math.max(0, Math.round(Number(r.duration_seconds || 0) / 60)),
    ordersCount: Number(r.orders_count || 0),
    salesTotal: Number(r.sales_total || 0),
    ordersPrepared: Number(r.orders_prepared || 0),
    activityCount: Number(r.activity_count || 0),
  }
}

async function loadShift(id) {
  const { rows } = await query(
    `SELECT ${SHIFT_COLUMNS}
     FROM staff_shifts s
     JOIN users u ON u.id = s.user_id
     LEFT JOIN branches b ON b.id = s.branch_id
     ${METRICS_JOIN}
     WHERE s.id = $1`,
    [id]
  )
  return rows[0] ? mapShift(rows[0]) : null
}

/**
 * Builds the WHERE clause for list/performance queries.
 * Owner: whole business (or one branch). Manager: own branch.
 * Everyone else: only their own shifts.
 */
async function buildScope(req) {
  const { from, to, userId, role: roleFilter, branchId } = req.query
  const scope = await getBranchContext(req, { requestedBranchId: branchId, allowOwnerAll: true })

  const clauses = ['s.business_id = $1']
  const params = [scope.businessId]
  const add = (sql, value) => {
    params.push(value)
    clauses.push(sql.replace('?', `$${params.length}`))
  }

  if (scope.branchId) add('s.branch_id = ?', scope.branchId)
  if (!(await canSupervise(req))) {
    add('s.user_id = ?', req.user.id)
  } else if (userId) {
    add('s.user_id = ?', userId)
  }
  if (roleFilter) add('LOWER(s.role) = LOWER(?)', roleFilter)
  // Overlap semantics: include shifts that touch the [from, to) window.
  if (from) add('COALESCE(s.ended_at, NOW()) >= ?', from)
  if (to) add('s.started_at < ?', to)

  return { where: `WHERE ${clauses.join(' AND ')}`, params }
}

// GET /api/shifts/current — the caller's open shift (or null)
router.get('/current', authMiddleware, async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT id FROM staff_shifts WHERE user_id = $1 AND ended_at IS NULL LIMIT 1',
      [req.user.id]
    )
    res.json({ shift: rows[0] ? await loadShift(rows[0].id) : null })
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message })
  }
})

// POST /api/shifts/start  Body: { note? }
router.post('/start', authMiddleware, async (req, res) => {
  if (roleOf(req) === 'owner') {
    return res.status(400).json({ error: 'Owners do not track shifts.' })
  }
  try {
    const scope = await getBranchContext(req)
    const { rows: open } = await query(
      'SELECT id FROM staff_shifts WHERE user_id = $1 AND ended_at IS NULL LIMIT 1',
      [req.user.id]
    )
    if (open.length) {
      return res.status(409).json({ error: 'You already have an open shift.', shift: await loadShift(open[0].id) })
    }

    const note = String(req.body?.note || '').trim() || null
    const { rows } = await query(
      `INSERT INTO staff_shifts (business_id, branch_id, user_id, role, start_note)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [scope.businessId, scope.branchId, req.user.id, req.user.role, note]
    )

    await logAudit({
      userId: req.user.id,
      actorName: req.user.full_name || req.user.email || 'Staff',
      action: 'Started shift',
      targetModule: 'Shifts',
      ipAddress: getClientIp(req),
      businessId: scope.businessId,
    })

    res.status(201).json({ shift: await loadShift(rows[0].id) })
  } catch (error) {
    // Unique partial index guards against a double-click race.
    if (error.code === '23505') return res.status(409).json({ error: 'You already have an open shift.' })
    res.status(error.statusCode || 500).json({ error: error.message })
  }
})

// POST /api/shifts/end  Body: { note? }
router.post('/end', authMiddleware, async (req, res) => {
  try {
    const note = String(req.body?.note || '').trim() || null
    const { rows } = await query(
      `UPDATE staff_shifts SET ended_at = NOW(), end_note = $2
       WHERE user_id = $1 AND ended_at IS NULL
       RETURNING id`,
      [req.user.id, note]
    )
    if (!rows.length) return res.status(404).json({ error: 'You have no open shift.' })

    const shift = await loadShift(rows[0].id)
    await logAudit({
      userId: req.user.id,
      actorName: req.user.full_name || req.user.email || 'Staff',
      action: `Ended shift (${shift.durationMinutes} min)`,
      targetModule: 'Shifts',
      ipAddress: getClientIp(req),
      businessId: req.user.businessId,
    })

    res.json({ shift })
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message })
  }
})

// GET /api/shifts?from=&to=&userId=&role=&branchId=
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { where, params } = await buildScope(req)
    const { rows } = await query(
      `SELECT ${SHIFT_COLUMNS}
       FROM staff_shifts s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN branches b ON b.id = s.branch_id
       ${METRICS_JOIN}
       ${where}
       ORDER BY s.started_at DESC
       LIMIT 500`,
      params
    )
    res.json(rows.map(mapShift))
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message })
  }
})

// GET /api/shifts/performance?from=&to=&role=&branchId=  (Owner / Manager)
// One row per worker, aggregated across their shifts in the window.
router.get('/performance', authMiddleware, async (req, res) => {
  if (!(await canSupervise(req))) {
    return res.status(403).json({ error: 'Only owners and managers can view staff performance.' })
  }
  try {
    const { where, params } = await buildScope(req)
    const { rows } = await query(
      `SELECT s.user_id,
              MAX(u.full_name) AS user_name,
              MAX(u.role::text) AS role,
              MAX(b.name) AS branch_name,
              COUNT(*)::int AS shifts_count,
              BOOL_OR(s.ended_at IS NULL) AS on_shift,
              MAX(s.started_at) AS last_started_at,
              SUM(EXTRACT(EPOCH FROM (COALESCE(s.ended_at, NOW()) - s.started_at)))::bigint AS total_seconds,
              SUM(om.orders_count)::int AS orders_count,
              SUM(om.sales_total)::numeric AS sales_total,
              SUM(am.orders_prepared)::int AS orders_prepared,
              SUM(am.activity_count)::int AS activity_count
       FROM staff_shifts s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN branches b ON b.id = s.branch_id
       ${METRICS_JOIN}
       ${where}
       GROUP BY s.user_id
       ORDER BY total_seconds DESC`,
      params
    )
    res.json(rows.map((r) => {
      const totalMinutes = Math.round(Number(r.total_seconds || 0) / 60)
      const shiftsCount = Number(r.shifts_count || 0)
      const hours = totalMinutes / 60
      return {
        userId: r.user_id,
        userName: r.user_name || '',
        role: r.role,
        branchName: r.branch_name || '',
        shiftsCount,
        onShift: Boolean(r.on_shift),
        lastStartedAt: r.last_started_at,
        totalMinutes,
        avgShiftMinutes: shiftsCount ? Math.round(totalMinutes / shiftsCount) : 0,
        ordersCount: Number(r.orders_count || 0),
        salesTotal: Number(r.sales_total || 0),
        ordersPrepared: Number(r.orders_prepared || 0),
        activityCount: Number(r.activity_count || 0),
        ordersPerHour: hours > 0 ? Number((Number(r.orders_count || 0) / hours).toFixed(1)) : 0,
      }
    }))
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message })
  }
})

export default router
