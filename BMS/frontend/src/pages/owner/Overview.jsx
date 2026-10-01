import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOwner } from '../../context/OwnerContext'
import {
  TrendingUp, PieChart, CreditCard,
  Bell, MoreHorizontal
} from 'lucide-react'

// Plain number formatter (no currency symbol)
const fmt = (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

export default function Overview() {
  const { fetchReportSummary, fetchSubscription, loading } = useOwner()
  const navigate = useNavigate()
  const [summary, setSummary] = useState(null)
  const [branchData, setBranchData] = useState([])
  const [activity, setActivity] = useState([])
  const [subscription, setSubscription] = useState(null)

  useEffect(() => {
    loadData()
    loadSubscription()
  }, [])

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
    { label: 'Total Sales', value: fmt(summary?.totalSales), hint: 'All completed & paid orders', icon: <TrendingUp size={24} className="text-blue-600" />, iconBg: 'bg-blue-50', trend: '+12.5%', trendUp: true },
    { label: 'Net Profit', value: fmt(summary?.netProfit), hint: 'Sales minus cost of goods', icon: <TrendingUp size={24} className="text-emerald-600" />, iconBg: 'bg-emerald-50', trend: '+8.2%', trendUp: true },
    { label: 'VAT Due (18%)', value: fmt(summary?.vatDue), hint: 'Estimated tax liability', icon: <PieChart size={24} className="text-amber-600" />, iconBg: 'bg-amber-50', trend: '-2.1%', trendUp: false },
    { label: 'Cash / Card', value: `${fmt(summary?.cashSales)} / ${fmt(summary?.cardSales)}`, hint: 'Split by payment method', icon: <CreditCard size={24} className="text-purple-600" />, iconBg: 'bg-purple-50', trend: '+5.4%', trendUp: true },
  ]

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Owner command center</p>
          <h1 className="text-2xl font-black text-slate-900">Overview Dashboard</h1>
          <p className="text-sm text-slate-500">Statistical summary across waiters, manager, accountant and client QR orders.</p>
        </div>
      </div>

      {subscription && !subscription.isActive && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4 flex items-center justify-between">
          <span className="font-medium">⚠ No active subscription. System features are locked until you renew your plan.</span>
          <button onClick={() => navigate('/owner/subscription')} className="px-4 py-2 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700 transition">Renew Now</button>
        </div>
      )}

      {subscription && subscription.isActive && subscription.aboutToExpire && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-4 flex items-center justify-between">
          <span className="font-medium">⏰ Your subscription expires in {subscription.daysRemaining} day(s).</span>
          <button onClick={() => navigate('/owner/subscription')} className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition">Renew</button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <div key={k.label} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <div className="flex justify-between items-start mb-4">
                  <div className={`p-3 rounded-xl ${k.iconBg}`}>{k.icon}</div>
                </div>
            <p className="text-2xl font-black text-slate-900">{k.value}</p>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mt-1">{k.label}</p>
            <p className="text-xs text-slate-400 mt-1">{k.hint}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-slate-900">Branch Performance</h3>
            <button className="text-slate-400 hover:text-slate-600"><MoreHorizontal size={18} /></button>
          </div>
          <div className="space-y-3">
            {branchData.length === 0 && <p className="text-sm text-slate-400 text-center py-4">No branch data available</p>}
            {branchData.map((b, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div>
                  <p className="font-semibold text-slate-900 text-sm">{b.branchName || `Branch ${idx + 1}`}</p>
                  <p className="text-xs text-slate-500">{b.orderCount || 0} orders</p>
                </div>
                <p className="font-bold text-slate-900">{fmt(b.revenue)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-slate-900">Recent Activity</h3>
            <button className="text-slate-400 hover:text-slate-600"><MoreHorizontal size={18} /></button>
          </div>
          <div className="space-y-3">
            {activity.length === 0 && <p className="text-sm text-slate-400 text-center py-4">No recent activity</p>}
            {activity.map((a, idx) => (
              <div key={idx} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                  <Bell size={16} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900">{a.title || a.action || 'Activity'}</p>
                  <p className="text-xs text-slate-500">{a.description || a.details || ''}</p>
                </div>
                <span className="text-xs text-slate-400 whitespace-nowrap">{a.time || a.createdAt || ''}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  )
}
