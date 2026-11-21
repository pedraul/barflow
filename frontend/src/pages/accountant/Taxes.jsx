import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchAccountantTaxes } from '../../api/endpoints'
import { usePreferences } from '../../context/PreferencesContext'

const money = (value) => `${Number(value || 0).toLocaleString()} RWF`
const taxValue = (value, t) => value == null ? t('Not tracked') : money(value)

export default function Taxes() {
  const { t } = usePreferences()
  const navigate = useNavigate()
  const [taxes, setTaxes] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const summaryCard = (value, label, destination) => (
    <button
      type="button"
      className="summary-card accountant-tax-link"
      onClick={() => navigate(destination)}
      aria-label={`${t('View')} ${t(label)} ${t('details')}`}
    >
      <strong>{value}</strong>
      <span>{t(label)}</span>
      <small>{t('View details')} <span aria-hidden="true">→</span></small>
    </button>
  )

  useEffect(() => {
    let active = true
    fetchAccountantTaxes()
      .then((data) => active && setTaxes(data))
      .catch((err) => {
        if (!active) return
        setTaxes(null)
        setError(err.response?.data?.error || err.message || t('Unable to load tax data.'))
      })
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [])

  return (
    <div className="page accountant-taxes">
      <div className="user-page-heading">
        <div>
          <p className="eyebrow">{t('Accountant workspace')}</p>
          <h1>{t('Taxes')}</h1>
          <p>{t('VAT from paid orders. Input VAT on purchases is not recorded, so the full output VAT is payable.')}</p>
        </div>
      </div>

      {loading ? (
        <p style={{ textAlign: 'center', color: 'var(--text-4)', marginTop: '2rem' }}>{t('Loading tax summary…')}</p>
      ) : !taxes ? (
        <p role="alert" style={{ textAlign: 'center', color: 'var(--text-4)', marginTop: '2rem' }}>{error || t('No tax data available.')}</p>
      ) : (
        <>
          <div className="user-info-grid">
            {summaryCard(money(taxes.vatCollected), 'VAT Collected (Output)', '/accountant/sales-revenue')}
            {summaryCard(taxValue(taxes.vatPaid, t), taxes.vatInputTracked ? 'VAT Paid (input)' : 'VAT Paid (input) — not recorded', '/accountant/reports?category=taxes')}
            {summaryCard(taxValue(taxes.vatPayable, t), 'VAT Payable', '/accountant/reports?category=taxes')}
            {summaryCard(money(taxes.totalSales), 'Net Sales (paid orders)', '/accountant/sales-revenue')}
            {summaryCard(money(taxes.totalExpenses), 'Total Expenses', '/accountant/reports?category=expenses')}
            {summaryCard(taxes.reconciledOrders, 'Paid Orders', '/accountant/sales-revenue')}
          </div>

          <section className="user-section">
            <h2>{t('Recent VAT Transactions')}</h2>
            {taxes.transactions && taxes.transactions.length > 0 ? (
              <div className="user-table-wrap">
                <table className="user-table">
                  <thead>
                    <tr>
                      <th>{t('Order')}</th>
                      <th>{t('Table')}</th>
                      <th style={{ textAlign: 'right' }}>{t('Total')}</th>
                      <th style={{ textAlign: 'right' }}>{t('VAT')}</th>
                      <th>{t('Status')}</th>
                      <th style={{ textAlign: 'right' }}>{t('Date')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {taxes.transactions.map((tx) => (
                      <tr key={tx.id}>
                        <td className="obw-strong">{tx.orderNumber ?? tx.id}</td>
                        <td>{tx.table ?? '—'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{money(tx.total)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{money(tx.vat)}</td>
                        <td>
                          <span className="user-active">{t('Paid')}</span>
                        </td>
                        <td style={{ textAlign: 'right', color: 'var(--text-4)' }}>{tx.date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>{t('No VAT transactions found.')}</p>
            )}
          </section>
        </>
      )}
    </div>
  )
}
