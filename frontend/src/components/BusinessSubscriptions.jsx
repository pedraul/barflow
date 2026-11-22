import React, { useEffect, useMemo, useState } from 'react'
import { fetchPlatformSubscriptions, updatePlatformSubscription } from '../api/endpoints'
import { useToast } from '../context/ToastContext'
import { usePreferences } from '../context/PreferencesContext'

const money = (v) => `${Math.round(Number(v) || 0).toLocaleString()} RWF`
const STATUS_STYLE = {
  active: 'bg-emerald-100 text-emerald-700',
  expired: 'bg-orange-100 text-orange-700',
  pending: 'bg-amber-100 text-amber-700',
  cancelled: 'bg-slate-200 text-slate-600',
  refunded: 'bg-slate-200 text-slate-600',
  payment_failed: 'bg-red-100 text-red-700',
}

/** Platform admin: every business subscription, with extend / cancel. */
export default function BusinessSubscriptions() {
  const { t } = usePreferences()
  const { showSuccess } = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('active')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      setRows(await fetchPlatformSubscriptions())
    } catch (e) {
      setError(e?.response?.data?.error || t('Could not load subscriptions.'))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const shown = useMemo(() => rows.filter((r) => (
    (filter === 'all' || r.status === filter)
    && (!q || `${r.business} ${r.plan}`.toLowerCase().includes(q.toLowerCase()))
  )), [rows, filter, q])

  const act = async (row, payload, done) => {
    setBusy(row.id)
    setError('')
    try {
      await updatePlatformSubscription(row.id, payload)
      await load()
      showSuccess(done)
    } catch (e) {
      setError(e?.response?.data?.error || t('Action failed.'))
    } finally {
      setBusy(null)
    }
  }

  const extend = (row) => {
    const days = window.prompt(`${t('Add free days to')} ${row.business} (${row.plan}):`, '7')
    if (days === null) return
    act(row, { action: 'extend', days: Number(days) }, `${t('Extended by')} ${days} ${t('days')}.`)
  }
  const cancel = (row) => {
    if (!window.confirm(`${t('Cancel the subscription of')} ${row.business}? ${t('They are blocked until they pay again, unless you grant unpaid access.')}`)) return
    act(row, { action: 'cancel' }, t('Subscription cancelled.'))
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{t('Business subscriptions')}</h2>
          <p className="text-sm text-slate-500">{t('What each business pays and until when.')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search business or plan')} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
            {['active', 'expired', 'pending', 'cancelled', 'refunded', 'all'].map((f) => <option key={f} value={f}>{t(f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1))}</option>)}
          </select>
        </div>
      </div>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm min-w-[760px]">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr>
              <th className="text-left p-3">{t('Business')}</th>
              <th className="text-left p-3">{t('Plan')}</th>
              <th className="text-right p-3">{t('Paid')}</th>
              <th className="text-left p-3">{t('Ends')}</th>
              <th className="text-left p-3">{t('Status')}</th>
              <th className="text-right p-3">{t('Actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && <tr><td colSpan={6} className="p-4 text-center text-slate-400">{t('Loading…')}</td></tr>}
            {!loading && !shown.length && <tr><td colSpan={6} className="p-4 text-center text-slate-400">{t('No subscriptions.')}</td></tr>}
            {shown.map((r) => (
              <tr key={r.id}>
                <td className="p-3 font-semibold text-slate-900">{r.business}</td>
                <td className="p-3 text-slate-700">{r.plan} <span className="text-xs text-slate-500">· {t(r.billingCycle === 'annually' || r.billingCycle === 'yearly' ? 'Annually' : r.billingCycle === 'quarterly' ? 'Quarterly' : 'Monthly')}</span></td>
                <td className="p-3 text-right">{money(r.amount)}</td>
                <td className="p-3 text-slate-600">
                  {r.expiryDate ? new Date(r.expiryDate).toLocaleDateString() : '—'}
                  {r.status === 'active' && <span className="block text-xs text-slate-400">{r.daysRemaining} {t('days left')}</span>}
                </td>
                <td className="p-3"><span className={`px-2 py-0.5 text-[11px] font-semibold rounded-full ${STATUS_STYLE[r.status] || 'bg-slate-100 text-slate-600'}`}>{t(r.status)}</span></td>
                <td className="p-3 text-right whitespace-nowrap">
                  {['active', 'expired'].includes(r.status) && (
                    <>
                      <button type="button" disabled={busy === r.id} onClick={() => extend(r)} className="px-2.5 py-1 text-xs font-semibold text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-50 disabled:opacity-50">{t('Extend')}</button>{' '}
                      <button type="button" disabled={busy === r.id} onClick={() => cancel(r)} className="px-2.5 py-1 text-xs font-semibold text-red-700 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50">{t('Cancel')}</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
