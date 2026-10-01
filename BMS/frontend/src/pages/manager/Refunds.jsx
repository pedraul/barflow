import React, { useEffect, useState } from 'react'
import * as api from '../../api/endpoints'

const money = (value) => `${Number(value || 0).toLocaleString()} RWF`

export default function Refunds() {
  const [orders, setOrders] = useState([])
  const [refunds, setRefunds] = useState([])
  const [form, setForm] = useState({ orderId: '', amount: '', reason: '' })
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [msg, setMsg] = useState(null)
  const [error, setError] = useState(null)

  const load = () => {
    api.fetchOrders()
      .then((data) => setOrders(data || []))
      .catch(() => setOrders([]))
    api.fetchManagerRefunds()
      .then((data) => setRefunds(data || []))
      .catch(() => setRefunds([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const selectedOrder = orders.find((o) => o.id === form.orderId)
  const refundableOrders = orders.filter((o) => {
    if (o.status !== 'Paid') return false
    if (!search.trim()) return true
    const q = search.trim().toLowerCase()
    return (
      (o.orderNumber || '').toLowerCase().includes(q) ||
      (o.customer || '').toLowerCase().includes(q) ||
      (o.customerPhone || '').toLowerCase().includes(q)
    )
  })

  const handleSubmit = async (e) => {
    e.preventDefault()
    setMsg(null)
    setError(null)

    if (!form.orderId || !form.amount || !form.reason.trim()) {
      setError('Order, amount, and reason are required.')
      return
    }
    const amount = Number(form.amount)
    if (!(amount > 0)) {
      setError('Amount must be greater than zero.')
      return
    }

    setSending(true)
    try {
      await api.createManagerRefund({
        orderId: form.orderId,
        amount,
        reason: form.reason.trim(),
      })
      setMsg(`Refund of ${money(amount)} issued successfully.`)
      setForm({ orderId: '', amount: '', reason: '' })
      load()
    } catch (err) {
      setError(err.message || 'Refund failed.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="page manager-refunds">
      <div className="user-page-heading">
        <div>
          <p className="eyebrow">Manager workspace</p>
          <h1>Refunds</h1>
          <p>Issue a refund for an order and track refund history.</p>
        </div>
      </div>

      <section className="user-section">
        <h2>New refund</h2>
        <form onSubmit={handleSubmit} className="profile-form">
          <label>
            Search order
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by order #, table, or customer phone…"
            />
          </label>
          <label>
            Order
            <select
              value={form.orderId}
              onChange={(e) => {
                const order = orders.find((o) => o.id === e.target.value)
                setForm({ ...form, orderId: e.target.value, amount: order ? String(order.total || '') : form.amount })
              }}
              required
            >
              <option value="">Select an order…</option>
              {refundableOrders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.orderNumber} — {o.customer} — {money(o.total)} ({o.status})
                </option>
              ))}
            </select>
          </label>
          {selectedOrder && (
            <p style={{ fontSize: 13, color: 'var(--text-4)', marginTop: -8 }}>
              Order total: <strong>{money(selectedOrder.total)}</strong> — you may refund any amount up to this total.
            </p>
          )}
          <label>
            Amount to refund
            <input
              type="number"
              min="1"
              max={selectedOrder ? Number(selectedOrder.total) : undefined}
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder="0"
              required
            />
          </label>
          <label>
            Reason for refund
            <input
              type="text"
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              placeholder="e.g. Customer returned an item"
              required
            />
          </label>

          {error && <div className="error-box" style={{ color: '#cc0000' }}>{error}</div>}
          {msg && <div className="success-box" style={{ color: '#2d6a4f' }}>{msg}</div>}

          <div className="form-actions">
            <button type="submit" className="pay-action" disabled={sending}>
              {sending ? 'Processing…' : 'Issue refund'}
            </button>
          </div>
        </form>
      </section>

      <section className="user-section">
        <h2>Refund history</h2>
        {loading ? (
          <p>Loading…</p>
        ) : refunds.length ? (
          <div className="user-table-wrap">
            <table className="user-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Amount</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {refunds.map((r, i) => (
                  <tr key={r.id || i}>
                    <td>{r.order || '—'}</td>
                    <td>{money(r.amount)}</td>
                    <td>{r.reason || '—'}</td>
                    <td>
                      <span className={r.status === 'approved' ? 'user-active' : r.status === 'rejected' ? 'user-inactive' : 'user-pending'}>
                        {r.status}
                      </span>
                    </td>
                    <td>{r.date || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No refunds found.</p>
        )}
      </section>
    </div>
  )
}