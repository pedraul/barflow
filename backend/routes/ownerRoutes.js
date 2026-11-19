import { Router } from 'express'
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
  selectSubscriptionPlan,
  checkSubscriptionPayment,
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
router.get('/subscription/receipt', ...ownerOnly, getReceipt)
router.post('/subscription/select-plan', ...ownerOnly, selectSubscriptionPlan)
router.get('/subscription/payment/:paymentId/status', ...ownerOnly, checkSubscriptionPayment)
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

export default router
