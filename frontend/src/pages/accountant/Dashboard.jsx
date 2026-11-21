import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchAccountantSummary } from '../../api/endpoints'
import { usePreferences } from '../../context/PreferencesContext'

const money = (value) => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })
const compact = (value) => {
  const abs = Math.abs(value)
  if (abs >= 1e6) return `${(value / 1e6).toFixed(abs >= 1e7 ? 0 : 1)}M`
  if (abs >= 1e3) return `${(value / 1e3).toFixed(abs >= 1e4 ? 0 : 1)}K`
  return String(Math.round(value))
}

const PERIOD_OPTIONS = [
  { value: 'this_month', label: 'This Month', previous: 'vs last month' },
  { value: 'last_month', label: 'Last Month', previous: 'vs the month before' },
  { value: 'this_quarter', label: 'This Quarter', previous: 'vs last quarter' },
  { value: 'this_year', label: 'This Year', previous: 'vs last year' },
  { value: 'all', label: 'All Time', previous: '' },
]

const EXPENSE_COLORS = { stock: '#4f46e5', salaries: '#0ea5e9', transfers: '#f59e0b', other: '#94a3b8' }
// Colours for the expense categories the accountant records (rent, utilities...).
const EXTRA_COLORS = ['#10b981', '#ec4899', '#8b5cf6', '#ef4444', '#14b8a6', '#eab308', '#6366f1', '#f97316', '#84cc16', '#06b6d4', '#a855f7', '#64748b']
const colorFor = (key, index) => EXPENSE_COLORS[key] || EXTRA_COLORS[index % EXTRA_COLORS.length]
const KIND_LABELS = { payment: 'Payment received', refund: 'Refund', salary: 'Salary', transfer: 'Transfer', withdrawal: 'Withdrawal', expense: 'Expense' }

function PeriodSelect({ value, onChange, t, label }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 text-slate-700"
    >
      {PERIOD_OPTIONS.map((p) => <option key={p.value} value={p.value}>{t(p.label)}</option>)}
    </select>
  )
}

function KpiCard({ label, value, change, previousLabel, goodWhenUp = true, onClick, t, hint }) {
  const hasChange = change !== null && change !== undefined && previousLabel
  const up = hasChange && change > 0
  const good = hasChange && (change === 0 || (up ? goodWhenUp : !goodWhenUp))
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint ? t(hint) : undefined}
      className="w-full text-left bg-white p-4 rounded-xl border border-slate-200 shadow-sm transition hover:border-indigo-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
    >
      <div className="text-xs font-medium text-slate-500">{t(label)}</div>
      <div className={`text-xl font-bold mt-1 ${value < 0 ? 'text-rose-600' : 'text-slate-900'}`}>{money(value)} <span className="text-[11px] font-medium text-slate-400">RWF</span></div>
      <div className="text-[11px] font-medium mt-1 min-h-[16px]">
        {hasChange ? (
          <>
            <span className={good ? 'text-emerald-600' : 'text-rose-600'}>{change > 0 ? '+' : ''}{change}%</span>{' '}
            <span className="text-slate-400 font-normal">{t(previousLabel)}</span>
          </>
        ) : previousLabel && change === null ? (
          <span className="text-slate-400 font-normal">{t('No data for the previous period')}</span>
        ) : null}
      </div>
    </button>
  )
}

