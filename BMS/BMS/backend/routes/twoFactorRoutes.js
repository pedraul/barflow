import { Router } from 'express'
import { query } from '../config/database.js'
import { sign } from '../config/jwt.js'
import { logAudit, getClientIp } from '../utils/audit.js'
import {
  getTwoFactorSettings,
  updateTwoFactorSettings,
  sendTwoFactorCode,
  verifyTwoFactorCode,
} from '../controllers/twoFactorController.js'
import authMiddleware from '../middleware/authMiddleware.js'
import roleMiddleware from '../middleware/roleMiddleware.js'

const router = Router()

const ownerOrManager = [authMiddleware, roleMiddleware('owner', 'manager')]

router.get('/settings', ...ownerOrManager, async (req, res) => {
  const businessId = req.query.businessId || req.user?.businessId
  req.query.businessId = businessId
  getTwoFactorSettings(req, res)
})

router.put('/settings', ...ownerOrManager, async (req, res) => {
  updateTwoFactorSettings(req, res)
})

router.post('/send-code', async (req, res) => {
  sendTwoFactorCode(req, res)
})

router.post('/verify', async (req, res) => {
  verifyTwoFactorCode(req, res)
})

export default router
