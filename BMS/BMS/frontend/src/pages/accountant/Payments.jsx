import React, { useEffect, useState } from 'react'
import { fetchAccountantPayments } from '../../api/endpoints'

const money = (value) => `${Number(value || 0).toLocaleString()} RWF`

export default function Payments() {
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    fetchAccountantPayments()
      .then((data) => active && setPayments(data || []))
      .catch(() => active && setPayments([]))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [])

  const total = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)

  return (
    <div className="page accountant-payments">

      <div className="user-page-heading">
        <div>
          <p className="eyebrow">Accountant workspace</p>
          <h1>Payments</h1>
          <p>All payment transactions recorded in the system.</p>
        </div>
      </div>

      <div className="user-info-grid">
        <div className="summary-card">
          <strong>{payments.length}</strong>
          <span>Payments</span>
        </div>
        <div className="summary-card">
          <strong>{money(total)}</strong>
          <span>Total Payments</span>
        </div>
      </div>

      <section className="user-section">
        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--text-4)', marginTop: '2rem' }}>Loading payments…</p>
        ) : payments.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text-4)', marginTop: '2rem' }}>No payments found.</p>
        ) : (
          <div className="user-table-wrap">
            <table className="user-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Method</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                  <th>Reference</th>
                  <th style={{ textAlign: 'right' }}>Date</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className="obw-strong">{p.orderId ?? '—'}</td>
                    <td style={{ textTransform: 'capitalize' }}>{p.method}</td>
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
