import { Router } from 'express'
import authMiddleware from '../middleware/authMiddleware.js'
import {
  platformLogin,
  verifyPlatform2FA,
  listBusinesses,
  getBusiness,
  toggleBusinessStatus,
  setUnpaidBusinessAccess,
  updateBusiness,
  deleteBusiness,
  listPlans,
  createPlan,
  updatePlan,
  platformStats,
  listSubscriptions,
  subscriptionSummary,
  updateSubscriptionAdmin,
  listPayments,
  paymentStats,
  refundPayment,
  settlePayment,
  listAdmins,
  createAdmin,
  updateAdmin,
  resetAdminPassword,
  deleteAdmin,
  reportsOverview,
  getSettings,
  updateSettings,
  listBackups,
  createBackup,
  restoreBackup,
  deleteBackup,
  listEmailNotifications,
} from '../controllers/platformController.js'

const router = Router()

// Subscription plans (public read for business registration)
router.get('/plans', listPlans)

// Platform admin auth
router.post('/login', platformLogin)
router.post('/verify-2fa', (req, res, next) => {
  // No auth middleware needed for 2FA verification during login
  verifyPlatform2FA(req, res).catch(next)
})

// All routes below require auth + super_admin role
router.use(authMiddleware)
router.use((req, res, next) => {
  if (!req.user?.isPlatformAdmin) {
    return res.status(403).json({ error: 'Platform admin access required.' })
  }
  next()
})

// Dashboard
router.get('/stats', platformStats)

// Business management
router.get('/businesses', listBusinesses)
router.get('/businesses/:id', getBusiness)
router.patch('/businesses/:id/status', toggleBusinessStatus)
router.patch('/businesses/:id/access', setUnpaidBusinessAccess)
router.put('/businesses/:id', updateBusiness)
router.delete('/businesses/:id', deleteBusiness)

// Subscription plans (admin mutation only; read is public above)
router.post('/plans', createPlan)
router.put('/plans/:id', updatePlan)

// Subscriptions (platform-wide)
router.get('/subscriptions', listSubscriptions)
router.get('/subscriptions/summary', subscriptionSummary)
router.patch('/subscriptions/:id', updateSubscriptionAdmin)

// Payments + refunds
router.get('/payments', listPayments)
router.get('/payments/stats', paymentStats)
router.post('/payments/:id/refund', refundPayment)
router.post('/payments/:id/settle', settlePayment)

// Platform admins (Users)
router.get('/admins', listAdmins)
router.post('/admins', createAdmin)
router.put('/admins/:id', updateAdmin)
router.post('/admins/:id/reset-password', resetAdminPassword)
router.delete('/admins/:id', deleteAdmin)

// Reports
router.get('/reports', reportsOverview)

// Settings
router.get('/settings', getSettings)
router.put('/settings', updateSettings)

// Backups
router.get('/backups', listBackups)
router.post('/backups', createBackup)
router.post('/backups/:id/restore', restoreBackup)
router.delete('/backups/:id', deleteBackup)

// Email notifications
router.get('/email-notifications', listEmailNotifications)

export default router
