import React, { useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOrders } from '../../context/OrdersContext'
import * as api from '../../api/endpoints'
import {
  ShoppingBag, TrendingUp, Clock, MoreHorizontal,
  RefreshCw, Bell
} from 'lucide-react'
import { StatCard } from '../../components/ui/SharedComponents'

const money = (value) => `${Number(value || 0).toLocaleString()} RWF`

export default function ManagerDashboard() {
  const { orders, refreshOrders, refreshing } = useOrders()
  const navigate = useNavigate()
  const [revenueData, setRevenueData] = useState(null)

  const fetchRevenue = async () => {
    try {
      const result = await api.fetchManagerRevenueReport()
      setRevenueData(result)
    } catch {
      // fallback to orders context
    }
  }

  useEffect(() => {
    fetchRevenue()
    const refreshTimer = window.setInterval(fetchRevenue, 30000)
    return () => window.clearInterval(refreshTimer)
  }, [])

  const stats = useMemo(() => {
    const paid = orders.filter((o) => o.status === 'Paid' || o.status === 'Served')
    const revenue = revenueData ? revenueData.totalRevenue : paid.reduce((sum, o) => sum + (Number(o.total) || 0), 0)
    const pending = orders.filter((o) => o.status === 'Open' || o.status === 'Preparing' || o.status === 'Ready')
    return {
      totalOrders: orders.length,
      revenue,
      pending: pending.length,
    }
  }, [orders, revenueData])

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Manager workspace</p>
          <h1 className="text-2xl font-black text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">An overview of everything happening across the system.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={refreshOrders}
            disabled={refreshing}
            className={`p-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition ${refreshing ? 'opacity-50 cursor-not-allowed' : ''}`}
            title="Refresh data"
          >
            <RefreshCw size={18} className={`text-slate-600 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button className="relative p-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition">
            <Bell size={18} className="text-slate-600" />
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold">3</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard icon={<ShoppingBag size={24} className="text-blue-600" />} iconBg="bg-blue-50" label="Total Orders" value={String(stats.totalOrders)} linkText="View orders" onClick={() => navigate('/manager/orders')} />
        <StatCard icon={<TrendingUp size={24} className="text-emerald-600" />} iconBg="bg-emerald-50" label="Revenue" value={money(stats.revenue)} linkText="View report" onClick={() => navigate('/manager/revenue')} />
        <StatCard icon={<TrendingUp size={24} className="text-indigo-600" />} iconBg="bg-indigo-50" label="Net Profit" value={money(revenueData?.netProfit)} linkText="View report" onClick={() => navigate('/manager/revenue')} />
        <StatCard icon={<TrendingUp size={24} className="text-amber-600" />} iconBg="bg-amber-50" label="VAT Total" value={money(revenueData?.vatTotal)} linkText="View report" onClick={() => navigate('/manager/revenue')} />
        <StatCard icon={<Clock size={24} className="text-amber-600" />} iconBg="bg-amber-50" label="Pending Orders" value={String(stats.pending)} linkText="View all" onClick={() => navigate('/manager/orders')} />
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center">
          <h3 className="font-bold text-slate-900 text-sm">Live Order Activity</h3>
          <button className="text-slate-400 hover:text-slate-600"><MoreHorizontal size={16} /></button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left px-3 py-2 font-semibold text-slate-500 uppercase tracking-wider">Order</th>
                <th className="text-left px-3 py-2 font-semibold text-slate-500 uppercase tracking-wider">Customer</th>
                <th className="text-left px-3 py-2 font-semibold text-slate-500 uppercase tracking-wider">Source</th>
                <th className="text-left px-3 py-2 font-semibold text-slate-500 uppercase tracking-wider">Total</th>
                <th className="text-left px-3 py-2 font-semibold text-slate-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.slice(0, 8).map((o) => (
                <tr key={o.id} className="hover:bg-slate-50 transition">
                  <td className="px-3 py-2 font-medium text-slate-900">{o.orderNumber ?? o.id}</td>
                  <td className="px-3 py-2 text-slate-600">{o.customer || '—'}</td>
                  <td className="px-3 py-2 text-slate-600 capitalize">{String(o.source || '—').toLowerCase()}</td>
                  <td className="px-3 py-2 font-medium text-slate-900">{money(o.total)}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${o.status === 'Paid' || o.status === 'Served' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                      {o.status}
                    </span>
                  </td>
                </tr>
              ))}
              {!orders.length && (
                <tr><td colSpan="5" className="px-3 py-6 text-center text-slate-400">No orders yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}
