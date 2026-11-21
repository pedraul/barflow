import api from './axios'

// ===== AUTH =====
export async function login(username, password) {
  const { data } = await api.post('/auth/login', { username, password })
  return data
}

export async function forgotPassword(email) {
  const { data } = await api.post('/auth/forgot-password', { email })
  return data
}

export async function resetPassword(token, password) {
  const { data } = await api.post('/auth/reset-password', { token, password })
  return data
}

// ===== TWO-FACTOR AUTH =====
export async function getTwoFactorSettings(businessId) {
  const { data } = await api.get('/auth/2fa/settings', { params: { businessId } })
  return data
}

export async function updateTwoFactorSettings(payload) {
  const { data } = await api.put('/auth/2fa/settings', payload)
  return data
}

export async function sendTwoFactorCode(email, userId, method) {
  const { data } = await api.post('/auth/2fa/send-code', { email, userId, method })
  return data
}

export async function verifyTwoFactorCode(userId, code) {
  const { data } = await api.post('/auth/2fa/verify', { userId, code })
  return data
}

// ===== ACCOUNT / SECURITY =====
export async function logoutUser() {
  const { data } = await api.post('/auth/logout')
  return data
}

export async function changePassword(currentPassword, newPassword) {
  const { data } = await api.put('/auth/change-password', { currentPassword, newPassword })
  return data
}

export async function updateAvatar(avatarUrl) {
  const { data } = await api.put('/auth/profile/avatar', { avatarUrl })
  return data
}

// ===== USERS =====
export async function fetchUsers() {
  const { data } = await api.get('/users')
  return data
}

export async function fetchMySalaryStatus() {
  const { data } = await api.get('/users/me/salary-status')
  return data
}

export async function createUser(payload) {
  const { data } = await api.post('/users', payload)
  return data
}

export async function updateUser(id, changes) {
  const { data } = await api.patch(`/users/${id}`, changes)
  return data
}

export async function deleteUser(id) {
  const { data } = await api.delete(`/users/${id}`)
  return data
}

// ===== ORDERS =====
export async function fetchOrders(params = {}) {
  const qs = new URLSearchParams(params).toString()
  try {
    const { data } = await api.get(`/orders${qs ? `?${qs}` : ''}`)
    return data
  } catch (error) {
    const message = error.response?.data?.error || error.response?.data?.message
    if (message) throw new Error(message)
    throw error
  }
}

export async function fetchOrderById(id) {
  const { data } = await api.get(`/orders/${id}`)
  return data
}

export async function createOrder(payload) {
  const { data } = await api.post('/orders', payload)
  return data
}

// Waiter flow: create an order with source 'waiter' directly through the
// authenticated /api/orders endpoint (no QR / customer session required).
export async function createWaiterOrder(payload) {
  const { data } = await api.post('/orders', {
    source: 'waiter',
    status: 'Open',
    ...payload,
  })
  return data
}

export async function fetchWaiterOrderHistory({ period = 'all', from, to } = {}) {
  const params = new URLSearchParams()
  if (period) params.set('period', period)
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  const { data } = await api.get(`/orders/waiter/history?${params.toString()}`)
  return data
}

export async function updateOrderStatus(id, status) {
  const { data } = await api.patch(`/orders/${id}`, { status })
  return data
}

export async function deleteOrder(id) {
  const { data } = await api.delete(`/orders/${id}`)
  return data
}

export async function restockOrderItem(orderId, payload) {
  const { data } = await api.patch(`/orders/${orderId}/restock`, payload)
  return data
}

export async function addItemsToExistingOrder(orderId, payload) {
  const { data } = await api.post(`/orders/${orderId}/add-items`, payload)
  return data
}

export async function addItemsToCustomerOrder(orderId, payload) {
  const { data } = await api.post(`/customer/orders/${orderId}/add-items`, payload)
  return data
}

// ===== SALARY =====
export async function fetchSalaryPayments() {
  const { data } = await api.get('/salary-payments')
  return data
}

