import React, { useEffect, useState, useMemo } from 'react'
import { fetchOrders } from '../../api/endpoints'
import OrderRestockModal from '../../components/OrderRestockModal'
import { getOrderLocation } from '../../utils/orderDisplay'
import { usePreferences } from '../../context/PreferencesContext'
import OrderStatusBadge from '../../components/OrderStatusBadge'
import { orderTableText, orderWaiterText } from '../../components/OrderTableHeading'

const STATUS_OPTIONS = ['', 'Open', 'Preparing', 'Ready', 'Served', 'Paid', 'Cancelled']
const SOURCE_OPTIONS = ['', 'qr', 'waiter']
const money = (v) =>
  Number(v || 0).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }) + ' RWF'

export default function ManagerOrders() {
  const { t } = usePreferences()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [restockOrder, setRestockOrder] = useState(null)

  const [status, setStatus] = useState('')
  const [source, setSource] = useState('')
  const [branch, setBranch] = useState('')
  const [branches, setBranches] = useState([])

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const params = {}
      if (status) params.status = status
      if (source) params.source = source
      if (branch) params.branchId = branch
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

  // Collect distinct branches for the filter
  useEffect(() => {
    const set = new Map()
    orders.forEach((o) => {
      if (o.branchId || o.branchName) {
        set.set(o.branchId || o.branchName, o.branchName || o.branchId)
      }
    })
    setBranches([...set.entries()].map(([id, name]) => ({ id, name })))
  }, [orders])

  const totals = useMemo(() => {
    const count = orders.length
    const gross = orders.reduce((s, o) => s + (Number(o.total) || 0), 0)
    const qr = orders
      .filter((o) => (o.source || 'waiter') === 'qr')
      .reduce((s, o) => s + (Number(o.total) || 0), 0)
    const waiter = orders
      .filter((o) => (o.source || 'waiter') === 'waiter')
      .reduce((s, o) => s + (Number(o.total) || 0), 0)
    return { count, gross, qr, waiter }
  }, [orders])

  return (
    <div className="page manager-orders">
      <div className="user-page-heading">
        <div>
          <p className="eyebrow">{t('Manager workspace')}</p>
          <h1>{t('All Orders')}</h1>
          <p>{t('Oversight of every order across branches and sources. View only.')}</p>
        </div>
      </div>

      <div className="user-info-grid">
        <div className="summary-card">
          <strong>{totals.count}</strong>
          <span>{t('Orders')}</span>
        </div>
        <div className="summary-card">
          <strong>{money(totals.gross)}</strong>
          <span>{t('Total Value')}</span>
        </div>
        <div className="summary-card">
          <strong>{money(totals.qr)}</strong>
          <span>{t('QR Orders')}</span>
        </div>
        <div className="summary-card">
          <strong>{money(totals.waiter)}</strong>
          <span>{t('Waiter Orders')}</span>
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
          <Field label={t('Branch')}>
            <select value={branch} onChange={(e) => setBranch(e.target.value)} style={sel}>
              <option value="">{t('All')}</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
            </select>
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
              setBranch('')
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
                  <th>{t('Table')}</th>
                  <th>{t('Order')}</th>
                  <th>{t('Branch')}</th>
                  <th>{t('Type')}</th>
                  <th>{t('Source')}</th>
                  <th>{t('Items')}</th>
                  <th>{t('Status')}</th>
                  <th style={{ textAlign: 'right' }}>{t('Total')}</th>
                  <th style={{ textAlign: 'right' }}>{t('Time')}</th>
                  <th style={{ textAlign: 'right' }}>{t('Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const canRestock = ['Open', 'Preparing'].includes(o.status)
                  return (
                  <tr key={o.id}>
                    <td className="obw-strong" style={{ fontWeight: 800 }}>{orderTableText(o, t)}{orderWaiterText(o, t) && <div style={{ fontSize: 10, fontWeight: 600, color: '#64748b' }}>{orderWaiterText(o, t)}</div>}</td>
                    <td>{o.orderNumber ?? o.id}</td>
                    <td>{o.branchName ?? o.branchId ?? '—'}</td>
                    <td style={{ textTransform: 'capitalize' }}>{o.orderType ?? '—'}</td>
                    <td style={{ textTransform: 'capitalize' }}>{o.source ?? t('waiter')}</td>
                    <td>{(o.items || []).length}</td>
                    <td>
                      <OrderStatusBadge status={o.status} />
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{money(o.total)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--text-4)' }}>
                      {o.createdAt ? new Date(o.createdAt).toLocaleString() : '—'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {canRestock && (
                        <button
                          type="button"
                          style={{
                            padding: '4px 10px',
                            fontSize: 12,
                            borderRadius: 6,
                            border: '1px solid #cbd5e0',
                            background: 'white',
                            cursor: 'pointer',
                            fontWeight: 600,
                          }}
                          onClick={() => setRestockOrder(o)}
                        >
                          {t('Return Items')}
                        </button>
                      )}
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {restockOrder && (
        <OrderRestockModal
          order={restockOrder}
          onClose={() => setRestockOrder(null)}
          onSuccess={() => {
            setRestockOrder(null)
            load()
          }}
        />
      )}
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
