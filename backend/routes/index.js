import { Router } from 'express'
import { query } from '../config/database.js'
import authMiddleware from '../middleware/authMiddleware.js'
import { serializeAuditLogs, buildAuditVisibilityClause } from '../utils/audit.js'

import authRoutes from './authRoutes.js'
import userRoutes from './userRoutes.js'
import orderRoutes from './orderRoutes.js'
import salaryRoutes from './salaryRoutes.js'
import subscriptionRoutes from './subscriptionRoutes.js'
import paymentRoutes from './paymentRoutes.js'
import inventoryRoutes from './inventoryRoutes.js'
import productRoutes from './productRoutes.js'
import reportRoutes from './reportRoutes.js'
import backupRoutes from './backupRoutes.js'
import ownerRoutes from './ownerRoutes.js'
import customerRoutes from './customerRoutes.js'
import operatorRoutes from './operatorRoutes.js'
import receiptSettingsRoutes from './receiptSettingsRoutes.js'
import kitchenBarRoutes from './kitchenBarRoutes.js'
import managerRoutes from './managerRoutes.js'
import platformRoutes from './platformRoutes.js'
import accountantRoutes from './accountantRoutes.js'
import branchRoutes from './branchRoutes.js'
import shiftRoutes from './shiftRoutes.js'
import staffPermissionRoutes from './staffPermissionRoutes.js'
import { seed } from '../seeders/seed.js'

const router = Router()

router.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

// Debug route: quick DB connectivity and table check (dev only)
router.get('/_debug/db', async (_req, res) => {
  try {
    const { rows: one } = await query('SELECT 1 AS ok')
    const { rows: notif } = await query("SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE table_name = 'notifications'")
    res.json({ ok: one[0]?.ok === 1, notifications_table_exists: Number(notif[0]?.cnt) > 0 })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.post('/reset', async (_req, res) => {
  try {
    await query('TRUNCATE TABLE businesses RESTART IDENTITY CASCADE')
    await query('DELETE FROM platform_admins')
    await seed()
    res.json({ status: 'ok', message: 'Database reset and seeded.' })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.get('/dashboard/:role', (req, res) => {
  const { role } = req.params
  res.json({ role, message: `Dashboard data for ${role}` })
})

router.get('/audit-logs/me', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id
    const { rows } = await query(
      `SELECT id, actor_id AS user_id, actor_name AS actor, action,
              target_module AS targetModule, ip_address AS ipAddress, created_at
       FROM audit_logs
       WHERE actor_id = $1 OR actor_name = $2
       ORDER BY created_at DESC`,
      [userId, req.user.full_name || req.user.email]
    )
    res.json(
      rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        actor: r.actor,
        action: r.action,
        targetModule: r.targetModule,
        ipAddress: r.ipAddress,
        time: new Date(r.created_at).toLocaleString(),
      }))
    )
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.get('/audit-logs', authMiddleware, async (req, res) => {
  try {
    const { where, params } = buildAuditVisibilityClause({
      role: req.user?.role,
      businessId: req.user?.businessId,
      userId: req.user?.id,
      actorName: req.user?.full_name || req.user?.email,
    })

    const { rows } = await query(
      `SELECT id,
              actor_id AS user_id,
              actor_name AS actor,
              action,
              target_module AS targetModule,
              ip_address AS ipAddress,
              created_at
       FROM audit_logs al ${where} ORDER BY created_at DESC`,
      params
    )
    res.json(
      rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        actor: r.actor,
        action: r.action,
        targetModule: r.targetModule,
        ipAddress: r.ipAddress,
        time: new Date(r.created_at).toLocaleString(),
      }))
    )
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.get('/audit-logs/export', authMiddleware, async (req, res) => {
  try {
    const { format = 'csv' } = req.query
    const { where, params } = buildAuditVisibilityClause({
      role: req.user?.role,
      businessId: req.user?.businessId,
      userId: req.user?.id,
      actorName: req.user?.full_name || req.user?.email,
    })

    const { rows } = await query(
      `SELECT actor_id AS user_id,
              actor_name AS actor,
              action,
              target_module AS targetModule,
              ip_address AS ipAddress,
              created_at,
              business_id,
              metadata
       FROM audit_logs al ${where} ORDER BY created_at DESC`,
      params
    )

    const normalizedFormat = String(format || 'csv').toLowerCase()
    const payload = serializeAuditLogs(rows, normalizedFormat)
    const isExcel = normalizedFormat === 'xls' || normalizedFormat === 'xlsx'
    const isJson = normalizedFormat === 'json'
    const contentType = isJson ? 'application/json' : (isExcel ? 'application/vnd.ms-excel' : 'text/csv')
    const extension = isJson ? 'json' : (isExcel ? 'xls' : 'csv')

    res.setHeader('Content-Type', contentType)
    res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${new Date().toISOString().slice(0, 10)}.${extension}"`)
    res.send(payload)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.post('/audit-logs', async (req, res) => {
  const { actor, action, type = 'activity' } = req.body
  if (!action) return res.status(400).json({ error: 'Action is required.' })
  try {
    const { rows } = await query(
      `INSERT INTO audit_logs (business_id, actor_name, action, entity_type)
       VALUES ((SELECT id FROM businesses LIMIT 1), $1, $2, $3) RETURNING id`,
      [actor, action, type]
    )
    res.status(201).json({ id: rows[0].id })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.use('/auth', authRoutes)
router.use('/users', userRoutes)
router.use('/branches', branchRoutes)
router.use('/orders', orderRoutes)
router.use('/salary-payments', salaryRoutes)
router.use('/subscription', subscriptionRoutes)
router.use('/payments', paymentRoutes)
router.use('/inventory', inventoryRoutes)
router.use('/products', productRoutes)
router.use('/reports', reportRoutes)
router.use('/backup', backupRoutes)
router.use('/shifts', shiftRoutes)
router.use('/staff-permissions', staffPermissionRoutes)

// Mount Owner-specific routes under /api/v1/owner
router.use('/v1/owner', ownerRoutes)

// QR Self-Ordering System Routes
router.use('/customer', customerRoutes)
router.use('/operator', operatorRoutes)
router.use('/operator', receiptSettingsRoutes)
router.use('/kitchen', kitchenBarRoutes)
router.use('/bar', kitchenBarRoutes)

// Manager approval routes
router.use('/manager', managerRoutes)

// Accountant routes
router.use('/accountant', accountantRoutes)

// SaaS Platform routes (super admin)
router.use('/platform', platformRoutes)

export default router
