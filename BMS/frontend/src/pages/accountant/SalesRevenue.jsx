import React, { useEffect, useState, useMemo } from 'react'
import { fetchAccountantSales, fetchRefunds } from '../../api/endpoints'

const money = (value) => `${Number(value || 0).toLocaleString()} RWF`

export default function SalesRevenue() {
  const [sales, setSales] = useState([])
  const [refunds, setRefunds] = useState([])
  const [loading, setLoading] = useState(true)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const params = {}
      if (from) params.from = from
      if (to) params.to = to
      const [salesData, refundsData] = await Promise.all([
        fetchAccountantSales(params),
        fetchRefunds(),
      ])
      setSales(salesData || [])
      setRefunds(refundsData || [])
    } catch (err) {
      setSales([])
      setRefunds([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const totals = useMemo(() => {
    const revenue = sales.reduce((acc, s) => acc + (Number(s.total) || 0), 0)
    const refundTotal = refunds.reduce((acc, r) => acc + (Number(r.amount) || 0), 0)
    return { revenue, refundTotal, netRevenue: revenue - refundTotal }
  }, [sales, refunds])

  return (
    <div className="page accountant-sales">

      <div className="user-page-heading">
        <div>
          <p className="eyebrow">Accountant workspace</p>
          <h1>Sales & Revenue</h1>
          <p>All paid/served orders and revenue figures. View only.</p>
        </div>
      </div>

      <div className="user-info-grid">
        <div className="summary-card">
          <strong>{sales.length}</strong>
          <span>Orders</span>
        </div>
        <div className="summary-card">
          <strong>{money(totals.netRevenue)}</strong>
          <span>Net Revenue</span>
        </div>
        <div className="summary-card">
          <strong>{money(totals.refundTotal)}</strong>
          <span>Refunds</span>
        </div>
      </div>

      <section className="user-section">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 }}>
            From
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14 }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 }}>
            To
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14 }} />
          </label>
          <button type="button" className="pay-action" style={{ padding: '10px 18px' }} onClick={load}>Apply</button>
        </div>

        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--text-4)', marginTop: '2rem' }}>Loading sales…</p>
        ) : sales.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text-4)', marginTop: '2rem' }}>No sales found.</p>
        ) : (
          <div className="user-table-wrap">
            <table className="user-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Table</th>
                  <th>Source</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Date</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((s) => (
                  <tr key={s.id}>
                    <td className="obw-strong">{s.orderNumber ?? s.id}</td>
                    <td>{s.table ?? '—'}</td>
                    <td style={{ textTransform: 'capitalize' }}>{s.source ?? '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{money(s.total)}</td>
                    <td>
                      <span className={s.status === 'Paid' || s.status === 'Served' ? 'user-active' : 'user-pending'}>
                        {s.status}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', color: 'var(--text-4)' }}>{s.date}</td>
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
