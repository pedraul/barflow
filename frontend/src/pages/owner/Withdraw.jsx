import React, { useState } from 'react'
import { useOwner } from '../../context/OwnerContext'
import { Smartphone, ArrowDownToLine, FileText, CheckCircle2, XCircle } from 'lucide-react'
import { usePreferences } from '../../context/PreferencesContext'

const fmt = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'RWF', minimumFractionDigits: 0 }).format(v || 0)

export default function OwnerWithdraw() {
  const { t } = usePreferences()
  const [phoneNumber, setPhoneNumber] = useState('')
  const [method, setMethod] = useState('mtn_momo')
  const [purpose, setPurpose] = useState('')
  const [amount, setAmount] = useState('')
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [viewLogs, setViewLogs] = useState(false)
  const { createWithdrawal, fetchWithdrawalLogs } = useOwner()

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!phoneNumber || !purpose || !amount) return setMsg(t('All fields required'))
    setLoading(true); setMsg('')
    try {
      await createWithdrawal({ phoneNumber, purpose, amount: Number(amount), method })
      setMsg(t('✅ Withdrawal request sent to manager for approval.'))
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
          <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">{t('Owner workspace')}</p>
          <h1 className="text-2xl font-extrabold text-slate-900">{t('Withdraw Funds')}</h1>
          <p className="text-sm text-slate-500">{t('Only the owner can create withdrawal requests. The manager must approve before the money is sent.')}</p>
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
        <h2 className="text-lg font-bold text-slate-900 mb-4 pb-3 border-b border-slate-200">{t('New Withdrawal')}</h2>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex flex-col gap-1.5 font-semibold text-sm text-slate-700">
            {t('Phone Number (to receive money)')}
            <input type="tel" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder={t('+250700000000')} required className="px-3 py-2 border border-slate-300 rounded-lg text-sm font-normal text-slate-700 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
          </label>
          <label className="flex flex-col gap-1.5 font-semibold text-sm text-slate-700">
            {t('Mobile money provider')}
            <select value={method} onChange={(e) => setMethod(e.target.value)} required className="px-3 py-2 border border-slate-300 rounded-lg text-sm font-normal text-slate-700">
              <option value="mtn_momo">{t('MTN MoMo')}</option>
              <option value="airtel_money">{t('Airtel Money')}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5 font-semibold text-sm text-slate-700">
            {t('Purpose of Withdrawal')}
            <input type="text" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder={t('e.g. Monthly supplies')} required className="px-3 py-2 border border-slate-300 rounded-lg text-sm font-normal text-slate-700 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
          </label>
          <label className="flex flex-col gap-1.5 font-semibold text-sm text-slate-700">
            {t('Amount')}
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={t('0')} min="1" required className="px-3 py-2 border border-slate-300 rounded-lg text-sm font-normal text-slate-700 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
          </label>
          <div className="md:col-span-2 flex justify-end">
            <button className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-800 text-white border border-indigo-600 px-4 py-2 rounded-lg font-semibold text-sm transition disabled:opacity-50" type="submit" disabled={loading}>
              <ArrowDownToLine size={16} />
              {loading ? t('Processing…') : t('Withdraw')}
            </button>
          </div>
        </form>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-slate-900">{t('Withdrawal Logs')}</h2>
          <button className="inline-flex items-center gap-2 text-slate-700 bg-white border border-slate-300 px-4 py-2 rounded-lg font-semibold text-sm hover:bg-slate-100 transition" onClick={loadLogs}>
            <FileText size={16} />
            {viewLogs ? t('Hide Logs') : t('View Logs')}
          </button>
        </div>
        {viewLogs && (
          logs.length === 0 ? <p className="text-slate-400 mt-4">{t('No withdrawals recorded.')}</p> : (
            <div className="border border-slate-200 rounded-lg overflow-x-auto mt-4">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                     <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-2 border-b border-slate-200 text-left">{t('Phone')}</th>
                     <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-2 border-b border-slate-200 text-left">{t('Provider / Purpose')}</th>
                     <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-2 border-b border-slate-200 text-right">{t('Amount')}</th>
                     <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-2 border-b border-slate-200 text-center">{t('Status')}</th>
                     <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-2 border-b border-slate-200 text-right">{t('Date')}</th>
                   </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.map((log) => (
                     <tr key={log.id} className="hover:bg-indigo-50">
                      <td className="p-2 text-slate-700">{log.phoneNumber}</td>
                      <td className="p-2 text-slate-700">
                        {log.method || '—'} / {log.purpose}
                        {log.payoutReference && <small className="block text-slate-400">{t('Ref:')} {log.payoutReference}</small>}
                      </td>
                      <td className="p-2 text-right font-semibold text-slate-900">{fmt(log.amount)}</td>
                      <td className="p-2 text-center">
                        <span className={`px-2 py-1 rounded-full text-[10px] font-medium ${['completed', 'approved'].includes(log.status) ? 'bg-emerald-100 text-emerald-800' : ['cancelled', 'failed'].includes(log.status) ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
                          {log.status === 'completed' ? t('Paid') : log.status === 'processing' ? t('Processing') : log.status === 'failed' ? t('Failed') : log.status === 'cancelled' ? t('Rejected') : log.status}
                        </span>
                      </td>
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
