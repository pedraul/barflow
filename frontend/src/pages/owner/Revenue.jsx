import React, { useEffect, useState, useCallback, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { X } from 'lucide-react'
import { orderTableText, orderWaiterText } from '../../components/OrderTableHeading'
import { useOwner } from '../../context/OwnerContext'
import { usePreferences } from '../../context/PreferencesContext'
import OrderStatusBadge from '../../components/OrderStatusBadge'

const fmt = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'RWF', minimumFractionDigits: 0 }).format(v || 0)

const PAYMENT_METHOD_LABELS = {
  cash: 'Cash',
  pos: 'POS / Card',
  card: 'POS / Card',
  mtn_momo: 'MTN Mobile Money',
  momo: 'MTN Mobile Money',
  mtn: 'MTN Mobile Money',
  airtel_money: 'Airtel Money',
  airtel: 'Airtel Money',
  qr: 'QR Payment',
  bank: 'Bank transfer',
  unknown: 'Not recorded',
}
const paymentMethodLabel = (method) => {
  const key = String(method || 'unknown').trim().toLowerCase()
  return PAYMENT_METHOD_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export default function OwnerRevenue() {
  const { t } = usePreferences()
  const [revenue, setRevenue] = useState(null)
  const [logs, setLogs] = useState([])
  const [logSummary, setLogSummary] = useState(null)
  const [loading, setLoading] = useState(false)
  const [revenueLoading, setRevenueLoading] = useState(true)
  const [revenueError, setRevenueError] = useState('')
  const [viewLogs, setViewLogs] = useState(false)
  const { fetchRevenue, fetchRevenueLogs, fetchRevenueDetails, activeBranchId } = useOwner()
  const [searchParams] = useSearchParams()
  const activeView = searchParams.get('view') || ''
  const [details, setDetails] = useState(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [detailsError, setDetailsError] = useState('')
  const detailsRef = useRef(null)

  useEffect(() => {
    if (!activeView) { setDetails(null); return undefined }
    let active = true
    setDetails(null)
    setDetailsError('')
    setDetailsLoading(true)
    fetchRevenueDetails(activeView)
      .then((data) => { if (active) setDetails(data) })
      .catch((e) => { if (active) setDetailsError(e.message || t('Unable to load details.')) })
      .finally(() => { if (active) setDetailsLoading(false) })
    return () => { active = false }
  }, [activeView, activeBranchId, fetchRevenueDetails])

  useEffect(() => {
    if (activeView) detailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [activeView, revenue])

  const loadData = useCallback(async () => {
    setRevenueLoading(true)
    setRevenueError('')
    try {
      const data = await fetchRevenue()
      setRevenue(data)
    } catch (e) {
      console.error('Failed to load owner revenue:', e)
      setRevenue(null)
      setRevenueError(e.message || t('Unable to load revenue. Please try again.'))
    } finally {
      setRevenueLoading(false)
    }
  }, [fetchRevenue])

  useEffect(() => { loadData() }, [loadData, activeBranchId])

  const loadLogs = async () => {
    setViewLogs(!viewLogs)
    if (!viewLogs) {
      setLoading(true)
      try {
        const res = await fetchRevenueLogs()
        setLogs(res.logs || [])
        setLogSummary({
          byMethod: res.byMethod || [],
          totalPaid: res.totalPaid || 0,
          refunds: res.refunds || 0,
          netReceived: res.netReceived || 0,
        })
      } catch (e) { /* ignore */ }
      finally { setLoading(false) }
    }
  }

  const cards = revenue ? [
    { view: 'received', label: 'Revenue Received', value: fmt(revenue.revenueReceived), hint: 'Paid orders only' },
    {
      view: 'awaiting',
      label: 'Revenue Awaiting Payment',
      value: fmt(revenue.revenueAwaiting?.value),
      hint: `${revenue.revenueAwaiting?.orders || 0} ${t('unpaid order(s)')}`,
      accent: 'bg-amber-500',
    },
    { view: 'stock', label: 'Stock Items Available', value: revenue.stockAvailable?.items || 0 },
    { view: 'pending', label: 'Orders Pending', value: revenue.stockOrdered?.orders || 0 },
    { view: 'stock-value', label: 'Current Stock Value', value: fmt(revenue.currentStockValue) },
    { view: 'sold', label: 'Value of Sold Stock', value: fmt(revenue.soldStockValue) },
  ] : []
  const activeCard = cards.find((c) => c.view === activeView)


  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto w-full">
      <div className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">{t('Owner workspace')}</p>
          <h1 className="text-2xl font-extrabold text-slate-900">{t('Revenue Overview')}</h1>
          <p className="text-sm text-slate-500">{t('Revenue received, stock available, stock ordered and the value of sold stock.')}</p>
        </div>
      </div>

      <Link
        to="/owner/stock"
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border-2 border-indigo-600 bg-indigo-50 p-5 transition hover:bg-indigo-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-700">{t('Stock & Value')}</p>
          <p className="text-lg font-extrabold text-slate-900">
            {revenue
              ? `${revenue.stockAvailable?.items || 0} ${t('items in stock')} · ${fmt(revenue.currentStockValue)}`
              : t('See every item in stock and its current value')}
          </p>
          <p className="text-sm text-slate-600">{t('Read-only list of items, quantities, prices and value.')}</p>
        </div>
        <span
          className="shrink-0 self-start sm:self-center rounded-lg px-5 py-2.5 text-sm font-bold shadow-sm"
          style={{ backgroundColor: '#047857', color: '#ffffff' }}
        >
          {t('View stock & value')}
        </span>
      </Link>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {revenueError && (
          <p className="col-span-full rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
            {revenueError}{' '}
            <button type="button" onClick={loadData} className="font-semibold underline">{t('Retry')}</button>
          </p>
        )}
        {revenueLoading && !revenue && <p className="col-span-full text-sm text-slate-500">{t('Loading revenue…')}</p>}
        {cards.map((c) => {
          const isActive = c.view === activeView
          return (
            <Link
              key={c.view}
              to={{ search: isActive ? '' : `?view=${c.view}` }}
              aria-current={isActive ? 'true' : undefined}
              className={`block bg-white border rounded-xl shadow-sm p-5 relative overflow-hidden transition hover:shadow-md hover:border-indigo-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${isActive ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-slate-200'}`}
            >
              <div className={`absolute left-0 top-0 bottom-0 w-1 ${c.accent || 'bg-indigo-600'} rounded-r`}></div>
              <strong className="block text-2xl font-extrabold text-slate-900 tracking-tight">{c.value}</strong>
              <span className="block text-slate-500 text-sm font-medium">{t(c.label)}</span>
              {c.hint && <span className="block text-xs text-slate-400 mt-0.5">{t(c.hint)}</span>}
              <span className="block text-xs font-semibold text-indigo-600 mt-2">{isActive ? t('Hide details') : t('View details')}</span>
            </Link>
          )
        })}
      </div>

      {activeCard && (
        <section ref={detailsRef} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden" aria-live="polite">
          <div className="flex items-center justify-between gap-3 p-4 sm:p-6 border-b border-slate-100">
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-slate-900">{t(activeCard.label)}</h2>
              <p className="text-sm text-slate-500">{activeCard.value}</p>
            </div>
            <Link to={{ search: '' }} aria-label={t('Close')} title={t('Close')} className="shrink-0 rounded-full p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"><X size={20} /></Link>
          </div>
          <div className="p-4 sm:p-6">
            {detailsLoading && <p className="text-sm text-slate-500">{t('Loading…')}</p>}
            {detailsError && <p className="text-sm text-red-700" role="alert">{detailsError}</p>}
            {!detailsLoading && !detailsError && details && <RevenueDetailsTable details={details} t={t} />}
          </div>
        </section>
      )}

      <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <button
          type="button"
          className="flex w-full justify-between items-center gap-4 p-6 text-left hover:bg-slate-50 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500"
          onClick={loadLogs}
          aria-expanded={viewLogs}
          aria-controls="revenue-log-details"
        >
          <span role="heading" aria-level="2" className="text-lg font-bold text-slate-900">{t('Revenue Logs')}</span>
          <span className="inline-flex shrink-0 items-center gap-2 text-slate-700 bg-white border border-slate-300 px-4 py-2 rounded-lg font-semibold text-sm">
            {viewLogs ? t('Hide Logs') : t('View Logs')}
          </span>
        </button>
        {viewLogs && (
          <div id="revenue-log-details" className="px-6 pb-6">
          {logSummary && (
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap gap-2">
                {(logSummary.byMethod || []).map((m) => (
                  <div key={m.method} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t(paymentMethodLabel(m.method))}</p>
                    <p className="text-base font-extrabold text-slate-900">{fmt(m.amount)}</p>
                    <p className="text-[11px] text-slate-500">{m.orders} {t('order(s)')}</p>
                  </div>
                ))}
              </div>
              <p className="text-sm text-slate-600">
                {t('Total paid')}: <strong className="text-slate-900">{fmt(logSummary.totalPaid)}</strong>
                {logSummary.refunds > 0 && (
                  <>
                    {' · '}{t('Refunds')}: <strong className="text-red-700">−{fmt(logSummary.refunds)}</strong>
                    {' · '}{t('Net received')}: <strong className="text-emerald-700">{fmt(logSummary.netReceived)}</strong>
                  </>
                )}
              </p>
            </div>
          )}
          {logs.length === 0 ? <p className="text-slate-400 mt-4">{t('No payments recorded yet.')}</p> : (
            <div className="border border-slate-200 rounded-lg overflow-x-auto mt-4">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-2 border-b border-slate-200 text-left">{t('Table')}</th>
                    <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-2 border-b border-slate-200 text-left">{t('Order')}</th>
                    <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-2 border-b border-slate-200 text-left">{t('Payment method')}</th>
                    <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-2 border-b border-slate-200 text-right">{t('Amount paid')}</th>
                    <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-2 border-b border-slate-200 text-right">{t('Paid on')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-indigo-50">
                      <td className="p-2">
                        <div className="font-extrabold text-slate-900 uppercase tracking-wide">{orderTableText(log, t)}</div>
                        {orderWaiterText(log, t) && <div className="text-[10px] font-semibold text-slate-500">{orderWaiterText(log, t)}</div>}
                      </td>
                      <td className="p-2 font-semibold text-slate-900">{log.orderNumber || '—'}</td>
                      <td className="p-2">
                        <span className="inline-block rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-bold text-slate-700">
                          {t(paymentMethodLabel(log.paymentMethod))}
                        </span>
                      </td>
                      <td className="p-2 text-right font-extrabold text-slate-900">{fmt(log.amount)}</td>
                      <td className="p-2 text-right text-slate-500">{new Date(log.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          </div>
        )}
      </section>

      {loading && <p className="text-center text-slate-400">{t('Loading…')}</p>}
    </div>
  )
}

function RevenueDetailsTable({ details, t }) {
  const rows = details.rows || []
  if (rows.length === 0) return <p className="text-sm text-slate-400">{t('No records found.')}</p>

  const th = 'bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-2 border-b border-slate-200'
  let head
  let body
  if (details.kind === 'orders') {
    head = (
      <tr>
        <th className={`${th} text-left`}>{t('Table')}</th>
        <th className={`${th} text-left`}>{t('Order')}</th>
        <th className={`${th} text-left`}>{t('Status')}</th>
        <th className={`${th} text-left`}>{t('Payment')}</th>
        <th className={`${th} text-left`}>{t('Branch')}</th>
        <th className={`${th} text-right`}>{t('Amount')}</th>
        <th className={`${th} text-right`}>{t('Date')}</th>
      </tr>
    )
    body = rows.map((o) => (
      <tr key={o.id} className="hover:bg-indigo-50">
        <td className="p-2 font-extrabold text-slate-900 uppercase tracking-wide">{orderTableText(o, t)}</td>
        <td className="p-2 font-semibold text-slate-900">{o.orderNumber}</td>
        <td className="p-2"><OrderStatusBadge status={o.status} /></td>
        <td className="p-2 text-slate-600">{o.paymentMethod || t('Not paid')}</td>
        <td className="p-2 text-slate-600">{o.branchName || '—'}</td>
        <td className="p-2 text-right font-semibold text-slate-900">{fmt(o.total)}</td>
        <td className="p-2 text-right text-slate-400">{new Date(o.createdAt).toLocaleDateString()}</td>
      </tr>
    ))
  } else if (details.kind === 'stock') {
    head = (
      <tr>
        <th className={`${th} text-left`}>{t('Item')}</th>
        <th className={`${th} text-left`}>{t('Branch')}</th>
        <th className={`${th} text-right`}>{t('Quantity')}</th>
        <th className={`${th} text-right`}>{t('Cost price')}</th>
        <th className={`${th} text-right`}>{t('Value')}</th>
      </tr>
    )
    body = rows.map((r) => (
      <tr key={r.id} className="hover:bg-indigo-50">
        <td className="p-2 font-semibold text-slate-900">{r.name}</td>
        <td className="p-2 text-slate-600">{r.branchName || '—'}</td>
        <td className="p-2 text-right text-slate-700">{r.quantity}</td>
        <td className="p-2 text-right text-slate-700">{fmt(r.costPrice)}</td>
        <td className="p-2 text-right font-semibold text-slate-900">{fmt(r.value)}</td>
      </tr>
    ))
  } else {
    head = (
      <tr>
        <th className={`${th} text-left`}>{t('Item')}</th>
        <th className={`${th} text-right`}>{t('Quantity sold')}</th>
        <th className={`${th} text-right`}>{t('Price')}</th>
        <th className={`${th} text-right`}>{t('Value')}</th>
      </tr>
    )
    body = rows.map((r) => (
      <tr key={r.id} className="hover:bg-indigo-50">
        <td className="p-2 font-semibold text-slate-900">{r.name}</td>
        <td className="p-2 text-right text-slate-700">{r.quantity}</td>
        <td className="p-2 text-right text-slate-700">{fmt(r.price)}</td>
        <td className="p-2 text-right font-semibold text-slate-900">{fmt(r.value)}</td>
      </tr>
    ))
  }

  return (
    <div className="border border-slate-200 rounded-lg overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>{head}</thead>
        <tbody className="divide-y divide-slate-100">{body}</tbody>
      </table>
    </div>
  )
}
