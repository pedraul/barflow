import React, { useState } from 'react'
import { useOwner } from '../../context/OwnerContext'
import { usePreferences } from '../../context/PreferencesContext'

const fmt = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'RWF', minimumFractionDigits: 0 }).format(v || 0)

const statusClass = (s) =>
  (s === 'completed' || s === 'approved') ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
    : s === 'rejected' ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-amber-100 text-amber-800 border-amber-300'

export default function OwnerTransfer() {
  const { t } = usePreferences()
  const [toPhone, setToPhone] = useState('')
  const [method, setMethod] = useState('mtn_momo')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [viewLogs, setViewLogs] = useState(false)
  const { createTransfer, fetchTransferLogs } = useOwner()

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!amount) return setMsg(t('Amount is required'))
    setLoading(true); setMsg('')
    try {
      await createTransfer({ toPhone: toPhone.trim(), amount: Number(amount), description, method })
      setMsg(t('✅ Transfer initiated. Pending manager approval.'))
      setToPhone(''); setAmount(''); setDescription('')
    } catch (e) { setMsg('❌ ' + e.message) }
    finally { setLoading(false) }
  }

  const loadLogs = async () => {
    setViewLogs(!viewLogs)
    if (!viewLogs) {
      try {
        const res = await fetchTransferLogs()
        setLogs(res.transfers || [])
      } catch (e) { setMsg('❌ ' + e.message) }
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto w-full">
      <div className="flex justify-between items-start gap-4">
        <div>
          <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">{t('Owner workspace')}</p>
          <h1 className="text-2xl font-extrabold text-slate-900">{t('Transfer Funds')}</h1>
          <p className="text-sm text-slate-500">{t('Owner and accountant can create transfers. Manager must approve before completion.')}</p>
        </div>
      </div>

      {msg && (
        <div className={`p-4 rounded-xl text-sm font-medium border flex items-center gap-2 ${msg.startsWith('❌') ? 'bg-red-50 border-red-300 text-red-800' : 'bg-emerald-50 border-emerald-300 text-emerald-800'}`}>
          {msg.replace(/^[❌✅]\s*/u, '')}
        </div>
      )}

      <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
        <div className="flex items-center gap-3 mb-1">
          <div>
            <h2 className="text-lg font-bold text-slate-900 m-0 border-0 p-0">{t('New Transfer')}</h2>
            <p className="m-0 text-slate-500 text-sm">{t('Send money to a mobile money account after manager approval.')}</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <label className="flex flex-col gap-1.5 font-semibold text-sm text-slate-700">
            <span className="flex items-center gap-1.5">{t('Phone Number')}</span>
            <input
              type="tel"
              value={toPhone}
              onChange={(e) => setToPhone(e.target.value)}
              placeholder={t('e.g. 0788123456')}
              required
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm font-normal text-slate-700 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
          </label>
          <label className="flex flex-col gap-1.5 font-semibold text-sm text-slate-700">
            <span className="flex items-center gap-1.5">{t('Mobile money provider')}</span>
            <select value={method} onChange={(e) => setMethod(e.target.value)} required className="px-3 py-2 border border-slate-300 rounded-lg text-sm font-normal text-slate-700">
              <option value="mtn_momo">{t('MTN MoMo')}</option>
              <option value="airtel_money">{t('Airtel Money')}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5 font-semibold text-sm text-slate-700">
            <span className="flex items-center gap-1.5">{t('Purpose')}</span>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('e.g. Supplier payment, Salary advance')}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm font-normal text-slate-700 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
          </label>
          <label className="flex flex-col gap-1.5 font-semibold text-sm text-slate-700">
            <span className="flex items-center gap-1.5">{t('Amount (RWF)')}</span>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={t('0')}
              min="1"
              required
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm font-normal text-slate-700 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
          </label>
          <div className="md:col-span-2 flex justify-end">
            <button className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-800 text-white border border-indigo-600 px-4 py-2 rounded-lg font-semibold text-sm transition disabled:opacity-50" type="submit" disabled={loading}>
              {loading ? t('Processing…') : t('Initiate Transfer →')}
            </button>
          </div>
        </form>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-slate-900">{t('Transfer Logs')}</h2>
          <button className="inline-flex items-center gap-2 text-slate-700 bg-white border border-slate-300 px-4 py-2 rounded-lg font-semibold text-sm hover:bg-slate-100 transition" onClick={loadLogs}>
            {viewLogs ? t('Hide Logs') : t('View Logs')}
          </button>
        </div>
        {viewLogs && (
          logs.length === 0 ? <p className="text-slate-400 mt-4">{t('No transfers recorded.')}</p> : (
            <div className="border border-slate-200 rounded-lg overflow-x-auto mt-4">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-2 border-b border-slate-200 text-left">{t('From')}</th>
                    <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-2 border-b border-slate-200 text-left">{t('To / Phone')}</th>
                    <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-2 border-b border-slate-200 text-right">{t('Amount')}</th>
                    <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-2 border-b border-slate-200 text-center">{t('Status')}</th>
                    <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-2 border-b border-slate-200 text-left">{t('Approved By')}</th>
                    <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-2 border-b border-slate-200 text-right">{t('Date')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-indigo-50">
                      <td className="p-2 text-slate-700">{log.fromUser}</td>
                      <td className="p-2 text-slate-700">
                        <div>{log.toUser || t('System')}</div>
                        {log.toPhone && <small className="text-slate-400 text-xs">{log.toPhone}</small>}
                        {log.payoutReference && <small className="block text-slate-400 text-xs">{t('Ref:')} {log.payoutReference}</small>}
                      </td>
                      <td className="p-2 text-right font-semibold text-slate-900">{fmt(log.amount)}</td>
                      <td className="p-2 text-center"><span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusClass(log.status)}`}>{log.status}</span></td>
                      <td className="p-2 text-slate-700">{log.approvedBy || '—'}</td>
                      <td className="p-2 text-right text-slate-400">{new Date(log.createdAt).toLocaleDateString()}</td>
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
