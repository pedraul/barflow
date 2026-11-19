import React, { useEffect, useState } from 'react'
import * as api from '../../api/endpoints'
import { usePreferences } from '../../context/PreferencesContext'

const money = (value) => `${Number(value || 0).toLocaleString()} RWF`

export default function Transfers() {
  const { t } = usePreferences()
  const [form, setForm] = useState({ name: '', phone: '', amount: '', purpose: '', method: 'mtn_momo' })
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
      setError(t('All fields are required.'))
      return
    }
    const amount = Number(form.amount)
    if (!(amount > 0)) {
      setError(t('Amount must be greater than zero.'))
      return
    }

    setSending(true)
    try {
      await api.createTransfer({
        name: form.name.trim(),
        phone: form.phone.trim(),
        amount,
        purpose: form.purpose.trim(),
        method: form.method,
      })
       setMessage(`${form.method === 'mtn_momo' ? 'MTN MoMo' : 'Airtel Money'} ${t('transfer request of')} ${money(amount)} ${t('sent to manager for approval.')}`)
      setForm({ name: '', phone: '', amount: '', purpose: '', method: 'mtn_momo' })
      load()
    } catch (err) {
      setError(err.message || t('Transfer failed.'))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="page accountant-transfers">

      <div className="user-page-heading">
        <div>
          <p className="eyebrow">{t('Accountant workspace')}</p>
          <h1>{t('Transfers')}</h1>
           <p>{t('Send money out of the system to a recipient\'s number. Requests are sent to the manager for approval before the money is sent.')}</p>
        </div>
      </div>

      <section className="user-section">
        <h2>{t('New transfer')}</h2>
        <form onSubmit={handleSubmit} className="profile-form">
          <label>
            {t('Name to transfer to')}
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={t('Recipient name')}
              required
            />
          </label>
          <label>
            {t('Phone number')}
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder={t('e.g. 0788123456')}
              required
            />
          </label>
          <label>
            {t('Amount to transfer')}
            <input
              type="number"
              min="1"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder={t('0')}
              required
            />
          </label>
          <label>
            {t('Mobile money provider')}
            <select
              value={form.method}
              onChange={(e) => setForm({ ...form, method: e.target.value })}
              required
            >
              <option value="mtn_momo">{t('MTN MoMo')}</option>
              <option value="airtel_money">{t('Airtel Money')}</option>
            </select>
          </label>
          <label>
            {t('Purpose of transfer')}
            <input
              type="text"
              value={form.purpose}
              onChange={(e) => setForm({ ...form, purpose: e.target.value })}
              placeholder={t('e.g. Supplier payment')}
              required
            />
          </label>

          {error && <div className="error-box" style={{ color: '#cc0000' }}>{error}</div>}
          {message && <div className="success-box" style={{ color: '#2d6a4f' }}>{message}</div>}

          <div className="form-actions">
            <button type="submit" className="pay-action" disabled={sending}>
              {sending ? t('Sending…') : t('Send transfer ➡️')}
            </button>
          </div>
        </form>
      </section>

      <section className="user-section">
        <h2>{t('Transfer history')}</h2>
        {loading ? (
          <p>{t('Loading…')}</p>
        ) : transfers.length ? (
          <div className="user-table-wrap">
            <table className="user-table">
              <thead>
                 <tr>
                   <th>{t('Name')}</th>
                   <th>{t('Phone')}</th>
                   <th>{t('Amount')}</th>
                   <th>{t('Provider')}</th>
                   <th>{t('Purpose')}</th>
                   <th>{t('Status')}</th>
                   <th>{t('Date')}</th>
                 </tr>
               </thead>
               <tbody>
                 {transfers.map((transfer, i) => (
                   <tr key={transfer.id || i}>
                     <td>{transfer.name}</td>
                     <td>{transfer.phone}</td>
                     <td>{money(transfer.amount)}</td>
                     <td>{transfer.method === 'mtn_momo' ? 'MTN MoMo' : transfer.method === 'airtel_money' ? 'Airtel Money' : '—'}</td>
                     <td>{transfer.purpose}</td>
                     <td>
                       <span style={{ fontSize: 12, fontWeight: 600, color: (transfer.status || '') === 'approved' ? '#059669' : ['rejected', 'failed'].includes(transfer.status) ? '#dc2626' : '#e63946' }}>
                         {transfer.status === 'approved' ? t('Provider confirmed') : transfer.status === 'processing' ? t('Processing') : transfer.status === 'failed' ? t('Failed') : transfer.status === 'rejected' ? t('Rejected') : t('Pending approval')}
                       </span>
                     </td>
                     <td>{transfer.date || transfer.createdAt || '—'}</td>
                   </tr>
                 ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>{t('No transfers yet.')}</p>
        )}
      </section>
    </div>
  )
}
