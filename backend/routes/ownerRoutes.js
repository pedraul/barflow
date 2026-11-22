import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { query } from '../config/database.js'
import { logAudit, getClientIp } from '../utils/audit.js'
import { deleteBusinessCompletely, describeStatus, ensureBusinessStatusSchema, loadBusinessStatus } from '../services/businessStatus.js'
import authMiddleware from '../middleware/authMiddleware.js'
import roleMiddleware from '../middleware/roleMiddleware.js'
import { permissionMiddleware } from '../middleware/permissionMiddleware.js'
import { requireGrant } from '../utils/staffPermissions.js'
import {
  ownerLogin,
  ownerLogout,
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  resetUserPassword,
  getSalaries,
  processPayout,
  getReportSummary,
  exportReport,
  getAuditLogs,
  exportAuditLogs,
  getSubscription,
  getAvailableSubscriptionPlans,
  getSubscriptionPaymentOptions,
  selectSubscriptionPlan,
  checkSubscriptionPayment,
  submitSubscriptionPaymentReference,
  cancelSubscriptionPayment,
  getReceipt,
  renewSubscription,
  getGlobalInventory,
  getStockMovements,
  getSystemSettings,
  updateSystemSettings,
  triggerBackup,
  getBackups,
  restoreBackup,
  updatePermissions,
  importRolePermissions,
  createWithdrawal,
  getWithdrawalLogs,
  createTransfer,
  approveTransfer,
  getTransferLogs,
  getRevenue,
  getRevenueLogs,
  getRevenueDetails,
  getQROrders,
  getWaiters,
  getWaiterOrders,
  getOrderHistory,
  getPaymentSettings,
  updatePaymentSettings,
  generateQRPayment,
  generateMerchantQRPayment,
} from '../controllers/ownerController.js'

const router = Router()

const ownerOnly = [authMiddleware, roleMiddleware('owner')]
const qrPaymentUsers = [authMiddleware, roleMiddleware('owner', 'waiter')]
const canManageUsers = [authMiddleware, permissionMiddleware('can_manage_users')]
const canWithdraw = [authMiddleware, permissionMiddleware('can_withdraw')]
const canTransfer = [authMiddleware, permissionMiddleware('can_transfer')]
const canViewRevenue = [authMiddleware, permissionMiddleware('can_view_revenue')]
const canManageSettings = [authMiddleware, permissionMiddleware('can_manage_settings')]
const canManageSystemSettings = [authMiddleware, async (req, res, next) => {
  if (req.user?.role?.toLowerCase() === 'owner') return next()
  return permissionMiddleware('can_manage_settings')(req, res, next)
}]
const canViewWithdrawLogs = [authMiddleware, permissionMiddleware('can_view_withdraw_logs')]
const canViewTransferLogs = [authMiddleware, permissionMiddleware('can_view_transfer_logs')]
const canApproveTransfers = [authMiddleware, permissionMiddleware('can_approve_transfers')]

// ──────────────────────────────────────────────
// 1. Authentication & Control
// ──────────────────────────────────────────────
router.post('/auth/login', ownerLogin)
router.post('/auth/logout', authMiddleware, ownerLogout)

// ──────────────────────────────────────────────
// 2. Staff Operations Management
// ──────────────────────────────────────────────
router.get('/users', ...ownerOnly, getUsers)
router.post('/users', ...ownerOnly, createUser)
router.put('/users/:id', ...ownerOnly, updateUser)
router.delete('/users/:id', ...ownerOnly, deleteUser)
router.put('/users/:id/reset-password', authMiddleware, requireGrant('reset_passwords'), resetUserPassword)

// ──────────────────────────────────────────────
// 3. Corporate Payroll & Compensation
// ──────────────────────────────────────────────
router.get('/salaries', ...ownerOnly, getSalaries)
router.post('/salaries/payout', ...ownerOnly, processPayout)

// ──────────────────────────────────────────────
// 4. Withdrawals (Owner Only - Create, View Logs)
// ──────────────────────────────────────────────
router.post('/withdraw', ...ownerOnly, createWithdrawal)
router.get('/withdraw/logs', ...ownerOnly, getWithdrawalLogs)

