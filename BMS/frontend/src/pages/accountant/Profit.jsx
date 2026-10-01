import React, { useEffect, useState, useMemo } from 'react'
import { useOrders } from '../../context/OrdersContext'
import { useUsers } from '../../context/UsersContext'
import { fetchRefunds } from '../../api/endpoints'

const money = (value) => `${Number(value || 0).toLocaleString()} RWF`

export default function Profit() {
  const { orders } = useOrders()
  const { users } = useUsers()
  const [refunds, setRefunds] = useState([])

  useEffect(() => {
    fetchRefunds()
      .then((data) => setRefunds(data || []))
      .catch(() => setRefunds([]))
  }, [])

  const figures = useMemo(() => {
    const revenue = orders
      .filter((o) => o.status === 'Paid' || o.status === 'Served')
      .reduce((sum, o) => sum + (Number(o.total) || 0), 0)

    const refundTotal = refunds.reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
    const netRevenue = revenue - refundTotal

    const salaryCost = users.reduce((sum, u) => sum + (Number(u.salary) || 0), 0)
    const costs = salaryCost
    const profit = netRevenue - costs
    const margin = netRevenue ? (profit / netRevenue) * 100 : 0
    const retention = netRevenue - salaryCost

    return { revenue: netRevenue, salaryCost, costs, profit, margin, retention, refundTotal }
  }, [orders, users, refunds])

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
          <span>Net Revenue</span>
        </div>
        <div className="summary-card">
          <strong>{money(figures.refundTotal)}</strong>
          <span>Refunds</span>
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
            <span>Net revenue</span>
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
