import React, { useEffect, useState } from 'react'
import { fetchAccountantTaxes } from '../../api/endpoints'

const money = (value) => `${Number(value || 0).toLocaleString()} RWF`

export default function Taxes() {
  const [taxes, setTaxes] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    fetchAccountantTaxes()
      .then((data) => active && setTaxes(data))
      .catch(() => active && setTaxes(null))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [])

  return (
    <div className="page accountant-taxes">
      <div className="user-page-heading">
        <div>
          <p className="eyebrow">Accountant workspace</p>
          <h1>Taxes</h1>
          <p>VAT and tax summary including collected, paid, and payable amounts.</p>
        </div>
      </div>

      {loading ? (
        <p style={{ textAlign: 'center', color: 'var(--text-4)', marginTop: '2rem' }}>Loading tax summary…</p>
      ) : !taxes ? (
        <p style={{ textAlign: 'center', color: 'var(--text-4)', marginTop: '2rem' }}>No tax data available.</p>
      ) : (
        <>
          <div className="user-info-grid">
            <div className="summary-card">
              <strong>{money(taxes.vatCollected)}</strong>
              <span>VAT Collected (Output)</span>
            </div>
            <div className="summary-card">
              <strong>{money(taxes.vatPaid)}</strong>
              <span>VAT Paid (Input)</span>
            </div>
            <div className="summary-card">
              <strong style={{ color: '#ef4444' }}>{money(taxes.vatPayable)}</strong>
              <span>VAT Payable</span>
            </div>
            <div className="summary-card">
              <strong>{money(taxes.totalSales)}</strong>
              <span>Total Sales</span>
            </div>
            <div className="summary-card">
              <strong>{money(taxes.totalExpenses)}</strong>
              <span>Total Expenses</span>
            </div>
            <div className="summary-card">
              <strong>{taxes.reconciledOrders}</strong>
              <span>Reconciled Orders</span>
            </div>
          </div>

          <section className="user-section">
            <h2>Recent VAT Transactions</h2>
            {taxes.transactions && taxes.transactions.length > 0 ? (
              <div className="user-table-wrap">
                <table className="user-table">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Table</th>
                      <th style={{ textAlign: 'right' }}>Total</th>
                      <th style={{ textAlign: 'right' }}>VAT</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {taxes.transactions.map((t) => (
                      <tr key={t.id}>
                        <td className="obw-strong">{t.orderNumber ?? t.id}</td>
                        <td>{t.table ?? '—'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{money(t.total)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{money(t.vat)}</td>
                        <td>
                          <span className={t.status === 'Paid' || t.status === 'Served' ? 'user-active' : 'user-pending'}>
                            {t.status}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', color: 'var(--text-4)' }}>{t.date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>No VAT transactions found.</p>
            )}
          </section>
        </>
      )}
    </div>
  )
}
