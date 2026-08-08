import React, { createContext, useContext, useState, useCallback } from 'react'
import { useAuth } from './AuthContext'

const API_BASE = '/api/v1/owner'

const OwnerContext = createContext(null)

export function OwnerProvider({ children }) {
  const { token } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const headers = useCallback(() => ({
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }), [token])

  const handleResponse = async (res) => {
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || `Request failed with status ${res.status}`)
    }
    return res.json()
  }

  // ── Users ──
  const fetchUsers = useCallback(async (params = {}) => {
    setLoading(true); setError(null)
    try {
      const qs = new URLSearchParams(params).toString()
      const res = await fetch(`${API_BASE}/users${qs ? `?${qs}` : ''}`, { headers: headers() })
      return await handleResponse(res)
    } catch (e) { setError(e.message); throw e }
    finally { setLoading(false) }
  }, [headers])

  const createUser = useCallback(async (userData) => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${API_BASE}/users`, {
        method: 'POST', headers: headers(), body: JSON.stringify(userData),
      })
      return await handleResponse(res)
    } catch (e) { setError(e.message); throw e }
    finally { setLoading(false) }
  }, [headers])

  const updateUser = useCallback(async (id, data) => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${API_BASE}/users/${id}`, {
        method: 'PUT', headers: headers(), body: JSON.stringify(data),
      })
      return await handleResponse(res)
    } catch (e) { setError(e.message); throw e }
    finally { setLoading(false) }
  }, [headers])

  const deleteUser = useCallback(async (id) => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${API_BASE}/users/${id}`, {
        method: 'DELETE', headers: headers(),
      })
      return await handleResponse(res)
    } catch (e) { setError(e.message); throw e }
    finally { setLoading(false) }
  }, [headers])

  const resetUserPassword = useCallback(async (id, newPassword) => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${API_BASE}/users/${id}/reset-password`, {
        method: 'PUT', headers: headers(), body: JSON.stringify({ newPassword }),
      })
      return await handleResponse(res)
    } catch (e) { setError(e.message); throw e }
    finally { setLoading(false) }
  }, [headers])

  // ── Salaries / Payroll ──
  const fetchSalaries = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${API_BASE}/salaries`, { headers: headers() })
      return await handleResponse(res)
    } catch (e) { setError(e.message); throw e }
    finally { setLoading(false) }
  }, [headers])

  const processPayout = useCallback(async (payPeriod) => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${API_BASE}/salaries/payout`, {
        method: 'POST', headers: headers(), body: JSON.stringify(payPeriod || {}),
      })
      return await handleResponse(res)
    } catch (e) { setError(e.message); throw e }
    finally { setLoading(false) }
  }, [headers])

  // ── Withdrawals ──
  const createWithdrawal = useCallback(async (data) => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${API_BASE}/withdraw`, {
        method: 'POST', headers: headers(), body: JSON.stringify(data),
      })
      return await handleResponse(res)
    } catch (e) { setError(e.message); throw e }
    finally { setLoading(false) }
  }, [headers])

  const fetchWithdrawalLogs = useCallback(async (params = {}) => {
    setLoading(true); setError(null)
    try {
      const qs = new URLSearchParams(params).toString()
      const res = await fetch(`${API_BASE}/withdraw/logs${qs ? `?${qs}` : ''}`, { headers: headers() })
      return await handleResponse(res)
    } catch (e) { setError(e.message); throw e }
    finally { setLoading(false) }
  }, [headers])

  // ── Transfers ──
  const createTransfer = useCallback(async (data) => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${API_BASE}/transfer`, {
        method: 'POST', headers: headers(), body: JSON.stringify(data),
      })
      return await handleResponse(res)
    } catch (e) { setError(e.message); throw e }
    finally { setLoading(false) }
  }, [headers])

  const approveTransfer = useCallback(async (id, action) => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${API_BASE}/transfer/${id}/approve`, {
        method: 'PUT', headers: headers(), body: JSON.stringify({ action }),
      })
      return await handleResponse(res)
    } catch (e) { setError(e.message); throw e }
    finally { setLoading(false) }
  }, [headers])

  const fetchTransferLogs = useCallback(async (params = {}) => {
    setLoading(true); setError(null)
    try {
      const qs = new URLSearchParams(params).toString()
      const res = await fetch(`${API_BASE}/transfer/logs${qs ? `?${qs}` : ''}`, { headers: headers() })
      return await handleResponse(res)
    } catch (e) { setError(e.message); throw e }
    finally { setLoading(false) }
  }, [headers])

  // ── Revenue ──
  const fetchRevenue = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${API_BASE}/revenue`, { headers: headers() })
      return await handleResponse(res)
    } catch (e) { setError(e.message); throw e }
    finally { setLoading(false) }
  }, [headers])

  const fetchRevenueLogs = useCallback(async (params = {}) => {
    setLoading(true); setError(null)
    try {
      const qs = new URLSearchParams(params).toString()
      const res = await fetch(`${API_BASE}/revenue/logs${qs ? `?${qs}` : ''}`, { headers: headers() })
      return await handleResponse(res)
    } catch (e) { setError(e.message); throw e }
    finally { setLoading(false) }
  }, [headers])

  // ── Orders Oversight ──
  const fetchQROrders = useCallback(async (params = {}) => {
    setLoading(true); setError(null)
    try {
      const qs = new URLSearchParams(params).toString()
      const res = await fetch(`${API_BASE}/orders/qr${qs ? `?${qs}` : ''}`, { headers: headers() })
      return await handleResponse(res)
    } catch (e) { setError(e.message); throw e }
    finally { setLoading(false) }
  }, [headers])

  const fetchWaiters = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${API_BASE}/waiters`, { headers: headers() })
      return await handleResponse(res)
    } catch (e) { setError(e.message); throw e }
    finally { setLoading(false) }
  }, [headers])

  const fetchWaiterOrders = useCallback(async (userId, params = {}) => {
    setLoading(true); setError(null)
    try {
      const qs = new URLSearchParams(params).toString()
      const res = await fetch(`${API_BASE}/orders/waiter/${userId}${qs ? `?${qs}` : ''}`, { headers: headers() })
      return await handleResponse(res)
    } catch (e) { setError(e.message); throw e }
    finally { setLoading(false) }
  }, [headers])

  const fetchOrderHistory = useCallback(async (orderId) => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${API_BASE}/orders/${orderId}/history`, { headers: headers() })
      return await handleResponse(res)
    } catch (e) { setError(e.message); throw e }
    finally { setLoading(false) }
  }, [headers])

  // ── Reports ──
  const fetchReportSummary = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${API_BASE}/reports/summary`, { headers: headers() })
      return await handleResponse(res)
    } catch (e) { setError(e.message); throw e }
    finally { setLoading(false) }
  }, [headers])

  const exportReport = useCallback(async (format = 'csv') => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${API_BASE}/reports/export?format=${format}`, { headers: headers() })
      if (format === 'csv') return res.blob()
      return await handleResponse(res)
    } catch (e) { setError(e.message); throw e }
    finally { setLoading(false) }
  }, [headers])

  // ── Audit Logs ──
  const fetchAuditLogs = useCallback(async (params = {}) => {
    setLoading(true); setError(null)
    try {
      const qs = new URLSearchParams(params).toString()
      const res = await fetch(`${API_BASE}/audit-logs${qs ? `?${qs}` : ''}`, { headers: headers() })
      return await handleResponse(res)
    } catch (e) { setError(e.message); throw e }
    finally { setLoading(false) }
  }, [headers])

  const fetchAuditLogsExport = useCallback(async (params = {}, format = 'csv') => {
    setLoading(true); setError(null)
    try {
      const qs = new URLSearchParams({ ...params, format }).toString()
      const res = await fetch(`${API_BASE}/audit-logs/export?${qs}`, { headers: headers() })
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.${format === 'xls' ? 'xls' : 'csv'}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (e) { setError(e.message); throw e }
    finally { setLoading(false) }
  }, [headers])

  // ── Subscription ──
  const fetchSubscription = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${API_BASE}/subscription`, { headers: headers() })
      return await handleResponse(res)
    } catch (e) { setError(e.message); throw e }
    finally { setLoading(false) }
  }, [headers])

  const fetchAvailableSubscriptionPlans = useCallback(async () => {
    const res = await fetch(`${API_BASE}/subscription/plans`, { headers: headers() })
    return handleResponse(res)
  }, [headers])

  const selectSubscriptionPlan = useCallback(async (data) => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${API_BASE}/subscription/select-plan`, {
        method: 'POST', headers: headers(), body: JSON.stringify(data),
      })
      return await handleResponse(res)
    } catch (e) { setError(e.message); throw e }
    finally { setLoading(false) }
  }, [headers])

  const verifySubscriptionPayment = useCallback(async (ussdCode) => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${API_BASE}/subscription/verify-payment`, {
        method: 'POST', headers: headers(), body: JSON.stringify({ ussdCode }),
      })
      return await handleResponse(res)
    } catch (e) { setError(e.message); throw e }
    finally { setLoading(false) }
  }, [headers])

  const fetchReceipt = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${API_BASE}/subscription/receipt`, { headers: headers() })
      return await handleResponse(res)
    } catch (e) { setError(e.message); throw e }
    finally { setLoading(false) }
  }, [headers])

  const renewSubscription = useCallback(async (plan) => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${API_BASE}/subscription/renew`, {
        method: 'POST', headers: headers(), body: JSON.stringify({ plan }),
      })
      return await handleResponse(res)
    } catch (e) { setError(e.message); throw e }
    finally { setLoading(false) }
  }, [headers])

  // ── Inventory ──
  const fetchGlobalInventory = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${API_BASE}/inventory`, { headers: headers() })
      return await handleResponse(res)
    } catch (e) { setError(e.message); throw e }
    finally { setLoading(false) }
  }, [headers])

  const fetchStockMovements = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${API_BASE}/inventory/movements`, { headers: headers() })
      return await handleResponse(res)
    } catch (e) { setError(e.message); throw e }
    finally { setLoading(false) }
  }, [headers])

  // ── Settings ──
  const fetchSystemSettings = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${API_BASE}/settings`, { headers: headers() })
      return await handleResponse(res)
    } catch (e) { setError(e.message); throw e }
    finally { setLoading(false) }
  }, [headers])

  const updateSystemSettings = useCallback(async (data) => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${API_BASE}/settings`, {
        method: 'PUT', headers: headers(), body: JSON.stringify(data),
      })
      return await handleResponse(res)
    } catch (e) { setError(e.message); throw e }
    finally { setLoading(false) }
  }, [headers])

  const triggerBackup = useCallback(async (data) => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${API_BASE}/settings/backup`, {
        method: 'POST', headers: headers(), body: JSON.stringify(data || {}),
      })
      return await handleResponse(res)
    } catch (e) { setError(e.message); throw e }
    finally { setLoading(false) }
  }, [headers])

  const fetchBackups = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${API_BASE}/settings/backups`, { headers: headers() })
      return await handleResponse(res)
    } catch (e) { setError(e.message); throw e }
    finally { setLoading(false) }
  }, [headers])

  const restoreBackup = useCallback(async (backupId) => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${API_BASE}/settings/restore-backup`, {
        method: 'POST', headers: headers(), body: JSON.stringify({ backupId }),
      })
      return await handleResponse(res)
    } catch (e) { setError(e.message); throw e }
    finally { setLoading(false) }
  }, [headers])

  const updatePermissions = useCallback(async (role, permissions) => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${API_BASE}/settings/permissions`, {
        method: 'PUT', headers: headers(), body: JSON.stringify({ role, permissions }),
      })
      return await handleResponse(res)
    } catch (e) { setError(e.message); throw e }
    finally { setLoading(false) }
  }, [headers])

  const importRolePermissions = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${API_BASE}/settings/permissions/import`, {
        method: 'POST', headers: headers(),
      })
      return await handleResponse(res)
    } catch (e) { setError(e.message); throw e }
    finally { setLoading(false) }
  }, [headers])

  const fetchPaymentSettings = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${API_BASE}/payment-settings`, { headers: headers() })
      return await handleResponse(res)
    } catch (e) { setError(e.message); throw e }
    finally { setLoading(false) }
  }, [headers])

  const updatePaymentSettings = useCallback(async (payload) => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${API_BASE}/payment-settings`, {
        method: 'PUT', headers: headers(), body: JSON.stringify(payload),
      })
      return await handleResponse(res)
    } catch (e) { setError(e.message); throw e }
    finally { setLoading(false) }
  }, [headers])

  const generateQRPayment = useCallback(async (orderId) => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${API_BASE}/qr-payment/${encodeURIComponent(orderId)}`, { headers: headers() })
      return await handleResponse(res)
    } catch (e) { setError(e.message); throw e }
    finally { setLoading(false) }
  }, [headers])

  const generateMerchantQRPayment = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${API_BASE}/qr-payment/merchant`, { headers: headers() })
      return await handleResponse(res)
    } catch (e) { setError(e.message); throw e }
    finally { setLoading(false) }
  }, [headers])

  const verifyQRPayment = useCallback(async (payload) => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${API_BASE}/qr-payment/verify`, {
        method: 'POST', headers: headers(), body: JSON.stringify(payload),
      })
      return await handleResponse(res)
    } catch (e) { setError(e.message); throw e }
    finally { setLoading(false) }
  }, [headers])

  const value = {
    loading, error,
    fetchUsers, createUser, updateUser, deleteUser, resetUserPassword,
    fetchSalaries, processPayout,
    createWithdrawal, fetchWithdrawalLogs,
    createTransfer, approveTransfer, fetchTransferLogs,
    fetchRevenue, fetchRevenueLogs,
    fetchReportSummary, exportReport,
    fetchQROrders, fetchWaiters, fetchWaiterOrders, fetchOrderHistory,
    fetchAuditLogs, fetchAuditLogsExport,
    fetchSubscription, fetchAvailableSubscriptionPlans, selectSubscriptionPlan, verifySubscriptionPayment, fetchReceipt, renewSubscription,
    fetchGlobalInventory, fetchStockMovements,
    fetchSystemSettings, updateSystemSettings, triggerBackup, fetchBackups, restoreBackup, updatePermissions,
    fetchPaymentSettings, updatePaymentSettings, generateQRPayment, generateMerchantQRPayment, verifyQRPayment,
  }

  return (
    <OwnerContext.Provider value={value}>
      {children}
    </OwnerContext.Provider>
  )
}

export function useOwner() {
  const context = useContext(OwnerContext)
  if (!context) throw new Error('useOwner must be used within OwnerProvider')
  return context
}