export async function createSalaryPayment(payload) {
  const { data } = await api.post('/salary-payments', payload)
  return data
}

export async function createOutgoingPayment(payload) {
  const { data } = await api.post('/payments', payload)
  return data
}

// ===== ACCOUNTANT =====
export async function fetchAccountantSummary() {
  const { data } = await api.get('/accountant/summary')
  return data
}

export async function fetchTransfers() {
  const { data } = await api.get('/accountant/transfers')
  return data
}

export async function createTransfer(payload) {
  const { data } = await api.post('/accountant/transfers', payload)
  return data
}

export async function fetchRefunds() {
  const { data } = await api.get('/accountant/refunds')
  return data
}

export async function fetchReconciliations() {
  const { data } = await api.get('/accountant/reconciliations')
  return data
}

export async function createReconciliation(payload) {
  const { data } = await api.post('/accountant/reconciliations', payload)
  return data
}

export async function fetchReconciliationTransactions(params = {}) {
  const { data } = await api.get('/accountant/reconciliation-transactions', { params })
  return data
}

export async function uploadBankStatement(payload) {
  const { data } = await api.post('/accountant/bank-statements/upload', payload)
  return data
}

export async function createAdjustment(payload) {
  const { data } = await api.post('/accountant/adjustments', payload)
  return data
}

export async function fetchAccountantExpenses() {
  const { data } = await api.get('/accountant/expenses')
  return data
}

export async function fetchAccountantPayments() {
  const { data } = await api.get('/accountant/payments')
  return data
}

export async function fetchAccountantSales(params = {}) {
  const qs = new URLSearchParams(params).toString()
  const { data } = await api.get(`/accountant/sales${qs ? `?${qs}` : ''}`)
  return data
}

export async function fetchAccountantPurchases() {
  const { data } = await api.get('/accountant/purchases')
  return data
}

export async function fetchAccountantTaxes() {
  const { data } = await api.get('/accountant/taxes')
  return data
}

export async function fetchChartOfAccounts() {
  const { data } = await api.get('/accountant/chart-of-accounts')
  return data
}

export async function fetchAccountantReports() {
  const { data } = await api.get('/accountant/reports')
  return data
}

export async function generateReport(payload) {
  const { data } = await api.post('/accountant/reports', payload)
  return data
}

export async function fetchReportById(id) {
  const { data } = await api.get(`/accountant/reports/${id}`)
  return data
}

// ===== AUDIT LOGS =====
export async function fetchAuditLogs() {
  const { data } = await api.get('/audit-logs')
  return data
}

export async function fetchMyAuditLogs() {
  const { data } = await api.get('/audit-logs/me')
  return data
}

export async function fetchManagerAuditLogs() {
  const { data } = await api.get('/manager/audit-logs')
  return data
}

export async function createAuditLog(payload) {
  const { data } = await api.post('/audit-logs', payload)
  return data
}

export async function exportAuditLogs(format = 'csv') {
  const res = await api.get(`/audit-logs/export?format=${format}`, { responseType: 'blob' })
  return res.data
}

// ===== SUBSCRIPTION =====
export async function fetchSubscription() {
  const { data } = await api.get('/subscription')
  return data
}

export async function updateSubscription(status) {
  const { data } = await api.patch('/subscription', { status })
  return data
}

// ===== QR CUSTOMER (Public) =====
export async function fetchMenu(tableNumber, businessId, branchId) {
  const params = new URLSearchParams()
  params.set('table', tableNumber)
  if (businessId) params.set('businessId', businessId)
  if (branchId) params.set('branchId', branchId)
  const { data } = await api.get(`/customer/menu?${params.toString()}`)
  return data
}

export async function placeCustomerOrder(payload) {
  try {
    const { data } = await api.post('/customer/order', payload)
    return data
  } catch (error) {
    const message = error.response?.data?.error || error.response?.data?.message
    if (message) throw new Error(message)
    throw error
  }
}

