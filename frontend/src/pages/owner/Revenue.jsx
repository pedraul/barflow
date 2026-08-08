import React, { useEffect, useState, useCallback } from 'react'
import { useOwner } from '../../context/OwnerContext'
import { TrendingUp, FileText, CheckCircle2, XCircle } from 'lucide-react'

const fmt = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'RWF', minimumFractionDigits: 0 }).format(v || 0)

export default function OwnerRevenue() {
  const [revenue, setRevenue] = useState(null)
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(false)
  const [viewLogs, setViewLogs] = useState(false)
  const { fetchRevenue, fetchRevenueLogs } = useOwner()

  const loadData = useCallback(async () => {
    try {
      const data = await fetchRevenue()
      setRevenue(data)
    } catch (e) { console.error(e) }
  }, [fetchRevenue])

  useEffect(() => { loadData() }, [loadData])

  const loadLogs = async () => {
    setViewLogs(!viewLogs)
    if (!viewLogs) {
      setLoading(true)
      try {
        const res = await fetchRevenueLogs()
        setLogs(res.logs || [])
      } catch (e) { /* ignore */ }
      finally { setLoading(false) }
    }
  }

  const cards = revenue ? [
    { label: 'Revenue Received', value: fmt(revenue.revenueReceived) },
    { label: 'Stock Items Available', value: revenue.stockAvailable?.items || 0 },
    { label: 'Orders Pending', value: revenue.stockOrdered?.orders || 0 },
    { label: 'Current Stock Value', value: fmt(revenue.currentStockValue) },
    { label: 'Value of Sold Stock', value: fmt(revenue.soldStockValue) },
  ] : []

  const logTypeClass = (t) =>
    t === 'received' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : t === 'stock_sold' ? 'bg-blue-100 text-blue-800 border-blue-300' : 'bg-amber-100 text-amber-800 border-amber-300'

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto w-full">
      <div className="flex justify-between items-start gap-4">
        <div>
          <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">Owner workspace</p>
          <h1 className="text-2xl font-extrabold text-slate-900">Revenue Overview</h1>
          <p className="text-sm text-slate-500">Revenue received, stock available, stock ordered and the value of sold stock.</p>
        </div>
        <div className="p-3 bg-slate-100 rounded-xl text-slate-600">
          <TrendingUp size={24} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-600 rounded-r"></div>
            <strong className="block text-2xl font-extrabold text-slate-900 tracking-tight">{c.value}</strong>
            <span className="text-slate-500 text-sm font-medium">{c.label}</span>
          </div>
        ))}
      </div>

      <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-slate-900">Revenue Logs</h2>
          <button className="inline-flex items-center gap-2 text-slate-700 bg-white border border-slate-300 px-4 py-2 rounded-lg font-semibold text-sm hover:bg-slate-100 transition" onClick={loadLogs}>
            <FileText size={16} />
            {viewLogs ? 'Hide Logs' : 'View Logs'}
          </button>
        </div>
        {viewLogs && (
          logs.length === 0 ? <p className="text-slate-400 mt-4">No logs recorded.</p> : (
            <div className="border border-slate-200 rounded-lg overflow-x-auto mt-4">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr>
                    <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-3 border-b border-slate-200 text-left">Type</th>
                    <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-3 border-b border-slate-200 text-left">Description</th>
                    <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-3 border-b border-slate-200 text-right">Amount</th>
                    <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-3 border-b border-slate-200 text-right">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-indigo-50">
                      <td className="p-3"><span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold border ${logTypeClass(log.type)}`}>{log.type.replace('_', ' ')}</span></td>
                      <td className="p-3 text-slate-600">{log.description || '—'}</td>
                      <td className="p-3 text-right font-semibold text-slate-900">{fmt(log.amount)}</td>
                      <td className="p-3 text-right text-slate-400">{new Date(log.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </section>

      {loading && <p className="text-center text-slate-400">Loading…</p>}
    </div>
  )
}
