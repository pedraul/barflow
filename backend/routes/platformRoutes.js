import { Router } from 'express'
import authMiddleware, { requirePlatformPermission as can, requireSuperAdmin } from '../middleware/authMiddleware.js'
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
  deletePlan,
  platformStats,
  listSubscriptions,
  subscriptionSummary,
  updateSubscriptionAdmin,
  listPayments,
  paymentStats,
  refundPayment,
  settlePayment,
  confirmPayment,
  rejectPayment,
  listAdmins,
  createAdmin,
  updateAdmin,
  resetAdminPassword,
  deleteAdmin,
  reportsOverview,
  getSettings,
  updateSettings,
  sendTestEmail,
  listBackups,
  createBackup,
  restoreBackup,
  deleteBackup,
  listEmailNotifications,
  platformMe,
  platformHealth,
  listPlatformActivity,
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

// All routes below require a signed-in, active platform admin.
// Each module is gated by the admin's permissions (super_admin has every module).
router.use(authMiddleware)
router.use((req, res, next) => {
  if (!req.user?.isPlatformAdmin) {
    return res.status(403).json({ error: 'Platform admin access required.' })
  }
  next()
})

// The signed-in admin (fresh role + permissions) and system health: every admin
router.get('/me', platformMe)
router.get('/health', platformHealth)

// Dashboard: any admin; figures are platform-wide summaries
router.get('/stats', platformStats)

// Business management
router.get('/businesses', can('businesses', 'subscriptions', 'payments'), listBusinesses)
router.get('/businesses/:id', can('businesses'), getBusiness)
router.patch('/businesses/:id/status', can('businesses'), toggleBusinessStatus)
router.patch('/businesses/:id/access', can('businesses', 'subscriptions'), setUnpaidBusinessAccess)
router.put('/businesses/:id', can('businesses'), updateBusiness)
router.delete('/businesses/:id', requireSuperAdmin, deleteBusiness)

// Subscription plans (admin mutation only; read is public above)
router.post('/plans', can('subscriptions'), createPlan)
router.put('/plans/:id', can('subscriptions'), updatePlan)
router.delete('/plans/:id', can('subscriptions'), deletePlan)

// Subscriptions (platform-wide)
router.get('/subscriptions', can('subscriptions'), listSubscriptions)
router.get('/subscriptions/summary', can('subscriptions', 'reports'), subscriptionSummary)
router.patch('/subscriptions/:id', can('subscriptions'), updateSubscriptionAdmin)

// Payments + refunds
router.get('/payments', can('payments'), listPayments)
router.get('/payments/stats', can('payments'), paymentStats)
router.post('/payments/:id/refund', can('payments'), refundPayment)
router.post('/payments/:id/settle', can('payments'), settlePayment)
router.post('/payments/:id/confirm', can('payments'), confirmPayment)
router.post('/payments/:id/reject', can('payments'), rejectPayment)

// Platform admins (Users)
router.get('/admins', can('users'), listAdmins)
router.post('/admins', can('users'), createAdmin)
router.put('/admins/:id', can('users'), updateAdmin)
router.post('/admins/:id/reset-password', can('users'), resetAdminPassword)
router.delete('/admins/:id', can('users'), deleteAdmin)

// Reports + activity
router.get('/reports', can('reports'), reportsOverview)
router.get('/activity', can('reports', 'users'), listPlatformActivity)
router.get('/email-notifications', can('reports', 'settings'), listEmailNotifications)

// Settings
router.get('/settings', can('settings', 'backup'), getSettings)
router.put('/settings', can('settings', 'backup'), updateSettings)
router.post('/settings/test-email', can('settings'), sendTestEmail)

// Backups (restore replaces the whole database: super admin only)
router.get('/backups', can('backup'), listBackups)
router.post('/backups', can('backup'), createBackup)
router.post('/backups/:id/restore', requireSuperAdmin, restoreBackup)
router.delete('/backups/:id', can('backup'), deleteBackup)

export default router