export async function checkOrderStatus(orderId) {
  const { data } = await api.get(`/customer/order/${orderId}/status`)
  return data
}

export async function initiatePayment(payload) {
  const { data } = await api.post('/customer/payment/initiate', payload)
  return data
}

export async function verifyPayment(paymentId) {
  const { data } = await api.get(`/customer/payment/${paymentId}/status`)
  return data
}

export async function confirmCashPayment(paymentId) {
  const { data } = await api.post(`/payments/cash/${paymentId}/confirm`)
  return data
}

export async function fetchReceipt(orderId) {
  const { data } = await api.get(`/customer/receipt/${orderId}`)
  return data
}

export async function fetchOrdersByTable(tableNumber, businessId, branchId) {
  const params = new URLSearchParams({ table: tableNumber })
  if (businessId) params.set('businessId', businessId)
  if (branchId) params.set('branchId', branchId)
  const { data } = await api.get(`/customer/orders/table?${params.toString()}`)
  return data
}

// ===== OPERATOR =====
export async function fetchOperatorOrders() {
  const { data } = await api.get('/operator/orders')
  return data
}

export async function fetchActiveOrders() {
  const { data } = await api.get('/operator/orders/active')
  return data
}

export async function routeOrder(id, destination) {
  console.log('[API] routeOrder called:', id, destination)
  const { data } = await api.patch(`/operator/orders/${id}/route`, { destination })
  console.log('[API] routeOrder response:', data)
  return data
}

export async function updateOperatorOrderStatus(id, status) {
  const { data } = await api.patch(`/operator/orders/${id}/status`, { status })
  return data
}

export async function fetchQRCodes(branchId) {
  const params = new URLSearchParams()
  if (branchId && branchId !== 'all') params.set('branchId', branchId)
  const query = params.toString()
  const { data } = await api.get(`/operator/qr-codes${query ? `?${query}` : ''}`)
  return data
}

export async function fetchManagedTables(branchId) {
  const params = new URLSearchParams()
  if (branchId && branchId !== 'all') params.set('branchId', branchId)
  const query = params.toString()
  const { data } = await api.get(`/manager/tables${query ? `?${query}` : ''}`)
  return data
}

// Tables in the signed-in staff member's branch (any role).
export async function fetchBranchTables() {
  const { data } = await api.get('/orders/tables')
  return data
}

export async function createManagedTable(tableNumber, branchId) {
  const { data } = await api.post('/manager/tables', { tableNumber, branchId })
  return data
}

export async function fetchOperatorRoutedReport() {
  const { data } = await api.get('/operator/routed-report')
  return data
}

export async function fetchOperatorDashboard() {
  const { data } = await api.get('/operator/dashboard')
  return data
}

export async function fetchReadyOrders() {
  const { data } = await api.get('/operator/orders/ready')
  return data
}

export async function fetchReceiptSettings() {
  const { data } = await api.get('/operator/receipt-settings')
  return data
}

export async function saveReceiptSettings(settings) {
  const { data } = await api.put('/operator/receipt-settings', { settings })
  return data
}

export async function markOrderAsPaid(id, method) {
  const { data } = await api.post(`/operator/orders/${id}/mark-paid`, { method })
  return data
}

// ===== KITCHEN =====
export async function fetchKitchenOrders(branchId) {
  const { data } = await api.get('/kitchen/orders', branchId ? { params: { branchId } } : undefined)
  return data
}

export async function startPreparing(id, branchId) {
  const { data } = await api.patch(`/kitchen/orders/${id}/start`, {}, branchId ? { params: { branchId } } : undefined)
  return data
}

export async function markAsReady(id, branchId) {
  const { data } = await api.patch(`/kitchen/orders/${id}/ready`, {}, branchId ? { params: { branchId } } : undefined)
  return data
}

export async function fetchCompletedOrders() {
  const { data } = await api.get('/kitchen/completed')
  return data
}

