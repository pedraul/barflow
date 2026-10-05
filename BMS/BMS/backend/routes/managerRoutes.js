import { Router } from 'express'
import { query } from '../config/database.js'
import authMiddleware from '../middleware/authMiddleware.js'
import roleMiddleware from '../middleware/roleMiddleware.js'
import { logAudit, getClientIp, buildAuditVisibilityClause } from '../utils/audit.js'
import { permissionMiddleware } from '../middleware/permissionMiddleware.js'

const router = Router()

const managerOnly = [authMiddleware, roleMiddleware('manager')]
const managerOrOwner = [authMiddleware, roleMiddleware('manager', 'owner')]
const canApproveTransfers = [authMiddleware, permissionMiddleware('can_approve_transfers')]
const canViewTransferLogs = [authMiddleware, permissionMiddleware('can_view_transfer_logs')]

router.get('/transfers/pending', ...managerOnly, ...canViewTransferLogs, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT t.*, u1.full_name AS from_name, u2.full_name AS to_name, u2.phone AS to_phone
        FROM transfers t
        LEFT JOIN users u1 ON u1.id = t.from_user
        LEFT JOIN users u2 ON u2.id = t.to_user
        WHERE t.status = 'pending'
        ORDER BY t.created_at DESC`,
    )

await logAudit({
       userId: req.user.id,
       actorName: req.user.full_name || req.user.email,
       action: 'Viewed pending transfers',
       targetModule: 'Transfers',
       ipAddress: getClientIp(req),
       businessId: req.user?.businessId,
     })

    res.json(rows.map((t) => ({
      id: t.id,
      name: t.from_name || 'Unknown',
      phone: t.to_phone || '',
      amount: t.amount,
      purpose: t.description || '',
    })))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.post('/transfers/:id/approve', ...managerOnly, ...canApproveTransfers, async (req, res) => {
  try {
    const { id } = req.params
    const { action } = req.body
    if (!['approved', 'rejected'].includes(action)) {
      return res.status(400).json({ error: 'Action must be "approved" or "rejected".' })
    }
    const { rows } = await query(
      `UPDATE transfers SET status = $1, manager_approval = 1, manager_approved_by = $2, approved_at = NOW()
         WHERE id = $3 RETURNING *`,
      [action, req.user.id, id],
    )
    if (!rows.length) {
      return res.status(404).json({ error: 'Transfer not found.' })
    }

    if (action === 'approved') {
      const tr = rows[0]
      const paymentRef = `TRANSFER-${tr.id}-${Date.now().toString(36).toUpperCase()}`
      await query(
        `INSERT INTO payments (order_id, received_by, method, amount, reference, paid_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [null, null, 'pos', Number(tr.amount) || 0, paymentRef]
      )
      await logAudit({
        userId: req.user.id,
        actorName: req.user.full_name || req.user.email,
        action: `Processed approved transfer: ${Number(tr.amount) || 0} to ${tr.to_phone || 'N/A'} (ref: ${paymentRef})`,
        targetModule: 'Transfers',
        ipAddress: getClientIp(req),
        businessId: req.user?.businessId,
        metadata: { transferId: tr.id, amount: tr.amount, reference: paymentRef },
      })
    }

    await logAudit({
       userId: req.user.id,
       actorName: req.user.full_name || req.user.email,
       action: `${action === 'approved' ? 'Approved' : 'Rejected'} transfer ${id}`,
       targetModule: 'Transfers',
       ipAddress: getClientIp(req),
       businessId: req.user?.businessId,
    })

    res.json(rows[0])
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.get('/withdrawals/pending', ...managerOrOwner, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT w.*, u.full_name AS initiated_by_name
         FROM withdrawals w
         LEFT JOIN users u ON u.id = w.initiated_by
         WHERE w.status = 'pending' AND w.business_id = $1
         ORDER BY w.created_at DESC`,
      [req.user?.businessId]
    )

    await logAudit({
      userId: req.user.id,
      actorName: req.user.full_name || req.user.email,
      action: 'Viewed pending withdrawals',
      targetModule: 'Withdrawals',
      ipAddress: getClientIp(req),
      businessId: req.user?.businessId,
    })

    res.json(rows.map((w) => ({
      id: w.id,
      phoneNumber: w.phone_number,
      purpose: w.purpose,
      amount: Number(w.amount),
      initiatedBy: w.initiated_by_name,
      createdAt: w.created_at,
    })))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.post('/withdrawals/:id/approve', ...managerOrOwner, async (req, res) => {
  try {
    const { id } = req.params
    const { action } = req.body
    if (!['approved', 'rejected'].includes(action)) {
      return res.status(400).json({ error: 'Action must be "approved" or "rejected".' })
    }
    const status = action === 'approved' ? 'completed' : 'cancelled'
    const { rows } = await query(
      `UPDATE withdrawals SET status = $1, approved_by = $2, approved_at = NOW()
         WHERE id = $3 AND business_id = $4 RETURNING *`,
      [status, req.user.id, id, req.user?.businessId]
    )
    if (!rows.length) {
      return res.status(404).json({ error: 'Withdrawal not found.' })
    }

    if (action === 'approved') {
      const w = rows[0]
      const paymentRef = `WITHDRAWAL-${w.id}-${Date.now().toString(36).toUpperCase()}`
      await query(
        `INSERT INTO payments (order_id, received_by, method, amount, reference, paid_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [null, null, 'pos', Number(w.amount) || 0, paymentRef]
      )
      await logAudit({
        userId: req.user.id,
        actorName: req.user.full_name || req.user.email,
        action: `Processed approved withdrawal: ${Number(w.amount) || 0} to ${w.phone_number || 'N/A'} (${w.purpose}) (ref: ${paymentRef})`,
        targetModule: 'Withdrawals',
        ipAddress: getClientIp(req),
        businessId: req.user?.businessId,
        metadata: { withdrawalId: w.id, amount: w.amount, reference: paymentRef },
      })
    }

    await logAudit({
      userId: req.user.id,
      actorName: req.user.full_name || req.user.email,
      action: `${action === 'approved' ? 'Approved' : 'Rejected'} withdrawal ${id}`,
      targetModule: 'Withdrawals',
      ipAddress: getClientIp(req),
      businessId: req.user?.businessId,
    })

    res.json(rows[0])
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.get('/refunds/pending', ...managerOnly, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT r.*, o.id AS order_id, o.order_number
        FROM refunds r
        JOIN orders o ON o.id = r.order_id
        WHERE r.status = 'pending'
        ORDER BY r.created_at DESC`,
    )

await logAudit({
       userId: req.user.id,
       actorName: req.user.full_name || req.user.email,
       action: 'Viewed pending refunds',
       targetModule: 'Refunds',
       ipAddress: getClientIp(req),
       businessId: req.user?.businessId,
     })

    res.json(rows.map((r) => ({
      id: r.id,
      order: r.order_number || r.order_id,
      amount: r.amount,
      reason: r.reason || '',
    })))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.post('/refunds/:id/approve', ...managerOnly, async (req, res) => {
  try {
    const { id } = req.params
    const { action } = req.body
    if (!['approved', 'rejected'].includes(action)) {
      return res.status(400).json({ error: 'Action must be "approved" or "rejected".' })
    }
    const { rows } = await query(
      `UPDATE refunds SET status = $1, approved_by = $2, updated_at = NOW()
        WHERE id = $3 RETURNING *`,
      [action, req.user.id, id],
    )
    if (!rows.length) {
      return res.status(404).json({ error: 'Refund not found.' })
    }
await logAudit({
       userId: req.user.id,
       actorName: req.user.full_name || req.user.email,
       action: `${action === 'approved' ? 'Approved' : 'Rejected'} refund ${id}`,
       targetModule: 'Refunds',
       ipAddress: getClientIp(req),
       businessId: req.user?.businessId,
     })
    res.json(rows[0])
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.get('/payrolls/pending', ...managerOrOwner, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT s.*, u.full_name AS user_name
         FROM salary_payments s
         LEFT JOIN users u ON u.id = s.user_id
         WHERE s.status = 'pending'
         ORDER BY s.created_at DESC`,
    )

    await logAudit({
       userId: req.user.id,
       actorName: req.user.full_name || req.user.email,
       action: 'Viewed pending payrolls',
       targetModule: 'Payroll',
       ipAddress: getClientIp(req),
       businessId: req.user?.businessId,
    })

    res.json(rows.map((s) => ({
      id: s.id,
      name: s.user_name || s.name || 'Unknown',
      phone: s.phone || '',
      amount: s.amount,
      netAmount: Number(s.net_amount) || 0,
      method: s.method,
      grossAmount: Number(s.gross_amount) || 0,
      period: s.pay_period || '—',
    })))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.post('/payrolls/:id/approve', ...managerOrOwner, async (req, res) => {
  try {
    const { id } = req.params
    const { action } = req.body
    if (!['approved', 'rejected'].includes(action)) {
      return res.status(400).json({ error: 'Action must be "approved" or "rejected".' })
    }
    const { rows } = await query(
      `UPDATE salary_payments SET status = $1, approved_by = $2, approved_at = NOW()
         WHERE id = $3 RETURNING *`,
      [action, req.user.id, id],
    )
    if (!rows.length) {
      return res.status(404).json({ error: 'Payroll not found.' })
    }

    if (action === 'approved') {
      const sp = rows[0]
      const paymentRef = `SALARY-${sp.id}-${Date.now().toString(36).toUpperCase()}`
      await query(
        `INSERT INTO payments (order_id, received_by, method, amount, reference, paid_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [null, null, sp.method || 'mtn_momo', Number(sp.net_amount) || 0, paymentRef]
      )
      await logAudit({
        userId: req.user.id,
        actorName: req.user.full_name || req.user.email,
        action: `Processed approved salary payment for ${sp.name}: ${Number(sp.net_amount) || 0} sent (ref: ${paymentRef})`,
        targetModule: 'Payroll',
        ipAddress: getClientIp(req),
        businessId: req.user?.businessId,
        metadata: { salaryPaymentId: sp.id, amount: sp.net_amount, reference: paymentRef },
      })
    }

    await logAudit({
       userId: req.user.id,
       actorName: req.user.full_name || req.user.email,
       action: `${action === 'approved' ? 'Approved' : 'Rejected'} payroll ${id}`,
       targetModule: 'Payroll',
       ipAddress: getClientIp(req),
       businessId: req.user?.businessId,
    })

    res.json(rows[0])
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.get('/audit-logs', ...managerOnly, async (req, res) => {
  try {
    const { where, params } = buildAuditVisibilityClause({
      role: req.user?.role,
      businessId: req.user?.businessId,
      userId: req.user?.id,
      actorName: req.user?.full_name || req.user?.email,
    })

    const { rows } = await query(
      `SELECT al.id, al.actor_id AS user_id, al.actor_name AS actor, al.action,
              al.target_module AS targetModule, al.ip_address AS ipAddress, al.created_at,
              u.role AS userRole
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.actor_id
       ${where}
       ORDER BY al.created_at DESC`,
      params
    )
    res.json(rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      actor: r.actor,
      action: r.action,
      targetModule: r.targetModule,
      ipAddress: r.ipAddress,
      time: new Date(r.created_at).toLocaleString(),
      userRole: r.userRole || 'system',
    })))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Stock report
router.get('/reports/stock', ...managerOnly, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT ROW_NUMBER() OVER (ORDER BY name ASC) AS seq, name, category, selling_price, quantity, created_at
       FROM products
       WHERE business_id = $1
       ORDER BY name ASC`,
      [req.user.businessId]
    )
    res.json(rows.map(p => ({
      id: String(p.seq).padStart(2, '0'),
      name: p.name,
      category: p.category || '—',
      price: Number(p.selling_price || 0),
      quantity: Number(p.quantity || 0),
      createdAt: p.created_at,
    })))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Transfers approved report
router.get('/reports/transfers', ...managerOnly, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT t.id, t.amount, t.description, t.status, t.manager_approval, t.approved_at, t.created_at,
              u1.full_name AS from_name, u2.full_name AS to_name, u2.phone AS to_phone
       FROM transfers t
       LEFT JOIN users u1 ON u1.id = t.from_user
       LEFT JOIN users u2 ON u2.id = t.to_user
       WHERE t.business_id = $1
       ORDER BY t.created_at DESC`,
      [req.user.businessId]
    )
    res.json(rows.map(t => ({
      id: t.id,
      from: t.from_name || 'Unknown',
      to: t.to_name || t.to_phone || 'Unknown',
      amount: Number(t.amount || 0),
      description: t.description || '',
      status: t.status,
      managerApproval: t.manager_approval ? 'Approved' : 'Pending',
      approvedAt: t.approved_at,
      createdAt: t.created_at,
    })))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Payrolls approved report
router.get('/reports/payrolls', ...managerOrOwner, async (req, res) => {
  try {
    const businessId = req.user.businessId
    const { month } = req.query

    if (month && !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'Month must be in YYYY-MM format (e.g. 2026-08).' })
    }
    const selectedMonth = month || new Date().toISOString().slice(0, 7)

    const { rows: employees } = await query(
      `SELECT u.id, u.full_name, u.email, u.phone, u.role, u.salary, u.is_active, u.created_at
       FROM users u
       WHERE u.business_id = $1
       ORDER BY u.full_name ASC`,
      [businessId]
    )

    const { rows: payments } = await query(
      `SELECT s.id, s.user_id, s.name, s.phone, s.amount, s.gross_amount, s.net_amount,
              s.status, s.pay_period, s.pay_period_start, s.pay_period_end, s.paid_at,
              s.approved_at, s.created_at, u.full_name AS user_name
       FROM salary_payments s
       LEFT JOIN users u ON u.id = s.user_id
       WHERE s.business_id = $1
       ORDER BY s.created_at DESC`,
      [businessId]
    )

    const monthOf = (d) => {
      if (!d) return null
      const dt = new Date(d)
      if (Number.isNaN(dt.getTime())) return null
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
    }

    const monthsBetween = (startDate, endDate) => {
      const months = []
      const start = new Date(startDate)
      const end = new Date(endDate)
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return months
      start.setDate(1)
      start.setHours(0, 0, 0, 0)
      const endMonth = new Date(end.getFullYear(), end.getMonth(), 1)
      const cursor = new Date(start)
      while (cursor <= endMonth) {
        months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`)
        cursor.setMonth(cursor.getMonth() + 1)
      }
      return months
    }

    const PAID_STATUSES = new Set(['Paid', 'approved', 'completed'])

    const availMonths = new Set([selectedMonth])
    for (const p of payments) {
      for (const d of [p.pay_period_start, p.paid_at, p.approved_at, p.created_at]) {
        const m = monthOf(d)
        if (m) availMonths.add(m)
      }
      if (p.pay_period && p.pay_period.length >= 7) availMonths.add(p.pay_period.slice(0, 7))
    }
    const current = new Date()
    for (let i = 0; i < 6; i++) {
      const d = new Date(current.getFullYear(), current.getMonth() - i, 1)
      availMonths.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    const months = [...availMonths].filter(Boolean).sort()

    const rows = employees.map((u) => {
      const ups = payments.filter((p) => p.user_id === u.id || (p.user_id == null && p.name && p.name.toLowerCase() === (u.full_name || '').toLowerCase()))
      const paidMonthsSet = new Set(
        ups
          .filter((p) => PAID_STATUSES.has(p.status))
          .map((p) => monthOf(p.pay_period_start || p.paid_at || p.created_at))
          .filter(Boolean)
      )
      const paidMonths = [...paidMonthsSet].sort()
      const expectedMonths = monthsBetween(u.created_at || current, current)
      const unpaidMonths = expectedMonths.filter((m) => !paidMonthsSet.has(m) && m !== selectedMonth)
      const paidForMonth = paidMonthsSet.has(selectedMonth)
      const sel = ups.find((p) => PAID_STATUSES.has(p.status) && monthOf(p.pay_period_start || p.paid_at || p.created_at) === selectedMonth)

      return {
        id: u.id,
        employee: u.full_name || 'Unknown',
        email: u.email || '',
        phone: u.phone || '',
        role: u.role || '',
        salary: Number(u.salary) || 0,
        isActive: u.is_active !== false,
        amount: sel ? Number(sel.amount) || 0 : 0,
        grossAmount: sel ? Number(sel.gross_amount) || 0 : 0,
        netAmount: sel ? Number(sel.net_amount) || 0 : 0,
        period: sel ? (sel.pay_period || monthOf(sel.pay_period_start) || '—') : '—',
        status: paidForMonth ? 'Paid' : 'Not Paid',
        paidMonths,
        unpaidMonths,
        approvedAt: sel?.approved_at || null,
        createdAt: sel?.created_at || null,
      }
    })

    res.json({ employees: rows, months, month: selectedMonth })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Refunds approved report
router.get('/reports/refunds', ...managerOnly, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT r.id, r.amount, r.reason, r.status, r.approved_by, r.created_at,
              o.id AS order_id, o.order_number
       FROM refunds r
       JOIN orders o ON o.id = r.order_id
       WHERE r.business_id = $1
       ORDER BY r.created_at DESC`,
      [req.user.businessId]
    )
    res.json(rows.map(r => ({
      id: r.id,
      order: r.order_number || r.order_id,
      amount: Number(r.amount || 0),
      reason: r.reason || '',
      status: r.status,
      createdAt: r.created_at,
    })))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Revenue report
router.get('/reports/revenue', ...managerOnly, async (req, res) => {
  try {
    const { from, to } = req.query
    const clauses = ['o.business_id = $1', "o.status IN ('Paid', 'Served')"]
    const params = [req.user.businessId]
    let idx = 2
    if (from) { clauses.push(`o.created_at >= $${idx++}`); params.push(from) }
    if (to) { clauses.push(`o.created_at < $${idx++}`); params.push(to) }
    const where = clauses.join(' AND ')

    const { rows } = await query(
      `SELECT o.id, o.order_number, o.table_number, o.status, o.total_amount, o.source, o.created_at,
              (
                SELECT COALESCE(json_agg(json_build_object(
                  'name', p.name, 'quantity', oi.quantity, 'price', oi.unit_price, 'lineTotal', oi.line_total
                )), '[]')
                FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = o.id
              ) AS items
       FROM orders o
       WHERE ${where}
       ORDER BY o.created_at DESC`,
      params
    )
    const orders = rows.map(o => ({
      id: o.id,
      orderNumber: o.order_number,
      tableNumber: o.table_number,
      status: o.status,
      source: o.source,
      total: Number(o.total_amount || 0),
      items: o.items || [],
      createdAt: o.created_at,
    }))
    const totalRevenue = orders.reduce((s, o) => s + o.total, 0)
    const bySource = { qr: 0, waiter: 0, other: 0 }
    orders.forEach(o => { const src = o.source === 'qr' || o.source === 'waiter' ? o.source : 'other'; bySource[src] += o.total })
    res.json({ orders, totalRevenue, bySource, totalOrders: orders.length })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
