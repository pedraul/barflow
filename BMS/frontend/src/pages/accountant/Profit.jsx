import React, { useMemo } from 'react'
import { useOrders } from '../../context/OrdersContext'
import { useUsers } from '../../context/UsersContext'

const money = (value) => `${Number(value || 0).toLocaleString()} RWF`

export default function Profit() {
  const { orders } = useOrders()
  const { users } = useUsers()

  const figures = useMemo(() => {
    const revenue = orders
      .filter((o) => o.status === 'Paid' || o.status === 'Served')
      .reduce((sum, o) => sum + (Number(o.total) || 0), 0)

    // Costs: total monthly salary owed to active workers.
    const salaryCost = users.reduce((sum, u) => sum + (Number(u.salary) || 0), 0)
    const costs = salaryCost
    const profit = revenue - costs
    const margin = revenue ? (profit / revenue) * 100 : 0

    // Simple comparison: current revenue vs salary cost (what the business keeps).
    const retention = revenue - salaryCost

    return { revenue, salaryCost, costs, profit, margin, retention }
  }, [orders, users])

  return (
    <div className="page accountant-profit">

      <div className="user-page-heading">
        <div>
          <p className="eyebrow">Accountant workspace</p>
          <h1>Profit &amp; Revenue</h1>
          <p>Automatically calculated from orders and payroll, then compared.</p>
        </div>
      </div>

      <div className="user-info-grid">
        <div className="summary-card">
          <strong>{money(figures.revenue)}</strong>
          <span>Revenue</span>
        </div>
        <div className="summary-card">
          <strong>{money(figures.costs)}</strong>
          <span>Costs (payroll)</span>
        </div>
        <div className="summary-card">
          <strong>{money(figures.profit)}</strong>
          <span>Profit</span>
        </div>
        <div className="summary-card">
          <strong>{figures.margin.toFixed(1)}%</strong>
          <span>Profit margin</span>
        </div>
      </div>

      <section className="user-section">
        <h2>Revenue vs Cost comparison</h2>
        <div className="user-info-grid">
          <div className="summary-card">
            <strong>{money(figures.revenue)}</strong>
            <span>Total revenue</span>
          </div>
          <div className="summary-card">
            <strong>{money(figures.salaryCost)}</strong>
            <span>Salary cost</span>
          </div>
          <div className={`summary-card${figures.retention >= 0 ? '' : ' out-of-stock'}`}>
            <strong>{money(figures.retention)}</strong>
            <span>Retained after payroll</span>
          </div>
        </div>
        <p className="text-sm" style={{ marginTop: '12px', color: '#6c757d' }}>
          Profit is revenue minus total payroll cost. The business retains {money(figures.retention)} after paying salaries.
        </p>
      </section>
    </div>
  )
}
