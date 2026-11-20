import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { fetchShiftPerformance, fetchShifts } from '../../api/endpoints'
import { useAuth } from '../../context/AuthContext'
import { useOwner } from '../../context/OwnerContext'
import { usePreferences } from '../../context/PreferencesContext'
import { formatDuration } from '../../components/ShiftControl'

const ROLES = ['', 'Manager', 'Accountant', 'Waiter', 'Kitchen', 'Bar', 'Operator']
const PERIODS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Last 7 days' },
  { key: 'month', label: 'Last 30 days' },
  { key: 'custom', label: 'Custom range' },
]

const money = (v) => `RWF ${Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
const dateTime = (iso) => (iso ? new Date(iso).toLocaleString() : '—')
const toInputDate = (d) => d.toISOString().slice(0, 10)

function rangeFor(period, customFrom, customTo) {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  if (period === 'custom') {
    const range = {}
    if (customFrom) range.from = new Date(`${customFrom}T00:00:00`).toISOString()
    if (customTo) {
      const end = new Date(`${customTo}T00:00:00`)
      end.setDate(end.getDate() + 1)
      range.to = end.toISOString()
    }
    return range
  }
  if (period === 'week') start.setDate(start.getDate() - 6)
  if (period === 'month') start.setDate(start.getDate() - 29)
  return { from: start.toISOString() }
}

/** Owner / Manager view of staff shifts and per-worker performance. */
export default function ShiftsPage() {
  const { t } = usePreferences()
  const { user } = useAuth()
  const { activeBranchId } = useOwner()
  const isOwner = String(user?.role || '').toLowerCase() === 'owner'

  const [period, setPeriod] = useState('week')
  const [customFrom, setCustomFrom] = useState(toInputDate(new Date(Date.now() - 6 * 864e5)))
  const [customTo, setCustomTo] = useState(toInputDate(new Date()))
  const [role, setRole] = useState('')
  const [staffId, setStaffId] = useState('')
  const [performance, setPerformance] = useState([])
  const [shifts, setShifts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = { ...rangeFor(period, customFrom, customTo) }
      if (role) params.role = role
      if (isOwner && activeBranchId && activeBranchId !== 'all') params.branchId = activeBranchId
      const [perf, list] = await Promise.all([
        fetchShiftPerformance(params),
        fetchShifts({ ...params, ...(staffId ? { userId: staffId } : {}) }),
      ])
      setPerformance(perf || [])
      setShifts(list || [])
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [period, customFrom, customTo, role, staffId, isOwner, activeBranchId])

  useEffect(() => {
    load()
    const interval = setInterval(load, 60000)
    return () => clearInterval(interval)
  }, [load])

  const totals = useMemo(() => performance.reduce((acc, p) => ({
    staff: acc.staff + 1,
    onShift: acc.onShift + (p.onShift ? 1 : 0),
    minutes: acc.minutes + p.totalMinutes,
    shifts: acc.shifts + p.shiftsCount,
    orders: acc.orders + p.ordersCount,
    sales: acc.sales + p.salesTotal,
  }), { staff: 0, onShift: 0, minutes: 0, shifts: 0, orders: 0, sales: 0 }), [performance])

  const th = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'
  const td = 'px-3 py-2 text-sm text-slate-800 whitespace-nowrap'

  return (
    <div className="page shifts-page">
      <div className="user-page-heading">
        <div>
          <p className="eyebrow">{t(isOwner ? 'Owner workspace' : 'Manager workspace')}</p>
          <h1>{t('Shifts & Performance')}</h1>
          <p>{t('Track when staff start and end their shifts, and how each worker performs during them.')}</p>
        </div>
      </div>

      <div className="shifts-filters mb-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-600">{t('Period')}</span>
          <select value={period} onChange={(e) => setPeriod(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2">
            {PERIODS.map((p) => <option key={p.key} value={p.key}>{t(p.label)}</option>)}
          </select>
        </label>
        {period === 'custom' && (
          <>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-600">{t('From')}</span>
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-600">{t('To')}</span>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2" />
            </label>
          </>
        )}
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-600">{t('Role')}</span>
          <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2">
            {ROLES.map((r) => <option key={r} value={r}>{r ? t(r) : t('All roles')}</option>)}
          </select>
        </label>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> {t('Refresh')}
        </button>
      </div>

      {error && <div className="subscription-lock" style={{ padding: 12 }}>{t('Error:')} {t(error)}</div>}

      <div className="shifts-stats mb-6 grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        {[
          ['Staff worked', totals.staff],
          ['On shift now', totals.onShift],
          ['Shifts', totals.shifts],
          ['Hours worked', formatDuration(totals.minutes)],
          ['Orders taken', totals.orders],
          ['Order value', money(totals.sales)],
        ].map(([label, value]) => (
          <div key={label} className="shifts-stat rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="shifts-stat-label text-xs font-semibold uppercase tracking-wide text-slate-500">{t(label)}</div>
            <div className="shifts-stat-value mt-1 text-xl font-bold text-slate-900">{value}</div>
          </div>
        ))}
      </div>

      <h2 className="shifts-section-title mb-2 text-lg font-semibold text-slate-900">{t('Performance by worker')}</h2>
      <div className="shifts-mobile-list mb-8">
        {performance.length === 0 ? (
          <div className="shifts-empty">{loading ? t('Loading...') : t('No shifts recorded in this period.')}</div>
        ) : performance.map((p) => (
          <article key={p.userId} className={`shifts-card${staffId === p.userId ? ' is-selected' : ''}`}>
            <header className="shifts-card-head">
              <div className="min-w-0">
                <div className="shifts-card-name">{p.userName}</div>
                <div className="shifts-card-sub">{t(p.role)}{isOwner && p.branchName ? ` · ${p.branchName}` : ''}</div>
              </div>
              {p.onShift
                ? <span className="shifts-badge is-on">{t('On shift')}</span>
                : <span className="shifts-badge">{t('Off')}</span>}
            </header>
            <dl className="shifts-card-grid">
              <div><dt>{t('Shifts')}</dt><dd>{p.shiftsCount}</dd></div>
              <div><dt>{t('Total time')}</dt><dd>{formatDuration(p.totalMinutes)}</dd></div>
              <div><dt>{t('Avg shift')}</dt><dd>{formatDuration(p.avgShiftMinutes)}</dd></div>
              <div><dt>{t('Orders taken')}</dt><dd>{p.ordersCount}</dd></div>
              <div><dt>{t('Orders / hour')}</dt><dd>{p.ordersPerHour}</dd></div>
              <div><dt>{t('Order value')}</dt><dd>{money(p.salesTotal)}</dd></div>
              <div><dt>{t('Orders prepared')}</dt><dd>{p.ordersPrepared}</dd></div>
              <div><dt>{t('Actions')}</dt><dd>{p.activityCount}</dd></div>
            </dl>
            <button
              type="button"
              onClick={() => setStaffId(staffId === p.userId ? '' : p.userId)}
              className="shifts-card-action"
            >
              {staffId === p.userId ? t('Show all') : t('View shifts')}
            </button>
          </article>
        ))}
      </div>

      <div className="shifts-desktop-table mb-8 overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className={th}>{t('Worker')}</th>
              <th className={th}>{t('Role')}</th>
              {isOwner && <th className={th}>{t('Branch')}</th>}
              <th className={th}>{t('Status')}</th>
              <th className={th}>{t('Shifts')}</th>
              <th className={th}>{t('Total time')}</th>
              <th className={th}>{t('Avg shift')}</th>
              <th className={th}>{t('Orders taken')}</th>
              <th className={th}>{t('Orders / hour')}</th>
              <th className={th}>{t('Order value')}</th>
              <th className={th}>{t('Orders prepared')}</th>
              <th className={th}>{t('Actions')}</th>
              <th className={th} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {performance.length === 0 ? (
              <tr><td colSpan={13} className="px-3 py-8 text-center text-sm text-slate-500">{loading ? t('Loading...') : t('No shifts recorded in this period.')}</td></tr>
            ) : performance.map((p) => (
              <tr key={p.userId} className={staffId === p.userId ? 'bg-blue-50' : undefined}>
                <td className={`${td} font-semibold`}>{p.userName}</td>
                <td className={`${td} capitalize`}>{t(p.role)}</td>
                {isOwner && <td className={td}>{p.branchName || '—'}</td>}
                <td className={td}>
                  {p.onShift
                    ? <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">{t('On shift')}</span>
                    : <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{t('Off')}</span>}
                </td>
                <td className={td}>{p.shiftsCount}</td>
                <td className={td}>{formatDuration(p.totalMinutes)}</td>
                <td className={td}>{formatDuration(p.avgShiftMinutes)}</td>
                <td className={td}>{p.ordersCount}</td>
                <td className={td}>{p.ordersPerHour}</td>
                <td className={td}>{money(p.salesTotal)}</td>
                <td className={td}>{p.ordersPrepared}</td>
                <td className={td}>{p.activityCount}</td>
                <td className={td}>
                  <button
                    type="button"
                    onClick={() => setStaffId(staffId === p.userId ? '' : p.userId)}
                    className="text-xs font-semibold text-blue-600 hover:underline"
                  >
                    {staffId === p.userId ? t('Show all') : t('View shifts')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="shifts-section-title mb-2 text-lg font-semibold text-slate-900">
        {t('Shift log')}
        {staffId && <span className="ml-2 text-sm font-normal text-slate-500">({performance.find((p) => p.userId === staffId)?.userName})</span>}
      </h2>
      <div className="shifts-mobile-list">
        {shifts.length === 0 ? (
          <div className="shifts-empty">{loading ? t('Loading...') : t('No shifts recorded in this period.')}</div>
        ) : shifts.map((s) => (
          <article key={s.id} className="shifts-card">
            <header className="shifts-card-head">
              <div className="min-w-0">
                <div className="shifts-card-name">{s.userName}</div>
                <div className="shifts-card-sub">{t(s.role)}{isOwner && s.branchName ? ` · ${s.branchName}` : ''}</div>
              </div>
              {s.isOpen
                ? <span className="shifts-badge is-on">{t('In progress')}</span>
                : <span className="shifts-badge">{formatDuration(s.durationMinutes)}</span>}
            </header>
            <div className="shifts-card-times">
              <div><span>{t('Started')}</span><strong>{dateTime(s.startedAt)}</strong></div>
              <div><span>{t('Ended')}</span><strong>{s.isOpen ? '—' : dateTime(s.endedAt)}</strong></div>
            </div>
            <dl className="shifts-card-grid">
              <div><dt>{t('Duration')}</dt><dd>{formatDuration(s.durationMinutes)}</dd></div>
              <div><dt>{t('Orders')}</dt><dd>{s.ordersCount}</dd></div>
              <div><dt>{t('Order value')}</dt><dd>{money(s.salesTotal)}</dd></div>
              <div><dt>{t('Prepared')}</dt><dd>{s.ordersPrepared}</dd></div>
              <div><dt>{t('Actions')}</dt><dd>{s.activityCount}</dd></div>
            </dl>
            {s.endNote && (
              <p className="shifts-card-note"><span>{t('Handover note')}</span>{s.endNote}</p>
            )}
          </article>
        ))}
      </div>

      <div className="shifts-desktop-table overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className={th}>{t('Worker')}</th>
              <th className={th}>{t('Role')}</th>
              {isOwner && <th className={th}>{t('Branch')}</th>}
              <th className={th}>{t('Started')}</th>
              <th className={th}>{t('Ended')}</th>
              <th className={th}>{t('Duration')}</th>
              <th className={th}>{t('Orders')}</th>
              <th className={th}>{t('Order value')}</th>
              <th className={th}>{t('Prepared')}</th>
              <th className={th}>{t('Actions')}</th>
              <th className={th}>{t('Handover note')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shifts.length === 0 ? (
              <tr><td colSpan={11} className="px-3 py-8 text-center text-sm text-slate-500">{loading ? t('Loading...') : t('No shifts recorded in this period.')}</td></tr>
            ) : shifts.map((s) => (
              <tr key={s.id}>
                <td className={`${td} font-semibold`}>{s.userName}</td>
                <td className={`${td} capitalize`}>{t(s.role)}</td>
                {isOwner && <td className={td}>{s.branchName || '—'}</td>}
                <td className={td}>{dateTime(s.startedAt)}</td>
                <td className={td}>
                  {s.isOpen
                    ? <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">{t('In progress')}</span>
                    : dateTime(s.endedAt)}
                </td>
                <td className={td}>{formatDuration(s.durationMinutes)}</td>
                <td className={td}>{s.ordersCount}</td>
                <td className={td}>{money(s.salesTotal)}</td>
                <td className={td}>{s.ordersPrepared}</td>
                <td className={td}>{s.activityCount}</td>
                <td className="max-w-xs px-3 py-2 text-sm text-slate-600">{s.endNote || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
