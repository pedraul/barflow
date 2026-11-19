import React, { useEffect, useState, useMemo } from 'react'
import { fetchOrders } from '../../api/endpoints'
import { getOrderLocation } from '../../utils/orderDisplay'
import { usePreferences } from '../../context/PreferencesContext'

const STATUS_OPTIONS = ['', 'Open', 'Preparing', 'Ready', 'Served', 'Paid', 'Cancelled']
const SOURCE_OPTIONS = ['', 'qr', 'waiter']
const money = (v) =>
  Number(v || 0).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }) + ' RWF'

export default function AccountantOrders() {
  const { t } = usePreferences()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [status, setStatus] = useState('')
  const [source, setSource] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const params = {}
      if (status) params.status = status
      if (source) params.source = source
      if (from) params.from = new Date(from).toISOString()
      if (to) params.to = new Date(to + 'T23:59:59').toISOString()
      const data = await fetchOrders(params)
      setOrders(data || [])
    } catch (err) {
      setError(err.message)
      setOrders([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const totals = useMemo(() => {
    const count = orders.length
    const gross = orders.reduce((s, o) => s + (Number(o.total) || 0), 0)
    const paid = orders
      .filter((o) => o.status === 'Paid' || o.status === 'Served')
      .reduce((s, o) => s + (Number(o.total) || 0), 0)
    return { count, gross, paid }
  }, [orders])

  return (
    <div className="page accountant-orders">

      <div className="user-page-heading">
        <div>
          <p className="eyebrow">{t('Accountant workspace')}</p>
          <h1>{t('Orders')}</h1>
          <p>{t('All orders across the business with revenue totals. View only.')}</p>
        </div>
      </div>

      <div className="user-info-grid">
        <div className="summary-card">
          <strong>{totals.count}</strong>
          <span>{t('Orders')}</span>
        </div>
        <div className="summary-card">
          <strong>{money(totals.gross)}</strong>
          <span>{t('Gross Total')}</span>
        </div>
        <div className="summary-card">
          <strong>{money(totals.paid)}</strong>
          <span>{t('Paid / Served')}</span>
        </div>
      </div>

      <section className="section-card">
        <div
          style={{
            display: 'flex',
            gap: 12,
            flexWrap: 'wrap',
            alignItems: 'flex-end',
            marginBottom: 16,
          }}
        >
          <Field label={t('Status')}>
            <select value={status} onChange={(e) => setStatus(e.target.value)} style={sel}>
              {STATUS_OPTIONS.map((s) => (
                <option key={s || 'all'} value={s}>
                  {s ? t(s) : t('All')}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('Source')}>
            <select value={source} onChange={(e) => setSource(e.target.value)} style={sel}>
              {SOURCE_OPTIONS.map((s) => (
                <option key={s || 'all'} value={s}>
                  {s ? t(s === 'qr' ? 'QR' : 'Waiter') : t('All')}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('From')}>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={sel} />
          </Field>
          <Field label={t('To')}>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={sel} />
          </Field>
          <button type="button" className="pay-action" style={{ padding: '10px 18px' }} onClick={load}>
            {t('Apply')}
          </button>
          <button
            type="button"
            className="secondary-action"
            style={{ padding: '10px 18px' }}
            onClick={() => {
              setStatus('')
              setSource('')
              setFrom('')
              setTo('')
              setTimeout(load, 0)
            }}
          >
            {t('Clear')}
          </button>
        </div>

        {error && (
          <div className="subscription-lock" style={{ padding: '12px', marginBottom: 16 }}>
            {t('Error:')} {error}
          </div>
        )}

        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--text-4)', marginTop: '2rem' }}>
            {t('Loading orders…')}
          </p>
        ) : orders.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text-4)', marginTop: '2rem' }}>
            {t('No orders found.')}
          </p>
        ) : (
          <div className="user-table-wrap">
            <table className="user-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t('Table')}</th>
                  <th>{t('Type')}</th>
                  <th>{t('Source')}</th>
                  <th>{t('Items')}</th>
                  <th>{t('Status')}</th>
                  <th style={{ textAlign: 'right' }}>{t('Total')}</th>
                  <th>{t('Payment')}</th>
                  <th style={{ textAlign: 'right' }}>{t('Time')}</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td className="obw-strong">{o.orderNumber ?? o.id}</td>
                    <td>{getOrderLocation(o)}</td>
                    <td style={{ textTransform: 'capitalize' }}>{o.orderType ?? '—'}</td>
                    <td style={{ textTransform: 'capitalize' }}>{o.source ?? t('waiter')}</td>
                    <td>{(o.items || []).length}</td>
                    <td>
                      <span
                        className={
                          o.status === 'Paid' || o.status === 'Served'
                            ? 'user-active'
                            : o.status === 'Cancelled'
                            ? 'user-inactive'
                            : 'user-pending'
                        }
                      >
                        {o.status}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{money(o.total)}</td>
                    <td style={{ textTransform: 'capitalize' }}>
                      {o.paymentMethod || '—'}
                    </td>
                    <td style={{ textAlign: 'right', color: 'var(--text-4)' }}>
                      {o.createdAt
                        ? new Date(o.createdAt).toLocaleString()
                        : '—'}
                    </td>
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

function Field({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 }}>
      {label}
      {children}
    </label>
  )
}

const sel = {
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  fontSize: 14,
  minWidth: 140,
}
