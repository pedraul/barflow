import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import { useAuth } from './AuthContext'
import api from '../api/axios'

const OwnerContext = createContext(null)

export function OwnerProvider({ children }) {
  const { token } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [branches, setBranches] = useState([])
  const [activeBranchId, setActiveBranchIdState] = useState(() => localStorage.getItem('barflow.activeBranchId') || 'all')
  const subscriptionCacheRef = useRef(null)
  const subscriptionRequestRef = useRef(null)

  useEffect(() => {
    const syncActiveBranch = (event) => setActiveBranchIdState(event.detail || 'all')
    window.addEventListener('barflow-branch-changed', syncActiveBranch)
    return () => window.removeEventListener('barflow-branch-changed', syncActiveBranch)
  }, [])

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

  const setActiveBranchId = useCallback((branchId) => {
    const value = branchId || 'all'
    setActiveBranchIdState(value)
    localStorage.setItem('barflow.activeBranchId', value)
    window.dispatchEvent(new CustomEvent('barflow-branch-changed', { detail: value }))
  }, [])

  const withActiveBranch = useCallback((params = {}) => ({
    ...params,
    ...(activeBranchId && activeBranchId !== 'all' ? { branchId: activeBranchId } : {}),
  }), [activeBranchId])

  // ── Users ──
  const fetchUsers = useCallback(async (params = {}) => {
    return withLoading(async () => {
      const qs = new URLSearchParams(withActiveBranch(params)).toString()
      const { data } = await api.get(`/v1/owner/users${qs ? `?${qs}` : ''}`)
      return data
    })
  }, [withLoading, withActiveBranch])

  const createUser = useCallback(async (userData) => {
    return withLoading(async () => {
      const { data } = await api.post('/v1/owner/users', {
        ...userData,
        ...(userData.branch ? {} : activeBranchId !== 'all' ? { branch: activeBranchId } : {}),
      })
      return data
    })
  }, [withLoading, activeBranchId])

  const updateUser = useCallback(async (id, data) => {
    return withLoading(async () => {
      const { data: res } = await api.put(`/v1/owner/users/${id}`, data)
      return res
    })
  }, [withLoading])

  const deleteUser = useCallback(async (id) => {
    return withLoading(async () => {
      const { data } = await api.delete(`/v1/owner/users/${id}`)
      return data
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
      const qs = new URLSearchParams(withActiveBranch()).toString()
      const { data } = await api.get(`/v1/owner/salaries${qs ? `?${qs}` : ''}`)
      return data
    })
  }, [withLoading, withActiveBranch])

  const processPayout = useCallback(async (payPeriod) => {
    return withLoading(async () => {
      const { data } = await api.post('/v1/owner/salaries/payout', {
        ...(payPeriod || {}),
        ...(activeBranchId !== 'all' ? { branchId: activeBranchId } : {}),
      })
      return data
    })
  }, [withLoading, activeBranchId])

  const checkPayrollPayout = useCallback(async (id) => {
    return withLoading(async () => {
      const { data } = await api.post(`/manager/payrolls/${id}/status`, {
        ...(activeBranchId !== 'all' ? { branchId: activeBranchId } : {}),
      })
      return data
    })
  }, [withLoading, activeBranchId])

  const startPayrollPayout = useCallback(async (id) => {
    return withLoading(async () => {
      const { data } = await api.post(`/manager/payrolls/${id}/approve`, {
        action: 'approved',
        ...(activeBranchId !== 'all' ? { branchId: activeBranchId } : {}),
      })
      return data
    })
  }, [withLoading, activeBranchId])

  // ── Withdrawals ──
  const createWithdrawal = useCallback(async (data) => {
    return withLoading(async () => {
      const res = await api.post('/v1/owner/withdraw', { ...data, ...(activeBranchId !== 'all' ? { branchId: activeBranchId } : {}) })
      return res.data
    })
  }, [withLoading, activeBranchId])

  const fetchWithdrawalLogs = useCallback(async (params = {}) => {
    return withLoading(async () => {
      const qs = new URLSearchParams(withActiveBranch(params)).toString()
      const { data } = await api.get(`/v1/owner/withdraw/logs${qs ? `?${qs}` : ''}`)
      return data
    })
  }, [withLoading, withActiveBranch])

  // ── Transfers ──
  const createTransfer = useCallback(async (data) => {
    return withLoading(async () => {
      const { data: res } = await api.post('/v1/owner/transfer', { ...data, ...(activeBranchId !== 'all' ? { branchId: activeBranchId } : {}) })
      return res
    })
  }, [withLoading, activeBranchId])

  const approveTransfer = useCallback(async (id, action) => {
    return withLoading(async () => {
      const { data } = await api.put(`/v1/owner/transfer/${id}/approve`, { action, ...(activeBranchId !== 'all' ? { branchId: activeBranchId } : {}) })
      return data
    })
  }, [withLoading, activeBranchId])

  const fetchTransferLogs = useCallback(async (params = {}) => {
    return withLoading(async () => {
      const qs = new URLSearchParams(withActiveBranch(params)).toString()
      const { data } = await api.get(`/v1/owner/transfer/logs${qs ? `?${qs}` : ''}`)
      return data
    })
  }, [withLoading, withActiveBranch])

  // ── Revenue ──
  const fetchRevenue = useCallback(async () => {
    return withLoading(async () => {
      const qs = new URLSearchParams(withActiveBranch()).toString()
      const { data } = await api.get(`/v1/owner/revenue${qs ? `?${qs}` : ''}`)
      return data
    })
  }, [withLoading, withActiveBranch])

  const fetchRevenueLogs = useCallback(async (params = {}) => {
    return withLoading(async () => {
      const qs = new URLSearchParams(withActiveBranch(params)).toString()
      const { data } = await api.get(`/v1/owner/revenue/logs${qs ? `?${qs}` : ''}`)
      return data
    })
  }, [withLoading, withActiveBranch])

  // ── Orders Oversight ──
  const fetchQROrders = useCallback(async (params = {}) => {
    return withLoading(async () => {
      const qs = new URLSearchParams(withActiveBranch(params)).toString()
      const { data } = await api.get(`/v1/owner/orders/qr${qs ? `?${qs}` : ''}`)
      return data
    })
  }, [withLoading, withActiveBranch])

  const fetchWaiters = useCallback(async () => {
    return withLoading(async () => {
      const qs = new URLSearchParams(withActiveBranch()).toString()
      const { data } = await api.get(`/v1/owner/waiters${qs ? `?${qs}` : ''}`)
      return data
    })
  }, [withLoading, withActiveBranch])

  const fetchWaiterOrders = useCallback(async (userId, params = {}) => {
    return withLoading(async () => {
      const qs = new URLSearchParams(withActiveBranch(params)).toString()
      const { data } = await api.get(`/v1/owner/orders/waiter/${userId}${qs ? `?${qs}` : ''}`)
      return data
    })
  }, [withLoading, withActiveBranch])

  const fetchOrderHistory = useCallback(async (orderId) => {
    return withLoading(async () => {
      const { data } = await api.get(`/v1/owner/orders/${orderId}/history`)
      return data
    })
  }, [withLoading])

  // ── Reports ──
  const fetchReportSummary = useCallback(async (params = {}) => {
    return withLoading(async () => {
      const qs = new URLSearchParams(withActiveBranch(params)).toString()
      const { data } = await api.get(`/v1/owner/reports/summary${qs ? `?${qs}` : ''}`)
      return data
    })
  }, [withLoading, withActiveBranch])

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
  const fetchSubscription = useCallback(async ({ forceRefresh = false } = {}) => {
    const cacheAge = Date.now() - (subscriptionCacheRef.current?.savedAt || 0)
    if (!forceRefresh && subscriptionCacheRef.current?.token === token && cacheAge < 30_000) {
      return subscriptionCacheRef.current.data
    }

    if (subscriptionRequestRef.current?.token === token) {
      return subscriptionRequestRef.current.promise
    }

    const request = withLoading(async () => {
      const { data } = await api.get('/v1/owner/subscription')
      return data
    })
      .then((data) => {
        subscriptionCacheRef.current = { token, data, savedAt: Date.now() }
        return data
      })
      .finally(() => {
        if (subscriptionRequestRef.current?.token === token) {
          subscriptionRequestRef.current = null
        }
      })

    subscriptionRequestRef.current = { token, promise: request }
    return request
  }, [token, withLoading])

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

  const checkSubscriptionPayment = useCallback(async (paymentId) => {
    const { data } = await api.get(`/v1/owner/subscription/payment/${paymentId}/status`)
    return data
  }, [])

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
      const qs = new URLSearchParams(withActiveBranch()).toString()
      const { data } = await api.get(`/v1/owner/inventory${qs ? `?${qs}` : ''}`)
      return data
    })
  }, [withLoading, withActiveBranch])

  const fetchStockMovements = useCallback(async () => {
    return withLoading(async () => {
      const qs = new URLSearchParams(withActiveBranch()).toString()
      const { data } = await api.get(`/v1/owner/inventory/movements${qs ? `?${qs}` : ''}`)
      return data
    })
  }, [withLoading, withActiveBranch])

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

  const fetchBranches = useCallback(async () => {
    return withLoading(async () => {
      const { data } = await api.get('/branches')
      setBranches(Array.isArray(data) ? data : [])
      return data
    })
  }, [withLoading])

  const createBranch = useCallback(async (payload) => {
    return withLoading(async () => {
      const { data } = await api.post('/branches', payload)
      setBranches((current) => [
        ...current.filter((branch) => branch.id !== data.id),
        data,
      ])
      return data
    })
  }, [withLoading])

  const updateBranch = useCallback(async (id, payload) => {
    return withLoading(async () => {
      const { data } = await api.patch(`/branches/${id}`, payload)
      return data
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

  const value = {
    loading, error, branches, activeBranchId, setActiveBranchId,
    fetchUsers, createUser, updateUser, deleteUser, resetUserPassword,
    fetchSalaries, processPayout, checkPayrollPayout, startPayrollPayout,
    createWithdrawal, fetchWithdrawalLogs,
    createTransfer, approveTransfer, fetchTransferLogs,
    fetchRevenue, fetchRevenueLogs,
    fetchReportSummary, exportReport,
    fetchQROrders, fetchWaiters, fetchWaiterOrders, fetchOrderHistory,
    fetchAuditLogs, fetchAuditLogsExport,
    fetchSubscription, fetchAvailableSubscriptionPlans, selectSubscriptionPlan, checkSubscriptionPayment, fetchReceipt, renewSubscription,
    fetchGlobalInventory, fetchStockMovements,
    fetchSystemSettings, updateSystemSettings, fetchBranches, createBranch, updateBranch, triggerBackup, fetchBackups, restoreBackup, updatePermissions,
    fetchPaymentSettings, updatePaymentSettings, generateQRPayment, generateMerchantQRPayment,
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