function CashFlowChart({ points, bucket, t }) {
  const [hover, setHover] = useState(null)
  const W = 640
  const H = 220
  const pad = { top: 12, right: 8, bottom: 26, left: 44 }
  const innerW = W - pad.left - pad.right
  const innerH = H - pad.top - pad.bottom

  const values = points.flatMap((p) => [p.revenue, p.expenses, p.netProfit])
  const rawMax = Math.max(0, ...values)
  const rawMin = Math.min(0, ...values)
  const niceStep = (range) => {
    if (range <= 0) return 1
    const exp = 10 ** Math.floor(Math.log10(range / 4))
    return [1, 2, 2.5, 5, 10].map((m) => m * exp).find((s) => range / s <= 4) || exp * 10
  }
  const step = niceStep(rawMax - rawMin || 1)
  const max = Math.ceil(rawMax / step) * step || step
  const min = Math.floor(rawMin / step) * step
  const ticks = []
  for (let v = min; v <= max + step / 2; v += step) ticks.push(v)
  const y = (v) => pad.top + innerH - ((v - min) / (max - min || 1)) * innerH
  const slot = innerW / Math.max(points.length, 1)
  const barW = Math.max(2, Math.min(14, slot * 0.32))
  const cx = (i) => pad.left + slot * i + slot / 2

  const label = (date) => {
    const d = new Date(`${date}T00:00:00`)
    if (bucket === 'month') return d.toLocaleDateString(undefined, { month: 'short' })
    return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' })
  }
  const every = Math.max(1, Math.ceil(points.length / 8))
  const linePath = points.map((p, i) => `${i ? 'L' : 'M'} ${cx(i).toFixed(1)} ${y(p.netProfit).toFixed(1)}`).join(' ')
  const hasData = points.some((p) => p.revenue || p.expenses)

  return (
    <div className="relative w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={t('Cash Flow Overview')}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.left} x2={W - pad.right} y1={y(v)} y2={y(v)} stroke={v === 0 ? '#cbd5e1' : '#eef2f7'} strokeWidth="1" />
            <text x={pad.left - 6} y={y(v) + 3} textAnchor="end" fontSize="10" fill="#94a3b8">{compact(v)}</text>
          </g>
        ))}
        {points.map((p, i) => (
          <g key={p.date} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <rect x={pad.left + slot * i} y={pad.top} width={slot} height={innerH} fill={hover === i ? 'rgba(99,102,241,0.06)' : 'transparent'} />
            {p.revenue > 0 && <rect x={cx(i) - barW - 1} y={y(p.revenue)} width={barW} height={Math.max(1, y(0) - y(p.revenue))} fill="#10b981" rx="2" />}
            {p.expenses > 0 && <rect x={cx(i) + 1} y={y(p.expenses)} width={barW} height={Math.max(1, y(0) - y(p.expenses))} fill="#f43f5e" rx="2" />}
            {i % every === 0 && (
              <text x={cx(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="#94a3b8">{label(p.date)}</text>
            )}
          </g>
        ))}
        {hasData && <path d={linePath} fill="none" stroke="#4f46e5" strokeWidth="2" strokeLinejoin="round" pointerEvents="none" />}
        {hasData && points.map((p, i) => (p.revenue || p.expenses) ? <circle key={p.date} cx={cx(i)} cy={y(p.netProfit)} r="3" fill="#4f46e5" pointerEvents="none" /> : null)}
      </svg>
      {!hasData && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-400 pointer-events-none">
          {t('No revenue or expenses in this period.')}
        </div>
      )}
      {hover !== null && points[hover] && (
        <div className="absolute top-0 right-0 bg-white border border-slate-200 rounded-lg shadow-md px-3 py-2 text-[11px] text-slate-700 space-y-0.5 pointer-events-none">
          <div className="font-semibold text-slate-900">{new Date(`${points[hover].date}T00:00:00`).toLocaleDateString(undefined, bucket === 'month' ? { month: 'long', year: 'numeric' } : { day: 'numeric', month: 'short', year: 'numeric' })}{bucket === 'week' ? ` (${t('week')})` : ''}</div>
          <div><span className="text-emerald-600">●</span> {t('Revenue')}: {money(points[hover].revenue)}</div>
          <div><span className="text-rose-500">●</span> {t('Expenses')}: {money(points[hover].expenses)}</div>
          <div><span className="text-indigo-600">●</span> {t('Net Profit')}: {money(points[hover].netProfit)}</div>
        </div>
      )}
    </div>
  )
}