// ──────────────────────────────────────────────
// 5. Transfers (Owner + Accountant create, Manager approves)
// ──────────────────────────────────────────────
router.post('/transfer', ...ownerOnly, createTransfer)
router.put('/transfer/:id/approve', ...ownerOnly, approveTransfer)
router.get('/transfer/logs', ...ownerOnly, getTransferLogs)

// ──────────────────────────────────────────────
// 6. Revenue Tracking
// ──────────────────────────────────────────────
router.get('/revenue', ...ownerOnly, getRevenue)
router.get('/revenue/logs', ...ownerOnly, getRevenueLogs)
router.get('/revenue/details', ...ownerOnly, getRevenueDetails)

// ──────────────────────────────────────────────
// 7. System Metrics & Export Data
// ──────────────────────────────────────────────
router.get('/reports/summary', ...ownerOnly, getReportSummary)
router.get('/reports/export', ...ownerOnly, exportReport)

// ──────────────────────────────────────────────
// 8. Enterprise Accountability Logs
// ──────────────────────────────────────────────
router.get('/audit-logs', ...ownerOnly, getAuditLogs)
router.get('/audit-logs/export', ...ownerOnly, exportAuditLogs)

// ──────────────────────────────────────────────
// 9. SaaS Subscription & Billing (Enhanced)
// ──────────────────────────────────────────────
router.get('/subscription', ...ownerOnly, getSubscription)
router.get('/subscription/plans', ...ownerOnly, getAvailableSubscriptionPlans)
router.get('/subscription/payment-options', ...ownerOnly, getSubscriptionPaymentOptions)
router.get('/subscription/receipt', ...ownerOnly, getReceipt)
router.post('/subscription/select-plan', ...ownerOnly, selectSubscriptionPlan)
router.get('/subscription/payment/:paymentId/status', ...ownerOnly, checkSubscriptionPayment)
router.post('/subscription/payment/:paymentId/reference', ...ownerOnly, submitSubscriptionPaymentReference)
router.post('/subscription/payment/:paymentId/cancel', ...ownerOnly, cancelSubscriptionPayment)
router.post('/subscription/renew', ...ownerOnly, renewSubscription)

// ──────────────────────────────────────────────
// 10. Global Inventory (Owner view)
// ──────────────────────────────────────────────
router.get('/inventory', ...ownerOnly, getGlobalInventory)
router.get('/inventory/movements', ...ownerOnly, getStockMovements)

// ──────────────────────────────────────────────
// 12. Orders Oversight (QR + Waiter)
// ──────────────────────────────────────────────
router.get('/orders/qr', ...ownerOnly, getQROrders)
router.get('/waiters', ...ownerOnly, getWaiters)
router.get('/orders/waiter/:userId', ...ownerOnly, getWaiterOrders)
router.get('/orders/:id/history', ...ownerOnly, getOrderHistory)

// ──────────────────────────────────────────────
// 11. System Settings (Enhanced)
// ──────────────────────────────────────────────
router.get('/settings', ...canManageSystemSettings, getSystemSettings)
router.put('/settings', ...canManageSystemSettings, updateSystemSettings)
router.put('/settings/permissions', ...ownerOnly, updatePermissions)
router.post('/settings/permissions/import', ...ownerOnly, importRolePermissions)
router.post('/settings/backup', ...canManageSystemSettings, triggerBackup)
router.get('/settings/backups', ...canManageSystemSettings, getBackups)
router.post('/settings/restore-backup', ...canManageSystemSettings, restoreBackup)

// ──────────────────────────────────────────────
// 13. Payment Settings & QR Payments
// ──────────────────────────────────────────────
router.get('/payment-settings', ...ownerOnly, getPaymentSettings)
router.put('/payment-settings', ...ownerOnly, updatePaymentSettings)
router.get('/qr-payment/merchant', ...ownerOnly, generateMerchantQRPayment)
router.get('/qr-payment/:orderId', ...qrPaymentUsers, generateQRPayment)

