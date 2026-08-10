import React, { createContext, useContext, useState, useCallback } from 'react'
import { useAuth } from './AuthContext'
import api from '../api/axios'

const OwnerContext = createContext(null)

export function OwnerProvider({ children }) {
  const { token } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleError = useCallback((e) => {
    const msg = e.response?.data?.error || e.message || 'Request failed'
    setError(msg)
    throw new Error(msg)
  }, [])

  const withLoading = useCallback(async (fn) => {
    setLoading(true)
    setError(null)
    try {
      return await fn()
    } catch (e) {
      handleError(e)
    } finally {
      setLoading(false)
    }
  }, [handleError])

  // ── Users ──
  const fetchUsers = useCallback(async (params = {}) => {
    return withLoading(async () => {
      const qs = new URLSearchParams(params).toString()
      const { data } = await api.get(`/v1/owner/users${qs ? `?${qs}` : ''}`)
      return data
    })
  }, [withLoading])

  const createUser = useCallback(async (userData) => {
    return withLoading(async () => {
      const { data } = await api.post('/v1/owner/users', userData)
      return data
    })
  }, [withLoading])

  const updateUser = useCallback(async (id, data) => {
    return withLoading(async () => {
      const { data: res } = await api.put(`/v1/owner/users/${id}`, data)
      return res
    })
  }, [withLoading])

  const deleteUser = useCallback(async (id) => {
    return withLoading(async () => {
      await api.delete(`/v1/owner/users/${id}`)
    })
  }, [withLoading])

  const resetUserPassword = useCallback(async (id, newPassword) => {
    return withLoading(async () => {
      const { data } = await api.put(`/v1/owner/users/${id}/reset-password`, { newPassword })
      return data
    })
  }, [withLoading])

  // ── Salaries / Payroll ──
  const fetchSalaries = useCallback(async () => {
    return withLoading(async () => {
      const { data } = await api.get('/v1/owner/salaries')
      return data
    })
  }, [withLoading])

  const processPayout = useCallback(async (payPeriod) => {
    return withLoading(async () => {
      const { data } = await api.post('/v1/owner/salaries/payout', payPeriod || {})
      return data
    })
  }, [withLoading])

  // ── Withdrawals ──
  const createWithdrawal = useCallback(async (data) => {
    return withLoading(async () => {
      const res = await api.post('/v1/owner/withdraw', data)
      return res.data
    })
  }, [withLoading])

  const fetchWithdrawalLogs = useCallback(async (params = {}) => {
    return withLoading(async () => {
      const qs = new URLSearchParams(params).toString()
      const { data } = await api.get(`/v1/owner/withdraw/logs${qs ? `?${qs}` : ''}`)
      return data
    })
  }, [withLoading])

  // ── Transfers ──
  const createTransfer = useCallback(async (data) => {
    return withLoading(async () => {
      const { data: res } = await api.post('/v1/owner/transfer', data)
      return res
    })
  }, [withLoading])

  const approveTransfer = useCallback(async (id, action) => {
    return withLoading(async () => {
      const { data } = await api.put(`/v1/owner/transfer/${id}/approve`, { action })
      return data
    })
  }, [withLoading])

  const fetchTransferLogs = useCallback(async (params = {}) => {
    return withLoading(async () => {
      const qs = new URLSearchParams(params).toString()
      const { data } = await api.get(`/v1/owner/transfer/logs${qs ? `?${qs}` : ''}`)
      return data
    })
  }, [withLoading])

  // ── Revenue ──
  const fetchRevenue = useCallback(async () => {
    return withLoading(async () => {
      const { data } = await api.get('/v1/owner/revenue')
      return data
    })
  }, [withLoading])

  const fetchRevenueLogs = useCallback(async (params = {}) => {
    return withLoading(async () => {
      const qs = new URLSearchParams(params).toString()
      const { data } = await api.get(`/v1/owner/revenue/logs${qs ? `?${qs}` : ''}`)
      return data
    })
  }, [withLoading])

  // ── Orders Oversight ──
  const fetchQROrders = useCallback(async (params = {}) => {
    return withLoading(async () => {
      const qs = new URLSearchParams(params).toString()
      const { data } = await api.get(`/v1/owner/orders/qr${qs ? `?${qs}` : ''}`)
      return data
    })
  }, [withLoading])

  const fetchWaiters = useCallback(async () => {
    return withLoading(async () => {
      const { data } = await api.get('/v1/owner/waiters')
      return data
    })
  }, [withLoading])

  const fetchWaiterOrders = useCallback(async (userId, params = {}) => {
    return withLoading(async () => {
      const qs = new URLSearchParams(params).toString()
      const { data } = await api.get(`/v1/owner/orders/waiter/${userId}${qs ? `?${qs}` : ''}`)
      return data
    })
  }, [withLoading])

  const fetchOrderHistory = useCallback(async (orderId) => {
    return withLoading(async () => {
      const { data } = await api.get(`/v1/owner/orders/${orderId}/history`)
      return data
    })
  }, [withLoading])

  // ── Reports ──
  const fetchReportSummary = useCallback(async () => {
    return withLoading(async () => {
      const { data } = await api.get('/v1/owner/reports/summary')
      return data
    })
  }, [withLoading])

  const exportReport = useCallback(async (format = 'csv') => {
    return withLoading(async () => {
      const { data } = await api.get(`/v1/owner/reports/export?format=${format}`)
      return data
    })
  }, [withLoading])

  // ── Audit Logs ──
  const fetchAuditLogs = useCallback(async (params = {}) => {
    return withLoading(async () => {
      const qs = new URLSearchParams(params).toString()
      const { data } = await api.get(`/v1/owner/audit-logs${qs ? `?${qs}` : ''}`)
      return data
    })
  }, [withLoading])

  const fetchAuditLogsExport = useCallback(async (params = {}, format = 'csv') => {
    return withLoading(async () => {
      const qs = new URLSearchParams({ ...params, format }).toString()
      const { data } = await api.get(`/v1/owner/audit-logs/export?${qs}`)
      return data
    })
  }, [withLoading])

  // ── Subscription ──
  const fetchSubscription = useCallback(async () => {
    return withLoading(async () => {
      const { data } = await api.get('/v1/owner/subscription')
      return data
    })
  }, [withLoading])

  const fetchAvailableSubscriptionPlans = useCallback(async () => {
    return withLoading(async () => {
      const { data } = await api.get('/v1/owner/subscription/plans')
      return data
    })
  }, [withLoading])

  const selectSubscriptionPlan = useCallback(async (data) => {
    return withLoading(async () => {
      const res = await api.post('/v1/owner/subscription/select-plan', data)
      return res.data
    })
  }, [withLoading])

  const verifySubscriptionPayment = useCallback(async (ussdCode) => {
    return withLoading(async () => {
      const { data } = await api.post('/v1/owner/subscription/verify-payment', { ussdCode })
      return data
    })
  }, [withLoading])

  const fetchReceipt = useCallback(async () => {
    return withLoading(async () => {
      const { data } = await api.get('/v1/owner/subscription/receipt')
      return data
    })
  }, [withLoading])

  const renewSubscription = useCallback(async (plan) => {
    return withLoading(async () => {
      const { data } = await api.post('/v1/owner/subscription/renew', { plan })
      return data
    })
  }, [withLoading])

  // ── Inventory ──
  const fetchGlobalInventory = useCallback(async () => {
    return withLoading(async () => {
      const { data } = await api.get('/v1/owner/inventory')
      return data
    })
  }, [withLoading])

  const fetchStockMovements = useCallback(async () => {
    return withLoading(async () => {
      const { data } = await api.get('/v1/owner/inventory/movements')
      return data
    })
  }, [withLoading])

  // ── Settings ──
  const fetchSystemSettings = useCallback(async () => {
    return withLoading(async () => {
      const { data } = await api.get('/v1/owner/settings')
      return data
    })
  }, [withLoading])

  const updateSystemSettings = useCallback(async (data) => {
    return withLoading(async () => {
      const { data: res } = await api.put('/v1/owner/settings', data)
      return res
    })
  }, [withLoading])

  const triggerBackup = useCallback(async (data) => {
    return withLoading(async () => {
      const { data: res } = await api.post('/v1/owner/settings/backup', data || {})
      return res
    })
  }, [withLoading])

  const fetchBackups = useCallback(async () => {
    return withLoading(async () => {
      const { data } = await api.get('/v1/owner/settings/backups')
      return data
    })
  }, [withLoading])

  const restoreBackup = useCallback(async (backupId) => {
    return withLoading(async () => {
      const { data } = await api.post('/v1/owner/settings/restore-backup', { backupId })
      return data
    })
  }, [withLoading])

  const updatePermissions = useCallback(async (role, permissions) => {
    return withLoading(async () => {
      const { data } = await api.put('/v1/owner/settings/permissions', { role, permissions })
      return data
    })
  }, [withLoading])

  const importRolePermissions = useCallback(async () => {
    return withLoading(async () => {
      const { data } = await api.post('/v1/owner/settings/permissions/import')
      return data
    })
  }, [withLoading])

  // ── Payment Settings & QR Payments ──
  const fetchPaymentSettings = useCallback(async () => {
    return withLoading(async () => {
      const { data } = await api.get('/v1/owner/payment-settings')
      return data
    })
  }, [withLoading])

  const updatePaymentSettings = useCallback(async (payload) => {
    return withLoading(async () => {
      const { data } = await api.put('/v1/owner/payment-settings', payload)
      return data
    })
  }, [withLoading])

  const generateQRPayment = useCallback(async (orderId) => {
    return withLoading(async () => {
      const { data } = await api.get(`/v1/owner/qr-payment/${encodeURIComponent(orderId)}`)
      return data
    })
  }, [withLoading])

  const generateMerchantQRPayment = useCallback(async () => {
    return withLoading(async () => {
      const { data } = await api.get('/v1/owner/qr-payment/merchant')
      return data
    })
  }, [withLoading])

  const verifyQRPayment = useCallback(async (payload) => {
    return withLoading(async () => {
      const { data } = await api.post('/v1/owner/qr-payment/verify', payload)
      return data
    })
  }, [withLoading])

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
