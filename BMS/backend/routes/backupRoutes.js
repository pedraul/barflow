import { Router } from 'express'
import { query } from '../config/database.js'
import { logAudit, getClientIp } from '../utils/audit.js'
import authMiddleware from '../middleware/authMiddleware.js'

const router = Router()

router.post('/', authMiddleware, async (req, res) => {
  try {
    await logAudit({
      userId: req.user?.id,
      actorName: req.user?.full_name || req.user?.email || 'System',
      action: 'Triggered system backup',
      targetModule: 'System Settings',
      ipAddress: getClientIp(req),
      businessId: req.user?.businessId,
    })

    res.json({ message: 'Backup triggered (handled by database tooling).' })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
