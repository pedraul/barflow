import React, { useState } from 'react'
import { useOwner } from '../../context/OwnerContext'
import { Smartphone, ArrowDownToLine, FileText, CheckCircle2, XCircle } from 'lucide-react'

const fmt = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'RWF', minimumFractionDigits: 0 }).format(v || 0)

export default function OwnerWithdraw() {
  const [phoneNumber, setPhoneNumber] = useState('')
  const [purpose, setPurpose] = useState('')
  const [amount, setAmount] = useState('')
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [viewLogs, setViewLogs] = useState(false)
  const { createWithdrawal, fetchWithdrawalLogs } = useOwner()

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!phoneNumber || !purpose || !amount) return setMsg('All fields required')
    setLoading(true); setMsg('')
    try {
      await createWithdrawal({ phoneNumber, purpose, amount: Number(amount) })
      setMsg('✅ Withdrawal request sent to manager for approval.')
      setPhoneNumber(''); setPurpose(''); setAmount('')
    } catch (e) { setMsg('❌ ' + e.message) }
    finally { setLoading(false) }
  }

  const loadLogs = async () => {
    setViewLogs(!viewLogs)
    if (!viewLogs) {
      try {
        const res = await fetchWithdrawalLogs()
        setLogs(res.withdrawals || [])
      } catch (e) { setMsg('❌ ' + e.message) }
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto w-full">
      <div className="flex justify-between items-start gap-4">
        <div>
          <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">Owner workspace</p>
          <h1 className="text-2xl font-extrabold text-slate-900">Withdraw Funds</h1>
          <p className="text-sm text-slate-500">Only the owner can create withdrawal requests. The manager must approve before the money is sent.</p>
        </div>
        <div className="p-3 bg-slate-100 rounded-xl text-slate-600">
          <Smartphone size={24} />
        </div>
      </div>

      {msg && (
        <div className={`p-4 rounded-xl text-sm font-medium border flex items-center gap-2 ${msg.startsWith('❌') ? 'bg-red-50 border-red-300 text-red-800' : 'bg-emerald-50 border-emerald-300 text-emerald-800'}`}>
          {msg.startsWith('❌') ? <XCircle size={18} /> : <CheckCircle2 size={18} />}
          {msg}
        </div>
      )}

      <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-bold text-slate-900 mb-4 pb-3 border-b border-slate-200">New Withdrawal</h2>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex flex-col gap-1.5 font-semibold text-sm text-slate-700">
            Phone Number (to receive money)
            <input type="tel" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="+250700000000" required className="px-3 py-2 border border-slate-300 rounded-lg text-sm font-normal text-slate-700 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
          </label>
          <label className="flex flex-col gap-1.5 font-semibold text-sm text-slate-700">
            Purpose of Withdrawal
            <input type="text" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. Monthly supplies" required className="px-3 py-2 border border-slate-300 rounded-lg text-sm font-normal text-slate-700 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
          </label>
          <label className="flex flex-col gap-1.5 font-semibold text-sm text-slate-700">
            Amount
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" min="0" required className="px-3 py-2 border border-slate-300 rounded-lg text-sm font-normal text-slate-700 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
          </label>
          <div className="md:col-span-2 flex justify-end">
            <button className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-800 text-white border border-indigo-600 px-4 py-2 rounded-lg font-semibold text-sm transition disabled:opacity-50" type="submit" disabled={loading}>
              <ArrowDownToLine size={16} />
              {loading ? 'Processing…' : 'Withdraw'}
            </button>
          </div>
        </form>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-slate-900">Withdrawal Logs</h2>
          <button className="inline-flex items-center gap-2 text-slate-700 bg-white border border-slate-300 px-4 py-2 rounded-lg font-semibold text-sm hover:bg-slate-100 transition" onClick={loadLogs}>
            <FileText size={16} />
            {viewLogs ? 'Hide Logs' : 'View Logs'}
          </button>
        </div>
        {viewLogs && (
          logs.length === 0 ? <p className="text-slate-400 mt-4">No withdrawals recorded.</p> : (
            <div className="border border-slate-200 rounded-lg overflow-x-auto mt-4">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr>
                     <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-3 border-b border-slate-200 text-left">Phone</th>
                     <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-3 border-b border-slate-200 text-left">Purpose</th>
                     <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-3 border-b border-slate-200 text-right">Amount</th>
                     <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-3 border-b border-slate-200 text-center">Status</th>
                     <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-3 border-b border-slate-200 text-right">Date</th>
                   </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.map((log) => (
                     <tr key={log.id} className="hover:bg-indigo-50">
                      <td className="p-3 text-slate-700">{log.phoneNumber}</td>
                      <td className="p-3 text-slate-700">{log.purpose}</td>
                      <td className="p-3 text-right font-semibold text-slate-900">{fmt(log.amount)}</td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${log.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : log.status === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
                          {log.status === 'approved' ? 'Approved' : log.status === 'rejected' ? 'Rejected' : 'Pending'}
                        </span>
                      </td>
                      <td className="p-3 text-right text-slate-400">{new Date(log.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </section>
    </div>
  )
}
