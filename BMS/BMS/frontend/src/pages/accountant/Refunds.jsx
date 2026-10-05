import React, { useEffect, useState } from 'react'
import { fetchRefunds } from '../../api/endpoints'

const money = (value) => `${Number(value || 0).toLocaleString()} RWF`

export default function Refunds() {
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

  const total = refunds.reduce((sum, r) => sum + (Number(r.amount) || 0), 0)

  return (
    <div className="page accountant-refunds">

      <div className="user-page-heading">
        <div>
          <p className="eyebrow">Accountant workspace</p>
          <h1>Refunds</h1>
          <p>Refund requests and their status.</p>
        </div>
      </div>

      <div className="user-info-grid">
        <div className="summary-card">
          <strong>{refunds.length}</strong>
          <span>Refunds</span>
        </div>
        <div className="summary-card">
          <strong>{money(total)}</strong>
          <span>Total Refunded</span>
        </div>
      </div>

      <section className="user-section">
        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--text-4)', marginTop: '2rem' }}>Loading refunds…</p>
        ) : refunds.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text-4)', marginTop: '2rem' }}>No refunds found.</p>
        ) : (
          <div className="user-table-wrap">
            <table className="user-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Date</th>
                </tr>
              </thead>
              <tbody>
                {refunds.map((r) => (
                  <tr key={r.id}>
                    <td className="obw-strong">{r.id.slice(0, 8)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: '#ef4444' }}>{money(r.amount)}</td>
                    <td>{r.reason || '—'}</td>
                    <td>
                      <span className={r.status === 'approved' ? 'user-active' : r.status === 'rejected' ? 'user-inactive' : 'user-pending'}>
                        {r.status}
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
