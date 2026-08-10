import React, { useEffect, useMemo, useState } from 'react'
import { CircleDollarSign, Search, Download, RefreshCw, Receipt, Undo2 } from 'lucide-react'
import { fetchPlatformPayments, fetchPaymentStats, refundPayment, settlePayment } from '../../api/endpoints'

const CURRENCY = 'RWF'
const formatCurr = (v) => new Intl.NumberFormat('en-RW', { style: 'currency', currency: CURRENCY, minimumFractionDigits: 0 }).format(v || 0)
const METHOD_LABEL = { mtn_momo: 'MTN MoMo', airtel_money: 'Airtel Money', bank: 'Bank Transfer', cash: 'Cash', pos: 'POS' }

export default function Payments() {
  const [payments, setPayments] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [busy, setBusy] = useState(null)
  const [receipt, setReceipt] = useState(null)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    try {
      const [p, s] = await Promise.all([fetchPlatformPayments(), fetchPaymentStats()])
      setPayments(p)
      setStats(s)
    } catch (e) {
      console.error('Failed to load payments:', e)
    } finally {
      setLoading(false)
    }
  }

  const handleRefund = async (p) => {
    const reason = window.prompt(`Refund ${formatCurr(p.amount)} to ${p.business}?\nOptional reason:`)
    if (reason === null) return
    setBusy(`${p.id}-refund`)
    try {
      await refundPayment(p.id, reason)
      await load()
    } catch (e) {
      alert(e.response?.data?.error || 'Refund failed.')
    } finally {
      setBusy(null)
    }
  }

  const handleSettle = async (p) => {
    if (!window.confirm(`Settle payment of ${formatCurr(p.amount)} from ${p.business}?`)) return
    setBusy(`${p.id}-settle`)
    try {
      await settlePayment(p.id)
      await load()
    } catch (e) {
      alert(e.response?.data?.error || 'Settle failed.')
    } finally {
      setBusy(null)
    }
  }

  const filtered = useMemo(() => payments.filter((p) => {
    const matchesQ = !q || [p.business, p.transactionId, p.plan].some((v) => (v || '').toLowerCase().includes(q.toLowerCase()))
    const matchesStatus = statusFilter === 'all' || p.status === statusFilter
    return matchesQ && matchesStatus
  }), [payments, q, statusFilter])

  const badge = (status) => {
    const map = { paid: 'bg-emerald-100 text-emerald-700', settled: 'bg-blue-100 text-blue-700', pending: 'bg-amber-100 text-amber-700', failed: 'bg-red-100 text-red-700', refunded: 'bg-slate-200 text-slate-600' }
    return <span className={`px-2 py-0.5 text-xs font-semibold rounded-full capitalize ${map[status] || 'bg-slate-100 text-slate-600'}`}>{status}</span>
  }

  const exportCsv = () => {
    const header = 'Payment ID,Business,Plan,Amount,Method,Transaction ID,Status,Date\n'
    const rows = filtered.map((p) => `"${p.id}","${p.business}","${p.plan}",${p.amount},"${METHOD_LABEL[p.method] || p.method}","${p.transactionId || ''}","${p.status}","${p.date ? new Date(p.date).toLocaleString() : ''}"`).join('\n')
    const blob = new Blob([header + rows], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `payments_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const downloadReceipt = (p) => {
    const lines = [
      'BARFLOW — PAYMENT RECEIPT', '--------------------------------',
      `Payment ID:   ${p.id}`, `Business:     ${p.business}`, `Plan:         ${p.plan} (${p.billingCycle || ''})`,
      `Amount:       ${formatCurr(p.amount)}`, `Method:       ${METHOD_LABEL[p.method] || p.method}`,
      `Transaction:  ${p.transactionId || 'N/A'}`, `Status:       ${p.status}`,
      `Date:         ${p.date ? new Date(p.date).toLocaleString() : 'N/A'}`, '--------------------------------',
      `Generated:    ${new Date().toLocaleString()}`,
    ].join('\n')
    const blob = new Blob([lines], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `receipt_${p.transactionId || p.id}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full" /></div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Payments</h1>
          <p className="text-sm text-slate-500 mt-1">Track subscription payments across all businesses</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCsv} className="px-4 py-2 text-sm bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition inline-flex items-center gap-2"><Download size={16} /> Export</button>
          <button onClick={load} className="px-4 py-2 text-sm bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition inline-flex items-center gap-2"><RefreshCw size={16} /> Refresh</button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard title="Total Collected" value={formatCurr(stats?.collected)} icon={<CircleDollarSign className="text-emerald-600" />} bg="bg-emerald-50" />
        <SummaryCard title="Pending" value={String(stats?.pending ?? 0)} icon={<CircleDollarSign className="text-amber-600" />} bg="bg-amber-50" />
        <SummaryCard title="Failed" value={String(stats?.failed ?? 0)} icon={<CircleDollarSign className="text-red-600" />} bg="bg-red-50" />
        <SummaryCard title="Refunded" value={String(stats?.refunded ?? 0)} icon={<CircleDollarSign className="text-slate-500" />} bg="bg-slate-100" />
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search business, transaction, plan..."
            className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white capitalize focus:ring-2 focus:ring-indigo-500 outline-none">
          <option value="all">All statuses</option>
          <option value="paid">Paid</option>
          <option value="settled">Settled</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
          <option value="refunded">Refunded</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <th className="text-left px-4 py-3 font-semibold">Business</th>
                <th className="text-left px-4 py-3 font-semibold">Plan</th>
                <th className="text-left px-4 py-3 font-semibold">Amount</th>
                <th className="text-left px-4 py-3 font-semibold">Method</th>
                <th className="text-left px-4 py-3 font-semibold">Transaction</th>
                <th className="text-left px-4 py-3 font-semibold">Status</th>
                <th className="text-left px-4 py-3 font-semibold">Date</th>
                <th className="text-right px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No payments found.</td></tr>}
              {filtered.map((p) => (
                <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-semibold text-slate-900">{p.business}</td>
                  <td className="px-4 py-3 text-slate-700">{p.plan}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{formatCurr(p.amount)}</td>
                  <td className="px-4 py-3 text-slate-700">{METHOD_LABEL[p.method] || p.method}</td>
                  <td className="px-4 py-3 text-slate-500 font-mono text-xs">{p.transactionId || '—'}</td>
                  <td className="px-4 py-3">{badge(p.status)}</td>
                  <td className="px-4 py-3 text-slate-400">{p.date ? new Date(p.date).toLocaleDateString() : '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <button title="Receipt" onClick={() => downloadReceipt(p)} className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100"><Receipt size={15} /></button>
                      {p.status === 'paid' && (
                        <button title="Settle" onClick={() => handleSettle(p)} disabled={busy === `${p.id}-settle`} className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 disabled:opacity-40"><CircleDollarSign size={15} /></button>
                      )}
                      {p.status === 'paid' && (
                        <button title="Refund" onClick={() => handleRefund(p)} disabled={busy === `${p.id}-refund`} className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-40"><Undo2 size={15} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function SummaryCard({ title, value, icon, bg }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-start justify-between shadow-xs">
      <div className="space-y-1.5">
        <span className="text-[11px] font-bold tracking-wide text-slate-500 uppercase block">{title}</span>
        <p className="text-2xl font-black text-slate-900 tracking-tight">{value}</p>
      </div>
      <div className={`p-2 rounded-lg ${bg} shrink-0`}>{icon}</div>
    </div>
  )
}
