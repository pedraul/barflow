import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchAccountantSummary } from '../../api/endpoints'
import { usePreferences } from '../../context/PreferencesContext'

const money = (value) => `${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} RWF`

const PERIODS = [
  ['this_month', 'This Month'],
  ['last_month', 'Last Month'],
  ['this_quarter', 'This Quarter'],
  ['this_year', 'This Year'],
  ['all', 'All Time'],
]

export default function Profit() {
  const { t } = usePreferences()
  const navigate = useNavigate()
  const [period, setPeriod] = useState('this_month')
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    fetchAccountantSummary({ period })
      .then((data) => { if (active) { setSummary(data); setError('') } })
      .catch((err) => { if (active) setError(err.response?.data?.error || err.message || t('Unable to load financial data.')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [period, t])

  const figures = useMemo(() => {
    const revenue = Number(summary?.revenue) || 0
    const profit = Number(summary?.profit) || 0
    return {
      grossSales: Number(summary?.grossSales) || 0,
      refunds: Number(summary?.refunds) || 0,
      revenue,
      costOfGoods: Number(summary?.costOfGoods) || 0,
      salaries: Number(summary?.salaries) || 0,
      transfers: Number(summary?.transfers) || 0,
      otherExpenses: Number(summary?.otherExpenses) || 0,
      expenses: Number(summary?.expenses) || 0,
      profit,
      margin: revenue ? (profit / revenue) * 100 : 0,
    }
  }, [summary])

  const card = (value, label, destination, tone = '') => (
    <button
      type="button"
      className={`summary-card accountant-profit-link ${tone}`}
      onClick={() => navigate(destination)}
      aria-label={`${t('View')} ${t(label)} ${t('details')}`}
    >
      <strong>{value}</strong>
      <span>{t(label)}</span>
      <small>{t('View details')} <span aria-hidden="true">→</span></small>
    </button>
  )

  const row = (label, value, strong = false, negative = false) => (
    <tr>
      <td style={strong ? { fontWeight: 700 } : undefined}>{t(label)}</td>
      <td style={{ textAlign: 'right', fontWeight: strong ? 700 : 500, color: negative ? '#dc2626' : undefined }}>
        {negative && value > 0 ? '-' : ''}{money(value)}
      </td>
    </tr>
  )

  return (
    <div className="page accountant-profit">
      <div className="user-page-heading">
        <div>
          <p className="eyebrow">{t('Accountant workspace')}</p>
          <h1>{t('Profit & Revenue')}</h1>
          <p>{t('Revenue from paid orders and every cost recorded for this branch.')}</p>
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 }}>
          {t('Period')}
          <select value={period} onChange={(e) => setPeriod(e.target.value)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14 }}>
            {PERIODS.map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}
          </select>
        </label>
      </div>

      {error && <div className="subscription-lock" role="alert">{error}</div>}
      {!summary && loading ? (
        <div className="user-section" aria-live="polite">{t('Loading financial data…')}</div>
      ) : summary && (
        <>
          <div className="user-info-grid" style={{ opacity: loading ? 0.6 : 1 }}>
            {card(money(figures.revenue), 'Net Revenue', '/accountant/sales-revenue')}
            {card(money(figures.expenses), 'Total Expenses', '/accountant/reports?category=expenses')}
            {card(money(figures.profit), 'Net Profit', '/accountant/reports?category=expenses', figures.profit < 0 ? 'out-of-stock' : '')}
            {card(`${figures.margin.toFixed(1)}%`, 'Profit margin', '/accountant/reports?category=sales', figures.margin < 0 ? 'out-of-stock' : '')}
          </div>

          <section className="user-section">
            <h2>{t('Profit and loss')}</h2>
            <div className="user-table-wrap">
              <table className="user-table">
                <tbody>
                  {row('Gross sales (paid orders)', figures.grossSales)}
                  {row('Approved refunds', figures.refunds, false, true)}
                  {row('Net revenue', figures.revenue, true)}
                  {row('Stock sold (cost of goods)', figures.costOfGoods, false, true)}
                  {row('Salaries paid', figures.salaries, false, true)}
                  {row('Transfers & suppliers', figures.transfers, false, true)}
                  {(summary.expenseCategories || []).map((c) => (
                    <React.Fragment key={c.category}>{row(c.category, c.amount, false, true)}</React.Fragment>
                  ))}
                  {row('Other expenses (adjustments)', figures.otherExpenses, false, true)}
                  {row('Total expenses', figures.expenses, true, true)}
                  <tr>
                    <td style={{ fontWeight: 800 }}>{t('Net profit')}</td>
                    <td style={{ textAlign: 'right', fontWeight: 800, color: figures.profit < 0 ? '#dc2626' : '#059669' }}>{money(figures.profit)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-sm" style={{ marginTop: 12, color: 'var(--text-4)' }}>
              {t('Only paid orders count as revenue. Salaries and transfers count once the money has been sent.')}
            </p>
          </section>
        </>
      )}
    </div>
  )
}
