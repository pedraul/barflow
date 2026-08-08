import React, { useMemo } from 'react'
import { useOrders } from '../../context/OrdersContext'

const money = (value) => `${Number(value || 0).toLocaleString()} RWF`

export default function Revenue() {
  const { orders } = useOrders()

  const daily = useMemo(() => {
    const map = {}
    orders.forEach((o) => {
      const day = (o.createdAt || '').slice(0, 10) || 'Unknown'
      map[day] = (map[day] || 0) + (Number(o.total) || 0)
    })
    return Object.entries(map)
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([day, total]) => ({ day, total }))
  }, [orders])

  const total = daily.reduce((sum, d) => sum + d.total, 0)

  return (
    <div className="page manager-revenue">
      <div className="user-page-heading">
        <div>
          <p className="eyebrow">Manager workspace</p>
          <h1>Revenue</h1>
          <p>Daily revenue received, calculated automatically from orders.</p>
        </div>
      </div>

      <div className="user-info-grid" style={{ marginBottom: '20px' }}>
        <div className="summary-card"><strong>{money(total)}</strong><span>Total revenue</span></div>
        <div className="summary-card"><strong>{daily.length}</strong><span>Days with sales</span></div>
      </div>

      <section className="user-section">
        <h2>Daily revenue</h2>
        <div className="user-table-wrap">
          <table className="user-table">
            <thead><tr><th>Date</th><th>Revenue</th></tr></thead>
            <tbody>
              {daily.map((d) => (
                <tr key={d.day}><td>{d.day}</td><td>{money(d.total)}</td></tr>
              ))}
              {!daily.length && <tr><td colSpan="2">No revenue recorded yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