function ExpenseDonut({ breakdown, t, onAdd }) {
  const total = breakdown?.total || 0
  const categories = (breakdown?.categories || []).map((c, i) => ({ ...c, color: colorFor(c.key, i) }))
  const R = 15.9155
  let offset = 0
  return (
    <div className="flex flex-col items-center gap-4 pt-2">
      <div className="relative w-36 h-36 shrink-0">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36" role="img" aria-label={t('Expense by Category')}>
          <circle cx="18" cy="18" r={R} fill="none" stroke="#e2e8f0" strokeWidth="5" />
          {total > 0 && categories.filter((c) => c.amount > 0).map((c) => {
            const share = (c.amount / total) * 100
            const el = (
              <circle
                key={c.key}
                cx="18" cy="18" r={R} fill="none"
                stroke={c.color}
                strokeWidth="5"
                strokeDasharray={`${share} ${100 - share}`}
                strokeDashoffset={-offset}
              >
                <title>{`${t(c.label)}: ${money(c.amount)} RWF (${c.share}%)`}</title>
              </circle>
            )
            offset += share
            return el
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-sm font-bold text-slate-800">{compact(total)}</span>
          <span className="text-[10px] text-slate-400">RWF</span>
        </div>
      </div>
      <div className="w-full space-y-2 text-xs">
        {categories.map((c) => (
          <div key={c.key} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 min-w-0 text-slate-700">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: c.color }} />
              <span className="truncate">{t(c.label)}</span>
            </span>
            <span className="shrink-0 text-right">
              <span className="font-semibold text-slate-800">{money(c.amount)}</span>
              <span className="text-slate-400 ml-1.5 inline-block w-11">{c.share}%</span>
            </span>
          </div>
        ))}
        {total === 0 && <p className="text-center text-slate-400 pt-1">{t('No expenses in this period.')}</p>}
        {onAdd && <button type="button" onClick={onAdd} className="block w-full text-center text-indigo-600 font-semibold hover:underline pt-1">{t('Add or import expenses')}</button>}
      </div>
    </div>
  )
}

export default function AccountantDashboard() {
  const { t } = usePreferences()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [period, setPeriod] = useState('this_month')
  const [cashFlowPeriod, setCashFlowPeriod] = useState('this_month')
  const [expensePeriod, setExpensePeriod] = useState('this_month')
  const requestId = useRef(0)

  const load = useCallback((silent = false) => {
    const id = ++requestId.current
    if (!silent) setLoading(true)
    return fetchAccountantSummary({ period, cashFlowPeriod, expensePeriod })
      .then((result) => {
        if (id !== requestId.current) return
        setData(result)
        setError('')
      })
      .catch((err) => {
        if (id !== requestId.current) return
        setError(err.response?.data?.error || err.message || t('Unable to load the dashboard.'))
      })
      .finally(() => { if (id === requestId.current) setLoading(false) })
  }, [period, cashFlowPeriod, expensePeriod, t])

  useEffect(() => {
    load()
    const timer = window.setInterval(() => load(true), 60000)
    return () => window.clearInterval(timer)
  }, [load])

  // Changing the main period moves both charts with it.
  const changePeriod = (value) => {
    setPeriod(value)
    setCashFlowPeriod(value)
    setExpensePeriod(value)
  }

  const previousLabel = PERIOD_OPTIONS.find((p) => p.value === period)?.previous || ''
  const unreconciled = data?.unreconciled || { unmatched: 0, inSystemOnly: 0, inStatementOnly: 0, total: 0 }
  const monthly = useMemo(() => (data?.monthlySummary || []).filter((m, i) => i === 0 || m.revenue || m.expenses), [data])

  if (!data) {
    return (
      <div className="flex-1 flex flex-col overflow-y-auto bg-slate-50">
        <main className="p-8 max-w-[1600px] mx-auto w-full">
          <p role={error ? 'alert' : undefined} style={{ textAlign: 'center', color: 'var(--text-4)', marginTop: '2rem' }}>
            {loading ? t('Loading dashboard…') : error || t('No dashboard data available.')}
          </p>
          {error && !loading && (
            <div className="text-center mt-3">
              <button type="button" onClick={() => load()} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold">{t('Try again')}</button>
            </div>
          )}
        </main>
      </div>
    )
  }

  const changes = data.changes || {}

  return (
    <div className="flex-1 flex flex-col overflow-y-auto bg-slate-50">
      <main className="p-4 md:p-8 space-y-6 max-w-[1600px] mx-auto w-full">

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-slate-900">{t('Accountant Dashboard')}</h1>
            <p className="text-xs text-slate-500">{t('Paid orders, money paid out and reconciliation status for your branch.')}</p>
          </div>
          <div className="flex items-center gap-2">
            {loading && <span className="text-xs text-slate-400">{t('Updating…')}</span>}
            <PeriodSelect value={period} onChange={changePeriod} t={t} label={t('Period')} />
          </div>
        </div>
        {error && <div role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}

        {/* KPI CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard t={t} label="Total Revenue" hint="Paid orders minus approved refunds" value={data.revenue} change={changes.revenue} previousLabel={previousLabel} onClick={() => navigate('/accountant/sales-revenue')} />
          <KpiCard t={t} label="Total Sales" hint="Paid orders before refunds" value={data.grossSales} change={changes.grossSales} previousLabel={previousLabel} onClick={() => navigate('/accountant/sales-revenue')} />
          <KpiCard t={t} label="VAT Total" value={data.vatTotal} change={changes.vatTotal} previousLabel={previousLabel} onClick={() => navigate('/accountant/taxes')} />
          <KpiCard t={t} label="Total Expenses" hint="Cost of stock sold, salaries paid, transfers sent and other expenses" value={data.expenses} change={changes.expenses} previousLabel={previousLabel} goodWhenUp={false} onClick={() => navigate('/accountant/reports?category=expenses')} />
          <KpiCard t={t} label="Net Profit" value={data.profit} change={changes.profit} previousLabel={previousLabel} onClick={() => navigate('/accountant/profit')} />
          <KpiCard t={t} label="Cash in Hand" hint="Cash sales minus refunds and cash adjustments (all time)" value={data.cashInHand} change={changes.cashInHand} previousLabel={previousLabel && 'since the start of the period'} onClick={() => navigate('/accountant/reconciliations?account=Cash%20Till')} />
          <KpiCard t={t} label="Bank & Mobile Money" hint="Mobile money and card sales minus salaries, transfers and withdrawals paid out (all time)" value={data.bankBalance} change={changes.bankBalance} previousLabel={previousLabel && 'since the start of the period'} onClick={() => navigate('/accountant/payments')} />
          <KpiCard t={t} label="Refunds" value={data.refunds} previousLabel="" onClick={() => navigate('/accountant/refunds')} />
        </div>

        {/* CHARTS */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3 min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-800 text-base">{t('Cash Flow Overview')}</h3>
                <div className="flex flex-wrap items-center gap-4 text-xs mt-2 text-slate-600">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-2 bg-emerald-500 rounded-sm"></span> {t('Revenue')}</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-2 bg-rose-500 rounded-sm"></span> {t('Expenses')}</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-indigo-600 rounded-full"></span> {t('Net Profit')}</span>
                </div>
              </div>
              <PeriodSelect value={cashFlowPeriod} onChange={setCashFlowPeriod} t={t} label={t('Cash flow period')} />
            </div>
            <CashFlowChart points={data.cashFlow?.points || []} bucket={data.cashFlow?.bucket} t={t} />
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-bold text-slate-800 text-base">{t('Expense by Category')}</h3>
              <PeriodSelect value={expensePeriod} onChange={setExpensePeriod} t={t} label={t('Expense period')} />
            </div>
            <ExpenseDonut breakdown={data.expenseBreakdown} t={t} onAdd={() => navigate('/accountant/expenses')} />
          </div>
        </div>

        {/* TRANSACTIONS & RECONCILIATION */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col justify-between min-w-0">
            <div>
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-bold text-slate-800 text-base">{t('Recent Transactions')}</h3>
                <button type="button" onClick={() => navigate('/accountant/reconciliations')} className="text-xs text-indigo-600 font-semibold hover:underline">{t('View All')}</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold uppercase tracking-wider">
                    <tr>
                      <th className="p-2 pl-5">{t('Date')}</th>
                      <th className="p-2">{t('Description')}</th>
                      <th className="p-2">{t('Type')}</th>
                      <th className="p-2 text-right">{t('Amount')}</th>
                      <th className="p-2">{t('Status')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                    {data.recentTransactions?.length ? data.recentTransactions.map((tx) => (
                      <tr key={tx.id}>
                        <td className="p-2 pl-5 text-slate-500 whitespace-nowrap">{tx.date ? new Date(tx.date).toLocaleDateString() : '—'}</td>
                        <td className="p-2 text-slate-900 font-semibold">{tx.description}</td>
                        <td className="p-2 whitespace-nowrap">{t(KIND_LABELS[tx.kind] || tx.kind)}{tx.method ? <span className="text-slate-400"> · {tx.method}</span> : null}</td>
                        <td className={`p-2 text-right whitespace-nowrap ${tx.amount < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{tx.amount > 0 ? '+' : ''}{money(tx.amount)}</td>
                        <td className="p-2">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold capitalize ${['received', 'approved', 'paid', 'completed'].includes(String(tx.status).toLowerCase()) ? 'bg-emerald-100 text-emerald-700' : ['rejected', 'failed'].includes(String(tx.status).toLowerCase()) ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                            {t(tx.status)}
                          </span>
                        </td>
                      </tr>
                    )) : (
                      <tr><td colSpan={5} className="p-4 text-center text-slate-400">{t('No recent transactions.')}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="p-4 bg-indigo-50/60 border-t border-indigo-100 flex flex-wrap gap-2 items-center justify-between text-xs text-indigo-900">
              <span><strong>{t('Reconciliation Status:')}</strong> {unreconciled.total === 0 ? t('Everything is reconciled.') : `${t('You have')} ${unreconciled.total} ${t('unreconciled transactions')}`}</span>
              <button type="button" onClick={() => navigate('/accountant/reconciliations')} className="px-3 py-1 bg-white border border-indigo-200 rounded-lg text-indigo-600 font-semibold hover:bg-indigo-50 transition">
                {t('Go to Reconciliation')}
              </button>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4 min-w-0">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-base">{t('Unreconciled Items')}</h3>
              <button type="button" onClick={() => navigate('/accountant/reconciliations?status=unreconciled')} className="text-xs text-indigo-600 font-semibold hover:underline">{t('View All')}</button>
            </div>
            <div className="space-y-3 text-xs">
              {[
                { key: 'unmatched', label: 'Amount differences', status: 'Unmatched', box: 'bg-rose-50/50 border-rose-100', badge: 'bg-rose-100 text-rose-700' },
                { key: 'inSystemOnly', label: 'In System Only', status: 'In System Only', box: 'bg-amber-50/50 border-amber-100', badge: 'bg-amber-100 text-amber-700' },
                { key: 'inStatementOnly', label: 'In Statement Only', status: 'In Statement Only', box: 'bg-indigo-50/50 border-indigo-100', badge: 'bg-indigo-100 text-indigo-700' },
              ].map((row) => (
                <button
                  key={row.key}
                  type="button"
                  onClick={() => navigate(`/accountant/reconciliations?status=${encodeURIComponent(row.status)}`)}
                  className={`w-full flex items-center justify-between p-3 rounded-xl border text-left hover:shadow-sm transition ${row.box}`}
                >
                  <span className="font-medium text-slate-700">{t(row.label)}</span>
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${row.badge}`}>{unreconciled[row.key] || 0}</span>
                </button>
              ))}
            </div>
            <div className="pt-2 flex items-center justify-between text-xs font-bold text-slate-800 border-t border-slate-100">
              <span>{t('Total Unreconciled')}</span>
              <span className="text-indigo-600 text-sm">{unreconciled.total}</span>
            </div>
            {unreconciled.total === 0 ? (
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-900 text-xs">
                <div className="font-bold">{t('All Accounts Balanced')}</div>
                <div className="text-[11px] text-emerald-700">{t('Every transaction is matched.')}</div>
              </div>
            ) : (
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-xs">
                <div className="font-bold">{t('Reconciliation needed')}</div>
                <div className="text-[11px] text-amber-800">
                  {unreconciled.statementLines ? t('Match the remaining items with your statements.') : t('Upload a bank or mobile money statement, or confirm cash items, to reconcile.')}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* MONTHLY & TAX */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4 min-w-0">
            <h3 className="font-bold text-slate-800 text-sm">{t('Monthly Summary')}</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-slate-400 font-semibold border-b border-slate-100">
                  <tr>
                    <th className="pb-2">{t('Month')}</th>
                    <th className="pb-2 text-right">{t('Revenue')}</th>
                    <th className="pb-2 text-right">{t('Expenses')}</th>
                    <th className="pb-2 text-right">{t('Net Profit')}</th>
                    <th className="pb-2 text-right">{t('Margin')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {monthly.length ? monthly.map((row) => (
                    <tr key={row.month}>
                      <td className="py-2.5 text-slate-900 font-semibold">{new Date(`${row.month}-01T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</td>
                      <td className="py-2.5 text-right">{money(row.revenue)}</td>
                      <td className="py-2.5 text-right">{money(row.expenses)}</td>
                      <td className={`py-2.5 text-right ${row.netProfit < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{money(row.netProfit)}</td>
                      <td className={`py-2.5 text-right font-bold ${row.margin != null && row.margin < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{row.margin == null ? '—' : `${row.margin}%`}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={5} className="py-2.5 text-center text-slate-400">{t('No monthly data yet.')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => navigate('/accountant/reports')} className="text-xs text-indigo-600 font-semibold hover:underline mr-2">{t('View Full Report')}</button>
              {[
                ['sales', 'Revenue'], ['expenses', 'Expenses'], ['transfers', 'Transfers'], ['refunds', 'Refunds'], ['payroll', 'Payrolls'],
              ].map(([category, label]) => (
                <button key={category} type="button" onClick={() => navigate(`/accountant/reports?category=${category}`)} className="text-xs text-slate-600 border border-slate-200 rounded-lg px-3 py-1.5 hover:border-indigo-300">{t(label)}</button>
              ))}
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4 min-w-0">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-sm">{t('Tax Summary')}</h3>
              <button type="button" onClick={() => navigate('/accountant/taxes')} className="text-xs text-indigo-600 font-semibold hover:underline">{t('View Details')}</button>
            </div>
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">{t('VAT Collected (Output)')}</span>
                <span className="font-bold text-slate-800">{money(data.taxSummary?.vatCollected)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">{t('VAT Paid (Input)')}</span>
                <span className="font-semibold text-slate-400">{data.taxSummary?.vatPaid == null ? t('Not recorded') : money(data.taxSummary.vatPaid)}</span>
              </div>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="font-bold text-rose-600">{t('VAT Payable')}</span>
                <span className="font-bold text-rose-600 text-sm">{money(data.taxSummary?.vatPayable)}</span>
              </div>
              <p className="text-[11px] text-slate-400">{t('For the selected period. Input VAT on purchases is not recorded, so the full output VAT is shown as payable.')}</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
