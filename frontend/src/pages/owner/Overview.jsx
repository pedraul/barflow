import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOwner } from '../../context/OwnerContext'
import { usePreferences } from '../../context/PreferencesContext'

// Plain number formatter (no currency symbol)
const fmt = (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

export default function Overview() {
  const { t } = usePreferences()
  const { fetchReportSummary, fetchSubscription, fetchBranches, branches, activeBranchId, setActiveBranchId, loading } = useOwner()
  const navigate = useNavigate()
  const [summary, setSummary] = useState(null)
  const [branchData, setBranchData] = useState([])
  const [activity, setActivity] = useState([])
  const [showActivity, setShowActivity] = useState(false)
  const [subscription, setSubscription] = useState(null)

  useEffect(() => {
    loadData()
    loadSubscription()
    fetchBranches().catch(() => {})
    const refreshTimer = window.setInterval(() => {
      loadData()
      loadSubscription()
    }, 30000)
    return () => window.clearInterval(refreshTimer)
  }, [activeBranchId])

  const loadData = async () => {
    try {
      const data = await fetchReportSummary()
      setSummary(data.summary)
      setBranchData(data.branchPerformance || [])
      setActivity(data.recentActivity || [])
    } catch (e) {
      console.error('Failed to load report summary:', e)
    }
  }

  const loadSubscription = async () => {
    try {
      const sub = await fetchSubscription()
      setSubscription(sub)
    } catch (e) {
      console.error('Failed to load subscription:', e)
    }
  }

  const kpis = [
    { label: 'Total Sales', value: fmt(summary?.totalSales), hint: 'All completed & paid orders', trend: '+12.5%', trendUp: true, to: '/owner/revenue' },
    { label: 'Net Profit', value: fmt(summary?.netProfit), hint: 'Sales minus product and salary costs', trend: '+8.2%', trendUp: true, to: '/owner/revenue' },
    { label: 'VAT Total', value: fmt(summary?.vatDue), hint: 'VAT from completed sales', trend: '-2.1%', trendUp: false, to: '/owner/revenue' },
    { label: 'Cash / Card', value: `${fmt(summary?.cashSales)} / ${fmt(summary?.cardSales)}`, hint: 'Split by payment method', trend: '+5.4%', trendUp: true, to: '/owner/revenue' },
  ]

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('Owner command center')}</p>
          <h1 className="text-2xl font-black text-slate-900">{t('Overview Dashboard')}</h1>
          <p className="text-sm text-slate-500">{t('Statistical summary across waiters, manager, accountant and client QR orders.')}</p>
        </div>
        <select value={activeBranchId} onChange={(e) => setActiveBranchId(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
          <option value="all">{t('All branches')}</option>
          {branches.filter((branch) => branch.isActive !== false).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
        </select>
      </div>

      {subscription && !subscription.isActive && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4 flex items-center justify-between">
          <span className="font-medium">{t('⚠ No active subscription. System features are locked until you renew your plan.')}</span>
          <button onClick={() => navigate('/owner/subscription')} className="px-4 py-2 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700 transition">{t('Renew Now')}</button>
        </div>
      )}

      {subscription && subscription.isActive && subscription.aboutToExpire && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-4 flex items-center justify-between">
          <span className="font-medium">{t('⏰ Your subscription expires in')} {subscription.daysRemaining} {t('day(s).')}</span>
          <button onClick={() => navigate('/owner/subscription')} className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition">{t('Renew')}</button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <button type="button" key={k.label} onClick={() => navigate(k.to)} className="w-full text-left bg-white border border-slate-200 rounded-xl p-5 shadow-sm transition hover:border-indigo-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <p className="text-2xl font-black text-slate-900">{k.value}</p>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mt-1">{t(k.label)}</p>
            <p className="text-xs text-slate-400 mt-1">{t(k.hint)}</p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-slate-900">{t('Branch Performance')}</h3>
          </div>
          <div className="space-y-3">
            {branchData.length === 0 && <p className="text-sm text-slate-400 text-center py-4">{t('No branch data available')}</p>}
            {branchData.map((b, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div>
                  <p className="font-semibold text-slate-900 text-sm">{b.name || b.branchName || `Branch ${idx + 1}`}</p>
                  <p className="text-xs text-slate-500">{b.orders || b.orderCount || 0} {t('orders')}</p>
                </div>
                <p className="font-bold text-slate-900">{fmt(b.revenue)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm self-start">
          <button
            type="button"
            onClick={() => setShowActivity((v) => !v)}
            aria-expanded={showActivity}
            className="w-full flex justify-between items-center text-left focus:outline-none"
          >
            <span className="flex items-center gap-2">
              <h3 className="font-bold text-slate-900">{t('Recent Activity')}</h3>
              {activity.length > 0 && (
                <span className="text-xs font-semibold bg-blue-50 text-blue-600 rounded-full px-2 py-0.5">{activity.length}</span>
              )}
            </span>
          </button>
          {showActivity && (
          <div className="space-y-3 mt-4">
            {activity.length === 0 && <p className="text-sm text-slate-400 text-center py-4">{t('No recent activity')}</p>}
            {activity.map((a, idx) => (
              <div key={idx} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900">{a.title || a.action || t('Activity')}</p>
                  <p className="text-xs text-slate-500">{a.description || a.details || ''}</p>
                </div>
                <span className="text-xs text-slate-400 whitespace-nowrap">{a.time || a.createdAt || ''}</span>
              </div>
            ))}
          </div>
          )}
        </div>
      </div>

    </div>
  )
}
