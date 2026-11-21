import React, { useEffect, useState } from 'react'
import { fetchRefunds } from '../../api/endpoints'
import { usePreferences } from '../../context/PreferencesContext'

const money = (value) => `${Number(value || 0).toLocaleString()} RWF`

export default function Refunds() {
  const { t } = usePreferences()
  const [refunds, setRefunds] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    fetchRefunds()
      .then((data) => active && setRefunds(data || []))
      .catch(() => active && setRefunds([]))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [])

  const total = refunds
    .filter((r) => String(r.status).toLowerCase() === 'approved')
    .reduce((sum, r) => sum + (Number(r.amount) || 0), 0)

  return (
    <div className="page accountant-refunds">

      <div className="user-page-heading">
        <div>
          <p className="eyebrow">{t('Accountant workspace')}</p>
          <h1>{t('Refunds')}</h1>
          <p>{t('Refund requests and their status.')}</p>
        </div>
      </div>

      <div className="user-info-grid">
        <div className="summary-card">
          <strong>{refunds.length}</strong>
          <span>{t('Refunds')}</span>
        </div>
        <div className="summary-card">
          <strong>{money(total)}</strong>
          <span>{t('Total Refunded (approved)')}</span>
        </div>
      </div>

      <section className="user-section">
        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--text-4)', marginTop: '2rem' }}>{t('Loading refunds…')}</p>
        ) : refunds.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text-4)', marginTop: '2rem' }}>{t('No refunds found.')}</p>
        ) : (
          <div className="user-table-wrap">
            <table className="user-table">
              <thead>
                <tr>
                  <th>{t('Order')}</th>
                  <th style={{ textAlign: 'right' }}>{t('Amount')}</th>
                  <th>{t('Reason')}</th>
                  <th>{t('Status')}</th>
                  <th style={{ textAlign: 'right' }}>{t('Date')}</th>
                </tr>
              </thead>
              <tbody>
                {refunds.map((r) => (
                  <tr key={r.id}>
                    <td className="obw-strong">{r.orderNumber || String(r.id).slice(0, 8)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: '#ef4444' }}>{money(r.amount)}</td>
                    <td>{r.reason || '—'}</td>
                    <td>
                      <span className={r.status === 'approved' ? 'user-active' : r.status === 'rejected' ? 'user-inactive' : 'user-pending'}>
                        {t(r.status)}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', color: 'var(--text-4)' }}>{r.date}</td>
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
