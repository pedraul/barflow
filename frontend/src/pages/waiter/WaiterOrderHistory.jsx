import { usePreferences } from '../../context/PreferencesContext'
import React, { useEffect, useState } from 'react'
import * as api from '../../api/endpoints'
import { useAuth } from '../../context/AuthContext'
import { getOrderLocation } from '../../utils/orderDisplay'

export default function WaiterOrderHistory() {
  const { t } = usePreferences()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [period, setPeriod] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [totalRevenue, setTotalRevenue] = useState(0)
  const [totalOrders, setTotalOrders] = useState(0)
  const { user } = useAuth()

  const loadHistory = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.fetchWaiterOrderHistory({ period, from, to })
      setOrders(data.orders || [])
      setTotalRevenue(data.totalRevenue || 0)
      setTotalOrders(data.totalOrders || 0)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadHistory() }, [period, from, to])

  const formatCurrency = (amount) => {
    return 'RWF ' + Number(amount).toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
  }

  const formatOrderNumber = (num) => {
    return String(num || '').padStart(3, '0')
  }

  const formatDate = (iso) => {
    if (!iso) return ''
    const d = new Date(iso)
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const statusColor = (status) => {
    if (status === 'Paid') return '#28a745'
    if (status === 'Ready') return '#17a2b8'
    if (status === 'Serving') return '#6f42c1'
    if (status === 'Preparing') return '#ffc107'
    if (status === 'Served') return '#20c997'
    if (status === 'Cancelled') return '#dc3545'
    return '#6c757d'
  }

  const periodButtons = [
    { key: 'today', label: 'Today' },
    { key: 'week', label: 'This Week' },
    { key: 'month', label: 'This Month' },
    { key: 'all', label: 'All Time' },
  ]

  return (
    <div className="page waiter-order-history">
      <div className="user-page-heading">
        <div>
          <p className="eyebrow">{t("Waiter workspace")}</p>
          <h1>{t("My Order History")}</h1>
          <p>{t("All orders you have created, saved permanently.")}</p>
        </div>
      </div>

      {error && <div className="subscription-lock" style={{ padding: '12px' }}>{t("Error:")}{' '}{t(error)}</div>}

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        {periodButtons.map((btn) => (
          <button
            key={btn.key}
            onClick={() => setPeriod(btn.key)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold ${period === btn.key ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}
          >
            {t(btn.label)}
          </button>
        ))}
        <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e0' }}
            placeholder={t("From")}
          />
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e0' }}
            placeholder={t("To")}
          />
          <button onClick={loadHistory} className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-semibold">{t("Apply")}</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
          <div style={{ fontSize: '14px', color: '#6c757d', marginBottom: '4px' }}>{t("Total Orders")}</div>
          <div style={{ fontSize: '32px', fontWeight: '800', color: '#1a1a2e' }}>{totalOrders}</div>
        </div>
        <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
          <div style={{ fontSize: '14px', color: '#6c757d', marginBottom: '4px' }}>{t("Total Revenue")}</div>
          <div style={{ fontSize: '32px', fontWeight: '800', color: '#d97706' }}>{formatCurrency(totalRevenue)}</div>
        </div>
        <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
          <div style={{ fontSize: '14px', color: '#6c757d', marginBottom: '4px' }}>{t("Waiter")}</div>
          <div style={{ fontSize: '32px', fontWeight: '800', color: '#1a1a2e' }}>{user?.name || t("Me")}</div>
        </div>
      </div>

      {loading && orders.length === 0 ? (
        <div className="emptyState" style={{ padding: '60px', textAlign: 'center', color: '#6c757d' }}>{t("Loading history...")}</div>
      ) : orders.length === 0 ? (
        <div className="emptyState" style={{ padding: '60px', textAlign: 'center', color: '#6c757d' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>📋</div>
          <h2 style={{ margin: '0 0 8px' }}>{t("No orders found")}</h2>
          <p>{t("Orders you create will appear here permanently.")}</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
          {orders.map((order) => (
            <div
              key={order.id}
              style={{
                backgroundColor: 'white',
                borderRadius: '12px',
                padding: '20px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                borderLeft: `4px solid ${statusColor(order.status)}`,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ fontSize: '24px', fontWeight: '700', color: '#1a1a2e' }}>{formatOrderNumber(order.orderNumber)}</span>
                <span style={{ backgroundColor: '#e9ecef', padding: '6px 12px', borderRadius: '6px', fontSize: '14px', fontWeight: '600' }}>
                  {getOrderLocation(order)}
                </span>
              </div>

              <div style={{ borderTop: '1px solid #f0f0f0', borderBottom: '1px solid #f0f0f0', padding: '8px 0', marginBottom: '12px' }}>
                {order.items.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', fontSize: '14px' }}>
                    <span style={{ flex: 1, fontWeight: 500 }}>{item.name}</span>
                    <span style={{ fontWeight: 700, color: '#e63946', minWidth: '30px' }}>{item.quantity}×</span>
                    <span style={{ fontWeight: 700, color: '#1a1a2e', minWidth: '80px', textAlign: 'right' }}>{formatCurrency(item.price)}</span>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>
                <span>{t("Total:")}{' '}{formatCurrency(order.total)}</span>
                <span style={{ color: statusColor(order.status) }}>{order.status}</span>
              </div>

              <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                {formatDate(order.createdAt)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