// ===== BAR =====
export async function fetchBarOrders(branchId) {
  const { data } = await api.get('/bar/bar-orders', branchId ? { params: { branchId } } : undefined)
  return data
}

// ===== MANAGER: PRODUCTS / MENU =====
export async function fetchProducts() {
  const { data } = await api.get('/products')
  return data
}
export async function createProduct(payload) {
  const { data } = await api.post('/products', payload)
  return data
}
export async function updateProduct(id, changes) {
  const { data } = await api.patch(`/products/${id}`, changes)
  return data
}
export async function deleteProduct(id) {
  const { data } = await api.delete(`/products/${id}`)
  return data
}

// ===== MANAGER: APPROVALS =====
export async function fetchPendingTransfers() {
  const { data } = await api.get('/manager/transfers/pending')
  return data
}
export async function approveTransfer(id) {
  const { data } = await api.post(`/manager/transfers/${id}/approve`, { action: 'approved' })
  return data
}
export async function rejectTransfer(id) {
  const { data } = await api.post(`/manager/transfers/${id}/approve`, { action: 'rejected' })
  return data
}
export async function checkTransferPayoutStatus(id) {
  const { data } = await api.post(`/manager/transfers/${id}/status`)
  return data
}
export async function fetchPendingRefunds() {
  const { data } = await api.get('/manager/refunds/pending')
  return data
}
export async function approveRefund(id) {
  const { data } = await api.post(`/manager/refunds/${id}/approve`, { action: 'approved' })
  return data
}
export async function rejectRefund(id) {
  const { data } = await api.post(`/manager/refunds/${id}/approve`, { action: 'rejected' })
  return data
}
export async function createManagerRefund(payload) {
  const { data } = await api.post('/manager/refunds', payload)
  return data
}
export async function fetchManagerRefunds() {
  const { data } = await api.get('/manager/refunds')
  return data
}
export async function fetchPendingPayrolls() {
  const { data } = await api.get('/manager/payrolls/pending')
  return data
}
export async function approvePayroll(id) {
  const { data } = await api.post(`/manager/payrolls/${id}/approve`, { action: 'approved' })
  return data
}
export async function checkPayrollPayoutStatus(id) {
  const { data } = await api.post(`/manager/payrolls/${id}/status`)
  return data
}
export async function rejectPayroll(id) {
  const { data } = await api.post(`/manager/payrolls/${id}/approve`, { action: 'rejected' })
  return data
}

// ===== MANAGER: WITHDRAWALS =====
export async function fetchPendingWithdrawals() {
  const { data } = await api.get('/manager/withdrawals/pending')
  return data
}

export async function approveWithdrawal(id) {
  const { data } = await api.post(`/manager/withdrawals/${id}/approve`, { action: 'approved' })
  return data
}

export async function rejectWithdrawal(id) {
  const { data } = await api.post(`/manager/withdrawals/${id}/approve`, { action: 'rejected' })
  return data
}
export async function checkWithdrawalPayoutStatus(id) {
  const { data } = await api.post(`/manager/withdrawals/${id}/status`)
  return data
}

// ===== MANAGER: REPORTS =====
export async function fetchManagerStockReport() {
  const { data } = await api.get('/manager/reports/stock')
  return data
}
export async function fetchManagerTransferReport() {
  const { data } = await api.get('/manager/reports/transfers')
  return data
}
export async function fetchManagerPayrollReport(params = {}) {
  const qs = new URLSearchParams(params).toString()
  const { data } = await api.get(`/manager/reports/payrolls${qs ? `?${qs}` : ''}`)
  return data
}
export async function fetchManagerRefundReport() {
  const { data } = await api.get('/manager/reports/refunds')
  return data
}
export async function fetchManagerRevenueReport({ from, to } = {}) {
  const params = new URLSearchParams()
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  const { data } = await api.get(`/manager/reports/revenue?${params.toString()}`)
  return data
}

// ===== PLATFORM / SAAS =====
export async function platformLogin(email, password) {
  const { data } = await api.post('/platform/login', { email, password })
  return data
}

