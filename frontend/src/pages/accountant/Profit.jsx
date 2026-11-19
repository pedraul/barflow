import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchAccountantSummary } from '../../api/endpoints'
import { usePreferences } from '../../context/PreferencesContext'

const money = (value) => `${Number(value || 0).toLocaleString()} RWF`

export default function Profit() {
  const { t } = usePreferences()
  const navigate = useNavigate()
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    fetchAccountantSummary()
      .then((data) => { if (active) setSummary(data) })
      .catch((err) => { if (active) setError(err.response?.data?.error || err.message || t('Unable to load financial data.')) })
    return () => { active = false }
  }, [])

  const figures = useMemo(() => {
    const revenue = Number(summary?.revenue) || 0
    const refunds = Number(summary?.refunds) || 0
    const payroll = Number(summary?.expenses) || 0
    const profit = Number(summary?.profit) || 0
    const margin = revenue ? (profit / revenue) * 100 : 0
    return { revenue, refunds, payroll, profit, margin }
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

  return (
    <div className="page accountant-profit">
      <div className="user-page-heading">
        <div>
          <p className="eyebrow">{t('Accountant workspace')}</p>
          <h1>{t('Profit & Revenue')}</h1>
          <p>{t('Financial totals from this branch’s recorded sales, refunds, and payroll.')}</p>
        </div>
      </div>

      {error && <div className="subscription-lock" role="alert">{error}</div>}
      {!summary && !error ? (
        <div className="user-section" aria-live="polite">{t('Loading financial data…')}</div>
      ) : summary && (
        <>
          <div className="user-info-grid">
            {card(money(figures.revenue), 'Net Revenue', '/accountant/sales-revenue')}
            {card(money(figures.refunds), 'Refunds', '/accountant/refunds')}
            {card(money(figures.payroll), 'Costs (payroll)', '/accountant/reports?category=payroll')}
            {card(money(figures.profit), 'Profit', '/accountant/reports?category=expenses', figures.profit < 0 ? 'out-of-stock' : '')}
            {card(`${figures.margin.toFixed(1)}%`, 'Profit margin', '/accountant/reports?category=sales')}
          </div>

          <section className="user-section">
            <h2>{t('Revenue vs Cost comparison')}</h2>
            <div className="user-info-grid">
              {card(money(figures.revenue), 'Net revenue', '/accountant/sales-revenue')}
              {card(money(figures.payroll), 'Salary cost', '/accountant/reports?category=payroll')}
              {card(money(figures.profit), 'Net profit after costs', '/accountant/reports?category=expenses', figures.profit < 0 ? 'out-of-stock' : '')}
            </div>
            <p className="text-sm" style={{ marginTop: 12, color: '#6c757d' }}>
              {t('Profit includes cost of goods and recorded payroll expenses. Select a summary card to view its underlying records.')}
            </p>
          </section>
        </>
      )}
    </div>
  )
}