// ──────────────────────────────────────────────
// Business account (owner): status, pause / reactivate, permanent deletion
// ──────────────────────────────────────────────
async function checkOwnerPassword(req, password) {
  if (!password) return false
  const { rows } = await query('SELECT password_hash FROM users WHERE id = $1 AND role = $2', [req.user.id, 'owner'])
  return rows[0]?.password_hash ? bcrypt.compare(String(password), rows[0].password_hash).catch(() => false) : false
}

async function ownerAudit(req, action) {
  await logAudit({
    userId: req.user?.id,
    actorName: req.user?.full_name || req.user?.email || 'Owner',
    action,
    targetModule: 'Business',
    ipAddress: getClientIp(req),
    businessId: req.user?.businessId,
  }).catch(() => {})
}

// GET /v1/owner/business/status
router.get('/business/status', ...ownerOnly, async (req, res) => {
  try {
    const business = await loadBusinessStatus(req.user.businessId)
    if (!business) return res.status(404).json({ error: 'Business not found.' })
    res.json({ id: business.id, name: business.name, isVerified: business.is_verified === true, ...describeStatus(business) })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// POST /v1/owner/business/deactivate  { password, reason? } — pause: staff can no longer sign in.
router.post('/business/deactivate', ...ownerOnly, async (req, res) => {
  try {
    if (!(await checkOwnerPassword(req, req.body?.password))) return res.status(400).json({ error: 'Your password is not correct.' })
    await ensureBusinessStatusSchema()
    const reason = String(req.body?.reason || '').trim().slice(0, 500) || 'Paused by the owner'
    const { rows } = await query(
      `UPDATE businesses SET is_deactivated = TRUE, deactivated_by = 'owner', status_reason = $2, status_changed_at = NOW()
       WHERE id = $1 AND COALESCE(is_deactivated, FALSE) = FALSE AND COALESCE(is_suspended, FALSE) = FALSE
       RETURNING id, name`,
      [req.user.businessId, reason]
    )
    if (!rows.length) return res.status(409).json({ error: 'The business is already paused, deactivated or suspended.' })
    await ownerAudit(req, `Paused the business: ${reason}`)
    res.json({ paused: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// POST /v1/owner/business/reactivate — only undoes the owner's own pause.
router.post('/business/reactivate', ...ownerOnly, async (req, res) => {
  try {
    await ensureBusinessStatusSchema()
    const { rows } = await query(
      `UPDATE businesses SET is_deactivated = FALSE, deactivated_by = NULL, status_reason = NULL, status_changed_at = NOW()
       WHERE id = $1 AND is_deactivated = TRUE AND deactivated_by = 'owner'
       RETURNING id, name`,
      [req.user.businessId]
    )
    if (!rows.length) return res.status(409).json({ error: 'Only a business you paused yourself can be reactivated here.' })
    await ownerAudit(req, 'Reactivated the business')
    res.json({ reactivated: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// POST /v1/owner/business/delete  { password, confirmName } — permanent: removes the business and all its data.
router.post('/business/delete', ...ownerOnly, async (req, res) => {
  try {
    const business = await loadBusinessStatus(req.user.businessId)
    if (!business) return res.status(404).json({ error: 'Business not found.' })
    if (String(req.body?.confirmName || '').trim() !== String(business.name || '').trim()) {
      return res.status(400).json({ error: 'Type the business name exactly as shown to confirm.' })
    }
    if (!(await checkOwnerPassword(req, req.body?.password))) return res.status(400).json({ error: 'Your password is not correct.' })
    const deleted = await deleteBusinessCompletely(business.id)
    if (!deleted) return res.status(404).json({ error: 'Business not found.' })
    // The business's own audit log is gone with it; keep a platform-level record.
    await logAudit({
      actorName: req.user?.full_name || req.user?.email || 'Owner',
      action: `Owner deleted business "${deleted.name}" (${deleted.id})`,
      targetModule: 'Platform',
      ipAddress: getClientIp(req),
    }).catch(() => {})
    res.json({ deleted: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