export async function verifyPlatform2FA(adminId, code) {
  const { data } = await api.post('/platform/verify-2fa', { adminId, code })
  return data
}

export async function fetchPlatformStats() {
  const { data } = await api.get('/platform/stats')
  return data
}

export async function fetchBusinesses({ province, district } = {}) {
  const params = new URLSearchParams()
  if (province) params.set('province', province)
  if (district) params.set('district', district)
  const qs = params.toString()
  const { data } = await api.get(`/platform/businesses${qs ? `?${qs}` : ''}`)
  return data
}

export async function fetchBusiness(id) {
  const { data } = await api.get(`/platform/businesses/${id}`)
  return data
}

export async function toggleBusinessStatus(id, action) {
  const { data } = await api.patch(`/platform/businesses/${id}/status`, { action })
  return data
}

export async function setUnpaidBusinessAccess(id, granted) {
  const { data } = await api.patch(`/platform/businesses/${id}/access`, { granted })
  return data
}

export async function fetchPlans() {
  const { data } = await api.get('/platform/plans')
  return data
}

export async function createPlan(payload) {
  const { data } = await api.post('/platform/plans', payload)
  return data
}

export async function updatePlan(id, payload) {
  const { data } = await api.put(`/platform/plans/${id}`, payload)
  return data
}

export async function registerBusiness(payload) {
  const { data } = await api.post('/auth/register-business', payload)
  return data
}

export async function fetchSubscriptionStatus() {
  const { data } = await api.get('/auth/subscription-status')
  return data
}

// ===== PLATFORM: BUSINESSES (extended) =====
export async function updateBusiness(id, payload) {
  const { data } = await api.put(`/platform/businesses/${id}`, payload)
  return data
}

export async function deleteBusiness(id) {
  const { data } = await api.delete(`/platform/businesses/${id}`)
  return data
}

// ===== PLATFORM: SUBSCRIPTIONS =====
export async function fetchPlatformSubscriptions() {
  const { data } = await api.get('/platform/subscriptions')
  return data
}

export async function fetchSubscriptionSummary() {
  const { data } = await api.get('/platform/subscriptions/summary')
  return data
}

export async function updatePlatformSubscription(id, payload) {
  const { data } = await api.patch(`/platform/subscriptions/${id}`, payload)
  return data
}

// ===== PLATFORM: PAYMENTS =====
export async function fetchPlatformPayments() {
  const { data } = await api.get('/platform/payments')
  return data
}

export async function fetchPaymentStats() {
  const { data } = await api.get('/platform/payments/stats')
  return data
}

export async function refundPayment(id, reason) {
  const { data } = await api.post(`/platform/payments/${id}/refund`, { reason })
  return data
}

export async function settlePayment(id) {
  const { data } = await api.post(`/platform/payments/${id}/settle`)
  return data
}

// ===== PLATFORM: ADMINS (Users) =====
export async function fetchAdmins() {
  const { data } = await api.get('/platform/admins')
  return data
}

export async function createAdmin(payload) {
  const { data } = await api.post('/platform/admins', payload)
  return data
}

export async function updateAdmin(id, payload) {
  const { data } = await api.put(`/platform/admins/${id}`, payload)
  return data
}

export async function resetAdminPassword(id, password) {
  const { data } = await api.post(`/platform/admins/${id}/reset-password`, { password })
  return data
}

export async function deleteAdmin(id) {
  const { data } = await api.delete(`/platform/admins/${id}`)
  return data
}

// ===== PLATFORM: REPORTS =====
export async function fetchPlatformReports() {
  const { data } = await api.get('/platform/reports')
  return data
}

// ===== PLATFORM: SETTINGS =====
export async function fetchPlatformSettings() {
  const { data } = await api.get('/platform/settings')
  return data
}

export async function updatePlatformSettings(settings) {
  const { data } = await api.put('/platform/settings', { settings })
  return data
}

