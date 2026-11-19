import { usePreferences } from '../../context/PreferencesContext'
import React, { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useOrders } from '../../context/OrdersContext'
import { getOrderLocation } from '../../utils/orderDisplay'

const money = (value) =>
  'RWF ' +
  Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })

const formatOrderNumber = (value) => String(value || '').padStart(3, '0')

const formatDate = (iso) => {
  if (!iso) return ''
  const date = new Date(iso)
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const statusStyle = (status) => {
  if (status === 'Paid') return 'bg-emerald-100 text-emerald-700'
  if (status === 'Ready') return 'bg-blue-100 text-blue-700'
  if (status === 'Preparing') return 'bg-amber-100 text-amber-700'
  if (status === 'Open') return 'bg-slate-100 text-slate-700'
  if (status === 'Served') return 'bg-purple-100 text-purple-700'
  if (status === 'Cancelled') return 'bg-rose-100 text-rose-700'
  return 'bg-slate-100 text-slate-700'
}

const isUnpaidStatus = (status) => {
  const normalized = String(status || '').trim().toLowerCase()
  return normalized !== 'paid' && normalized !== 'cancelled'
}

export default function WaiterUnpaidOrders() {
  const { t } = usePreferences()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { orders, loaded, error } = useOrders()
  const waiterId = user?.id

  const unpaidOrders = useMemo(
    () => orders.filter(
      (order) => order.waiterId === waiterId && isUnpaidStatus(order.status)
    ),
    [orders, waiterId]
  )

  const handlePay = (order) => {
    navigate('/waiter/checkout', {
      state: {
        order,
      },
    })
  }

  return (
    <div className="page waiter-unpaid-orders">
      <div className="user-page-heading">
        <div>
          <p className="eyebrow">{t("Waiter workspace")}</p>
          <h1>{t("Unpaid orders")}</h1>
          <p>{t("All orders that are not yet paid. Tap Pay now to complete payment using the existing checkout flow.")}</p>
        </div>
      </div>

      {error && <div className="subscription-lock" style={{ padding: '12px' }}>{t("Error:")}{' '}{t(error)}</div>}

      {!loaded ? (
        <div className="emptyState" style={{ padding: '60px', textAlign: 'center', color: '#6c757d' }}>{t("Loading unpaid orders...")}</div>
      ) : unpaidOrders.length === 0 ? (
        <div className="emptyState" style={{ padding: '60px', textAlign: 'center', color: '#6c757d' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>🧾</div>
          <h2 style={{ margin: '0 0 8px' }}>{t("No unpaid orders")}</h2>
          <p>{t("All of your active waiter orders are paid or there are no pending payments yet.")}</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '16px' }}>
          {unpaidOrders.map((order) => (
            <div
              key={order.id}
              className="section-card"
              style={{ borderLeft: '4px solid #f59e0b' }}
            >
              <div className="section-title-row" style={{ marginBottom: 14 }}>
                <div>
                  <p className="text-sm text-slate-500">{t("Order")}{' '}{formatOrderNumber(order.orderNumber)}</p>
                  <h2 className="text-lg font-bold text-slate-900">{getOrderLocation(order)}</h2>
                </div>
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold ${statusStyle(order.status)}`}>
                  {order.status}
                </span>
              </div>

              <div className="mb-4">
                {(order.items || []).map((item, index) => (
                  <div key={index} className="flex items-center justify-between gap-3 py-2 border-b border-slate-100 text-sm">
                    <span className="text-slate-700">{item.name}</span>
                    <span className="text-slate-500">{t("x")}{item.quantity}</span>
                    <strong className="text-slate-900">{money(item.price)}</strong>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-slate-500">{t("Total due")}</p>
                  <p className="text-2xl font-black text-slate-900">{money(order.total)}</p>
                  <p className="text-xs text-slate-400 mt-1">{t("Created")}{' '}{formatDate(order.createdAt)}</p>
                </div>
                <button
                  type="button"
                  className="pay-action"
                  onClick={() => handlePay(order)}
                  style={{ minWidth: 160 }}
                >{t("Pay now")}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
