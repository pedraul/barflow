import { Router } from 'express'
import { query } from '../config/database.js'
import { logAudit, getClientIp } from '../utils/audit.js'
import authMiddleware from '../middleware/authMiddleware.js'

const router = Router()

router.get('/', async (_req, res) => {
  try {
    const { rows } = await query('SELECT status, plan FROM subscriptions ORDER BY created_at DESC LIMIT 1')
    res.json(rows[0] || { status: 'active', plan: 'Pro' })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.patch('/', authMiddleware, async (req, res) => {
  const { status } = req.body
  if (!status) return res.status(400).json({ error: 'Status is required.' })
  try {
    await query(
      `UPDATE subscriptions SET status = $1, cancelled_at = CASE WHEN $1 = 'inactive' THEN NOW() ELSE NULL END
       WHERE id = (SELECT id FROM subscriptions ORDER BY created_at DESC LIMIT 1)`,
      [status]
    )

    await logAudit({
      userId: req.user?.id,
      actorName: req.user?.full_name || req.user?.email || 'System',
      action: `Updated subscription status to ${status}`,
      targetModule: 'Subscription',
      ipAddress: getClientIp(req),
      businessId: req.user?.businessId,
    })

    res.json({ status })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
