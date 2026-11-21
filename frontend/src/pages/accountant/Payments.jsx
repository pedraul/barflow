import React, { useEffect, useState } from 'react'
import { fetchAccountantPayments } from '../../api/endpoints'
import { usePreferences } from '../../context/PreferencesContext'

const money = (value) => `${Number(value || 0).toLocaleString()} RWF`

export default function Payments() {
  const { t } = usePreferences()
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    fetchAccountantPayments()
      .then((data) => active && setPayments(data || []))
      .catch((err) => { if (active) { setPayments([]); setError(err?.response?.data?.error || t('Unable to load payments.')) } })
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [])

  const total = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
  const byMethod = payments.reduce((acc, p) => {
    const key = p.methodLabel || p.method || '—'
    acc[key] = (acc[key] || 0) + (Number(p.amount) || 0)
    return acc
  }, {})

  return (
    <div className="page accountant-payments">

      <div className="user-page-heading">
        <div>
          <p className="eyebrow">{t('Accountant workspace')}</p>
          <h1>{t('Payments')}</h1>
          <p>{t('All payment transactions recorded in the system.')}</p>
        </div>
      </div>

      {error && <p role="alert" style={{ color: '#dc2626', marginBottom: 12 }}>{error}</p>}

      <div className="user-info-grid">
        <div className="summary-card">
          <strong>{payments.length}</strong>
          <span>{t('Payments')}</span>
        </div>
        <div className="summary-card">
          <strong>{money(total)}</strong>
          <span>{t('Total Payments')}</span>
        </div>
        {Object.entries(byMethod).map(([method, amount]) => (
          <div className="summary-card" key={method}>
            <strong>{money(amount)}</strong>
            <span>{t(method)}</span>
          </div>
        ))}
      </div>

      <section className="user-section">
        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--text-4)', marginTop: '2rem' }}>{t('Loading payments…')}</p>
        ) : payments.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text-4)', marginTop: '2rem' }}>{t('No payments found.')}</p>
        ) : (
          <div className="user-table-wrap">
            <table className="user-table">
              <thead>
                <tr>
                  <th>{t('Order')}</th>
                  <th>{t('Method')}</th>
                  <th style={{ textAlign: 'right' }}>{t('Amount')}</th>
                  <th>{t('Reference')}</th>
                  <th style={{ textAlign: 'right' }}>{t('Date')}</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="obw-strong">{p.table || '—'}</div>
                      {p.orderNumber && <div style={{ fontSize: 12, color: 'var(--text-4)' }}>{t('Order')} {p.orderNumber}</div>}
                    </td>
                    <td>{t(p.methodLabel || p.method)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{money(p.amount)}</td>
                    <td>{p.reference || '—'}</td>
                    <td style={{ textAlign: 'right', color: 'var(--text-4)' }}>{p.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