// ===== PLATFORM: BACKUPS =====
export async function fetchPlatformBackups() {
  const { data } = await api.get('/platform/backups')
  return data
}

export async function createPlatformBackup(type) {
  const { data } = await api.post('/platform/backups', { type })
  return data
}

export async function deletePlatformBackup(id) {
  const { data } = await api.delete(`/platform/backups/${id}`)
  return data
}

export async function restorePlatformBackup(id) {
  const { data } = await api.post(`/platform/backups/${id}/restore`)
  return data
}

// ===== OWNER: PAYMENT SETTINGS =====
export async function fetchPaymentSettings() {
  const { data } = await api.get('/v1/owner/payment-settings')
  return data
}

export async function updatePaymentSettings(payload) {
  const { data } = await api.put('/v1/owner/payment-settings', payload)
  return data
}

// ===== OWNER: QR PAYMENT =====
export async function generateQRPayment(orderId) {
  const { data } = await api.get(`/v1/owner/qr-payment/${encodeURIComponent(orderId)}`)
  return data
}

export async function generateMerchantQRPayment() {
  const { data } = await api.get('/v1/owner/qr-payment/merchant')
  return data
}


// ===== STAFF SHIFTS =====
const shiftError = (error) => {
  const message = error.response?.data?.error
  return message ? new Error(message) : error
}

export async function fetchCurrentShift() {
  try {
    const { data } = await api.get('/shifts/current')
    return data.shift
  } catch (error) { throw shiftError(error) }
}

export async function startShift(note) {
  try {
    const { data } = await api.post('/shifts/start', { note })
    return data.shift
  } catch (error) { throw shiftError(error) }
}

export async function endShift(note) {
  try {
    const { data } = await api.post('/shifts/end', { note })
    return data.shift
  } catch (error) { throw shiftError(error) }
}

export async function fetchShifts(params = {}) {
  try {
    const { data } = await api.get('/shifts', { params })
    return data
  } catch (error) { throw shiftError(error) }
}

export async function fetchShiftPerformance(params = {}) {
  try {
    const { data } = await api.get('/shifts/performance', { params })
    return data
  } catch (error) { throw shiftError(error) }
}

// ===== STAFF ACCESS (owner-granted permissions) =====
const apiError = (error) => {
  const message = error.response?.data?.error
  return message ? new Error(message) : error
}

export async function fetchMyGrants() {
  try {
    const { data } = await api.get('/staff-permissions/me')
    return data
  } catch (error) { throw apiError(error) }
}

export async function fetchStaffPermissions() {
  try {
    const { data } = await api.get('/staff-permissions')
    return data
  } catch (error) { throw apiError(error) }
}

export async function updateStaffPermissions(userId, permissions) {
  try {
    const { data } = await api.put(`/staff-permissions/${userId}`, { permissions })
    return data
  } catch (error) { throw apiError(error) }
}

export async function resetStaffPassword(userId, newPassword) {
  try {
    const { data } = await api.put(`/v1/owner/users/${userId}/reset-password`, { newPassword })
    return data
  } catch (error) { throw apiError(error) }
}

export async function createStaffUser(payload) {
  try {
    const { data } = await api.post('/users', payload)
    return data
  } catch (error) { throw apiError(error) }
}

export async function updateStaffUser(id, changes) {
  try {
    const { data } = await api.patch(`/users/${id}`, changes)
    return data
  } catch (error) { throw apiError(error) }
}

export async function deactivateStaffUser(id) {
  try {
    const { data } = await api.delete(`/users/${id}`)
    return data
  } catch (error) { throw apiError(error) }
}

// ===== CUSTOMER: orders placed from this device =====
export async function fetchMyCustomerOrders(orderIds, businessId) {
  const { data } = await api.post('/customer/orders/mine', { orderIds, businessId })
  return data
}

/** Public: payment methods a business accepts on its "scan to pay" page. */
export async function fetchPayOptions(businessId) {
  const { data } = await api.get(`/customer/pay/${encodeURIComponent(businessId)}`)
  return data
}
