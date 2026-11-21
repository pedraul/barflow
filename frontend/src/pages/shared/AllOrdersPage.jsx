import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { fetchOrders } from '../../api/endpoints'
import { useAuth } from '../../context/AuthContext'
import { usePreferences } from '../../context/PreferencesContext'
import { getOrderLocation } from '../../utils/orderDisplay'

const ACTIVE_STATUSES = ['Open', 'Preparing', 'Ready', 'Served']
const STATUS_TABS = [
  { key: 'active', label: 'Active' },
  { key: 'Open', label: 'Open' },
  { key: 'Preparing', label: 'Preparing' },
  { key: 'Ready', label: 'Ready' },
  { key: 'Served', label: 'Served' },
  { key: 'Paid', label: 'Paid' },
  { key: 'Cancelled', label: 'Cancelled' },
  { key: 'all', label: 'All' },
]
const PERIODS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Last 7 days' },
  { key: 'all', label: 'All time' },
]
const STATUS_STYLES = {
  Open: 'bg-sky-100 text-sky-800',
  Preparing: 'bg-amber-100 text-amber-800',
  Ready: 'bg-emerald-100 text-emerald-800',
  Served: 'bg-indigo-100 text-indigo-800',
  Paid: 'bg-slate-200 text-slate-800',
  Cancelled: 'bg-rose-100 text-rose-800',
}

const money = (v) => `RWF ${Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
const orderNo = (n) => `#${String(n ?? 0).padStart(3, '0')}`

function periodStart(period) {
  if (period === 'all') return null
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  if (period === 'week') d.setDate(d.getDate() - 6)
  return d.toISOString()
}

/**
 * Read-only, live view of every order in the user's branch.
 * Shared by waiters, kitchen and bar so everyone sees the full order flow.
 */
export default function AllOrdersPage({ eyebrow = 'Orders' }) {
  const { t } = usePreferences()
  const { user } = useAuth()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchParams] = useSearchParams()
  const requestedTab = searchParams.get('status')
  const isWaiter = String(user?.role || '').toLowerCase() === 'waiter'
  // Waiters get the full picture (every waiter's and QR customer's orders, every
  // status, paid included); kitchen and bar start on what still needs work.
  const defaultTab = isWaiter ? 'all' : 'active'
  const tab = STATUS_TABS.some((s) => s.key === requestedTab) ? requestedTab : defaultTab
  const resultsRef = useRef(null)
  const firstRender = useRef(true)
  const [period, setPeriod] = useState('today')
  const [search, setSearch] = useState('')
  const [mineOnly, setMineOnly] = useState(false)

  const load = useCallback(async () => {
    try {
      const params = {}
      const from = periodStart(period)
      if (from) params.from = from
      setOrders((await fetchOrders(params)) || [])
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => {
    setLoading(true)
    load()
    const interval = setInterval(load, 10000)
    return () => clearInterval(interval)
  }, [load])

  const counts = useMemo(() => {
    const c = { all: orders.length, active: 0 }
    for (const o of orders) {
      c[o.status] = (c[o.status] || 0) + 1
      if (ACTIVE_STATUSES.includes(o.status)) c.active += 1
    }
    return c
  }, [orders])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return orders.filter((o) => {
      if (tab === 'active' && !ACTIVE_STATUSES.includes(o.status)) return false
      if (tab !== 'active' && tab !== 'all' && o.status !== tab) return false
      if (mineOnly && o.waiterId !== user?.id) return false
      if (!q) return true
      const haystack = [
        orderNo(o.orderNumber), getOrderLocation(o), o.waiterName, o.source, o.station,
        ...(o.items || []).map((i) => i.name),
      ].join(' ').toLowerCase()
      return haystack.includes(q)
    })
  }, [orders, tab, search, mineOnly, user?.id])

  // When a status link is chosen, bring its orders into view (skip on first load).
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return }
    resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [tab])

  return (
    <div className="page all-orders-page">
      <div className="user-page-heading">
        <div>
          <p className="eyebrow">{t(eyebrow)}</p>
          <h1>{t('All Orders')}</h1>
          <p>{t('Every order in your branch, from waiters and QR customers. Updates automatically.')}</p>
        </div>
      </div>

      <nav className="order-status-links" aria-label={t('Order status')}>
        {STATUS_TABS.map((s) => {
          const active = tab === s.key
          return (
            <Link
              key={s.key}
              to={s.key === defaultTab ? '?' : `?status=${encodeURIComponent(s.key)}`}
              replace
              aria-current={active ? 'page' : undefined}
              className={`order-status-link${active ? ' is-active' : ''}`}
            >
              <span>{t(s.label)}</span>
              <span className="order-status-count">{counts[s.key] || 0}</span>
            </Link>
          )
        })}
      </nav>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('Search order #, table, waiter or item')}
            className="w-full rounded-lg border border-slate-300 py-2 pl-3 pr-3 text-sm"
          />
        </div>
        <select value={period} onChange={(e) => setPeriod(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          {PERIODS.map((p) => <option key={p.key} value={p.key}>{t(p.label)}</option>)}
        </select>
        {isWaiter && (
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
            {t('Only my orders')}
          </label>
        )}
        <button
          type="button"
          onClick={() => { setLoading(true); load() }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
        >
          {t('Refresh')}
        </button>
      </div>

      <div ref={resultsRef} className="order-results-anchor" />
      {error && <div className="subscription-lock" style={{ padding: 12 }}>{t('Error:')} {t(error)}</div>}

      {loading && orders.length === 0 ? (
        <div className="py-16 text-center text-slate-500">{t('Loading orders...')}</div>
      ) : visible.length === 0 ? (
        <div className="py-16 text-center text-slate-500">{t('No orders match these filters.')}</div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {visible.map((o) => (
            <div key={o.id} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <div className="text-xl font-bold text-slate-900">{orderNo(o.orderNumber)}</div>
                  <div className="text-sm font-medium text-slate-600">{getOrderLocation(o)}</div>
                </div>
                <span className={`rounded-md px-2 py-1 text-xs font-semibold ${STATUS_STYLES[o.status] || 'bg-slate-100 text-slate-700'}`}>
                  {t(o.status)}
                </span>
              </div>

              <div className="mb-2 flex flex-wrap gap-1.5 text-[11px] font-semibold uppercase tracking-wide">
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">{o.source === 'qr' ? t('QR') : t('Waiter')}</span>
                {o.station && <span className="rounded bg-orange-50 px-1.5 py-0.5 text-orange-700">{t(o.station)}</span>}
                {o.waiterName && <span className="rounded bg-blue-50 px-1.5 py-0.5 normal-case text-blue-700">{o.waiterName}</span>}
              </div>

              <ul className="mb-3 divide-y divide-slate-100 border-y border-slate-100 text-sm">
                {(o.items || []).map((item, idx) => (
                  <li key={`${item.productId}-${idx}`} className="flex justify-between py-1.5">
                    <span className="font-medium text-slate-800">{item.name}</span>
                    <span className="font-bold text-rose-600">{item.quantity}×</span>
                  </li>
                ))}
              </ul>

              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-slate-900">{money(o.total)}</span>
                <span className="text-xs text-slate-500">{o.createdAt}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
