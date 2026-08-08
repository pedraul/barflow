import React, { useEffect, useState } from 'react'
import * as api from '../../api/endpoints'

const money = (value) => `${Number(value || 0).toLocaleString()} RWF`

export default function Transfers() {
  const [form, setForm] = useState({ name: '', phone: '', amount: '', purpose: '' })
  const [transfers, setTransfers] = useState([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  const load = () => {
    api
      .fetchTransfers()
      .then((data) => setTransfers(data || []))
      .catch(() => setTransfers([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setMessage(null)
    setError(null)

    if (!form.name.trim() || !form.phone.trim() || !form.amount || !form.purpose.trim()) {
      setError('All fields are required.')
      return
    }
    const amount = Number(form.amount)
    if (!(amount > 0)) {
      setError('Amount must be greater than zero.')
      return
    }

    setSending(true)
    try {
      await api.createTransfer({
        name: form.name.trim(),
        phone: form.phone.trim(),
        amount,
        purpose: form.purpose.trim(),
      })
       setMessage(`Transfer request of ${money(amount)} to ${form.name} (${form.phone}) sent to manager for approval.`)
      setForm({ name: '', phone: '', amount: '', purpose: '' })
      load()
    } catch (err) {
      setError(err.message || 'Transfer failed.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="page accountant-transfers">

      <div className="user-page-heading">
        <div>
          <p className="eyebrow">Accountant workspace</p>
          <h1>Transfers</h1>
           <p>Send money out of the system to a recipient's number. Requests are sent to the manager for approval before the money is sent.</p>
        </div>
      </div>

      <section className="user-section">
        <h2>New transfer</h2>
        <form onSubmit={handleSubmit} className="profile-form">
          <label>
            Name to transfer to
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Recipient name"
              required
            />
          </label>
          <label>
            Phone number
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="e.g. 0788123456"
              required
            />
          </label>
          <label>
            Amount to transfer
            <input
              type="number"
              min="1"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder="0"
              required
            />
          </label>
          <label>
            Purpose of transfer
            <input
              type="text"
              value={form.purpose}
              onChange={(e) => setForm({ ...form, purpose: e.target.value })}
              placeholder="e.g. Supplier payment"
              required
            />
          </label>

          {error && <div className="error-box" style={{ color: '#cc0000' }}>{error}</div>}
          {message && <div className="success-box" style={{ color: '#2d6a4f' }}>{message}</div>}

          <div className="form-actions">
            <button type="submit" className="pay-action" disabled={sending}>
              {sending ? 'Sending…' : 'Send transfer ➡️'}
            </button>
          </div>
        </form>
      </section>

      <section className="user-section">
        <h2>Transfer history</h2>
        {loading ? (
          <p>Loading…</p>
        ) : transfers.length ? (
          <div className="user-table-wrap">
            <table className="user-table">
              <thead>
                 <tr>
                   <th>Name</th>
                   <th>Phone</th>
                   <th>Amount</th>
                   <th>Purpose</th>
                   <th>Status</th>
                   <th>Date</th>
                 </tr>
               </thead>
               <tbody>
                 {transfers.map((t, i) => (
                   <tr key={t.id || i}>
                     <td>{t.name}</td>
                     <td>{t.phone}</td>
                     <td>{money(t.amount)}</td>
                     <td>{t.purpose}</td>
                     <td>
                       <span style={{ fontSize: 12, fontWeight: 600, color: (t.status || '') === 'approved' ? '#059669' : (t.status || '') === 'rejected' ? '#dc2626' : '#e63946' }}>
                         {t.status === 'approved' ? 'Approved' : t.status === 'rejected' ? 'Rejected' : 'Pending approval'}
                       </span>
                     </td>
                     <td>{t.date || t.createdAt || '—'}</td>
                   </tr>
                 ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No transfers yet.</p>
        )}
      </section>
    </div>
  )
}
