import { usePreferences } from '../../context/PreferencesContext'
import React, { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import * as api from '../../api/endpoints'
import { useOrders } from '../../context/OrdersContext'
import { useAuth } from '../../context/AuthContext'
import OrderRestockModal from '../../components/OrderRestockModal'
import AddItemsToOrderModal from '../../components/AddItemsToOrderModal'
import { getOrderLocation } from '../../utils/orderDisplay'

export default function WaiterOrders() {
  const { t } = usePreferences()
  const [orders, setOrders] = useState([])
  const [readyOrders, setReadyOrders] = useState([])
  const navigate = useNavigate()
  const location = useLocation()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [delivering, setDelivering] = useState(null)
  const [restockOrder, setRestockOrder] = useState(null)
  const [addItemsOrder, setAddItemsOrder] = useState(null)
  const [refunding, setRefunding] = useState(null)
  const [refundMsg, setRefundMsg] = useState(null)
  const [activeTab, setActiveTab] = useState(location.state?.orderFilter || 'my')
  const { trackOrder } = useOrders()
  const { user } = useAuth()
  const currentWaiterId = user?.id

  const loadOrders = async () => {
    try {
      const [kitchen, bar, operatorData] = await Promise.all([
        api.fetchKitchenOrders(user?.branchId),
        api.fetchBarOrders(user?.branchId),
        api.fetchOperatorOrders().catch(() => []),
      ])
      const combined = [...kitchen, ...bar, ...operatorData]
      const seen = new Map()
      for (const o of combined) {
        if (!seen.has(o.id)) seen.set(o.id, o)
      }
      const allOrders = Array.from(seen.values()).filter((o) => o.status !== 'Cancelled')
      allOrders.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      setOrders(allOrders)

      const readyFromStations = new Map()
      for (const order of [...kitchen, ...bar]) {
        if (String(order.status || '').trim().toLowerCase() === 'ready') {
          readyFromStations.set(order.id, order)
        }
      }
      setReadyOrders(Array.from(readyFromStations.values()).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)))
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const isUnpaidStatus = (status) => {
    const normalized = String(status || '').trim().toLowerCase()
    return normalized !== 'paid' && normalized !== 'cancelled'
  }

  const myOrders = orders.filter((o) => o.waiterId === currentWaiterId)
  const myPaidOrders = myOrders.filter((o) => o.status === 'Paid')
  const myActiveOrders = myOrders.filter((o) => isUnpaidStatus(o.status))
  const displayOrders = activeTab === 'ready' ? readyOrders
    : activeTab === 'paid' ? myPaidOrders
    : activeTab === 'my' ? myOrders
    : activeTab === 'open' ? myOrders.filter((order) => String(order.status || '').trim().toLowerCase() === 'open')
    : activeTab === 'served' ? myOrders.filter((order) => String(order.status || '').trim().toLowerCase() === 'served')
    : myOrders

  useEffect(() => {
    loadOrders()
    const interval = setInterval(loadOrders, 5000)
    return () => clearInterval(interval)
  }, [])

  const handleDeliver = async (orderId) => {
    setDelivering(orderId)
    try {
      const result = await api.updateOperatorOrderStatus(orderId, 'Served')
      const delivered = orders.find((o) => o.id === orderId)
      if (delivered) {
        trackOrder({
          id: result.id ?? delivered.id,
          items: delivered.items,
          total: delivered.total,
          status: 'Served',
          createdAt: delivered.createdAt,
          source: 'qr',
        })
      }
      loadOrders()
    } catch (err) {
      alert(t("Error delivering order:") + ' ' + t(err.message))
    } finally {
      setDelivering(null)
    }
  }

  const handleRefund = async (order) => {
    if (!window.confirm(t("Refund") + " " + formatCurrency(order.total) + " " + t("for order") + " " + formatOrderNumber(order.orderNumber) + " " + t("back to the client's phone?"))) return
    setRefunding(order.id)
    setRefundMsg(null)
    try {
      await api.createManagerRefund({
        orderId: order.id,
        amount: order.total,
        reason: 'Refunded by waiter',
      })
      setRefundMsg(t("Refund of") + " " + formatCurrency(order.total) + " " + t("for order") + " " + formatOrderNumber(order.orderNumber) + " " + t("sent back to the client's phone."))
      loadOrders()
    } catch (err) {
      alert(t("Error refunding order:") + ' ' + t(err.message))
    } finally {
      setRefunding(null)
    }
  }

  return (
    <div className="page waiter-orders">
      <div className="user-page-heading">
        <div>
          <p className="eyebrow">{t("Waiter workspace")}</p>
          <h1>{t("My Orders")}</h1>
          <p>{t("View and manage your open orders, or pick up ready orders for delivery.")}</p>
        </div>
      </div>

      {error && <div className="subscription-lock" style={{ padding: '12px' }}>{t("Error:")}{' '}{t(error)}</div>}
      {refundMsg && <div className="subscription-lock" style={{ padding: '12px', background: '#e7f5ff', color: '#004085' }}>{refundMsg}</div>}

      {loading && orders.length === 0 ? (
        <div className="emptyState" style={{ padding: '60px', textAlign: 'center', color: '#6c757d' }}>{t("Loading orders...")}</div>
      ) : orders.length === 0 ? (
        <div className="emptyState" style={{ padding: '60px', textAlign: 'center', color: '#6c757d' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>📋</div>
          <h2 style={{ margin: '0 0 8px' }}>{t("No orders yet")}</h2>
          <p>{t("Create a new order from the New Order page.")}</p>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <button onClick={() => setActiveTab('my')} className={`px-4 py-2 rounded-lg text-sm font-semibold ${activeTab === 'my' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{t("My Orders (")}{myOrders.length})</button>
            <button onClick={() => setActiveTab('ready')} className={`px-4 py-2 rounded-lg text-sm font-semibold ${activeTab === 'ready' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700'}`}>{t("Ready order pickup (")}{readyOrders.length})</button>
            <button onClick={() => setActiveTab('open')} className={`px-4 py-2 rounded-lg text-sm font-semibold ${activeTab === 'open' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{t("Open / pending")}</button>
            <button onClick={() => setActiveTab('served')} className={`px-4 py-2 rounded-lg text-sm font-semibold ${activeTab === 'served' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{t("Served")}</button>
            <button onClick={() => setActiveTab('paid')} className={`px-4 py-2 rounded-lg text-sm font-semibold ${activeTab === 'paid' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{t("Paid by Operator (")}{myPaidOrders.length})</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
          {displayOrders.map((order) => {
            const normalizedStatus = String(order.status || '').trim().toLowerCase()
            const canReturnItems = normalizedStatus === 'open'
            const canAddItems = ['open', 'preparing', 'pending', 'waiting for preparation'].includes(normalizedStatus)
            const canDeliver = order.status === 'Ready'
            const statusColor = order.status === 'Ready' ? '#28a745' : order.status === 'Preparing' ? '#ffc107' : '#17a2b8'
            const isPaidByOperator = order.status === 'Paid' && order.waiterId === currentWaiterId
            return (
              <div
                key={order.id}
                style={{
                  backgroundColor: 'white',
                  borderRadius: '12px',
                  padding: '20px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                  borderLeft: `4px solid ${statusColor}`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={{ fontSize: '24px', fontWeight: '700', color: '#1a1a2e' }}>{formatOrderNumber(order.orderNumber)}</span>
                  <span style={{ backgroundColor: '#e9ecef', padding: '6px 12px', borderRadius: '6px', fontSize: '14px', fontWeight: '600' }}>
                    {getOrderLocation(order)}
                  </span>
                  {isPaidByOperator && (
                    <span style={{ backgroundColor: '#dbeafe', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', color: '#1e40af' }}>{t("Paid by Operator")}</span>
                  )}
                </div>

                <div style={{ borderTop: '1px solid #f0f0f0', borderBottom: '1px solid #f0f0f0', padding: '8px 0', marginBottom: '12px' }}>
                  {order.items.map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', fontSize: '16px' }}>
                      <span style={{ flex: 1, fontWeight: 500 }}>
                        {item.name}
                        {item.category && <span style={{ marginLeft: '6px', fontSize: '9px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#d97706', backgroundColor: '#fffbeb', padding: '1px 6px', borderRadius: '4px' }}>{item.category}</span>}
                      </span>
                      <span style={{ fontWeight: 700, color: '#e63946', minWidth: '30px' }}>{item.quantity}×</span>
                      <span style={{ fontWeight: 700, color: '#1a1a2e', minWidth: '90px', textAlign: 'right' }}>{formatCurrency(item.price)}</span>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', fontSize: '14px', fontWeight: 600 }}>
                  <span>{t("Total:")}{' '}{formatCurrency(order.total)}</span>
                  <span style={{ color: statusColor }}>{order.status}</span>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  {canReturnItems && (
                    <button
                      type="button"
                      style={{
                        flex: 1,
                        padding: '10px',
                        backgroundColor: '#ffc107',
                        color: '#212529',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '14px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                      onClick={() => setRestockOrder(order)}
                    >{t("Return Items")}</button>
                  )}
                  {canAddItems && (
                    <button
                      type="button"
                      style={{
                        flex: 1,
                        padding: '10px',
                        backgroundColor: '#0d6efd',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '14px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                      onClick={() => setAddItemsOrder(order)}
                    >{t("Add Items")}</button>
                  )}
                  {canDeliver && (
                    <button
                      type="button"
                      style={{
                        flex: 1,
                        padding: '12px',
                        backgroundColor: '#28a745',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '16px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                      onClick={() => handleDeliver(order.id)}
                      disabled={delivering === order.id}
                    >
                      {delivering === order.id ? t("Delivering...") : t("✓ Pick up & deliver")}
                    </button>
                  )}
                  {order.status === 'Served' && (
                    <button
                      type="button"
                      style={{
                        flex: 1,
                        padding: '12px',
                        backgroundColor: '#0d6efd',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '16px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                      onClick={() => navigate('/payment', {
                        state: {
                          order: {
                            orderId: order.id,
                            orderNumber: order.orderNumber,
                            tableNumber: order.tableNumber,
                            total: order.total,
                            items: order.items,
                            status: order.status,
                          },
                          returnTo: '/waiter/orders',
                        },
                      })}
                    >{t("Pay")}</button>
                  )}
                  {order.status === 'Paid' && (
                    <button
                      type="button"
                      style={{
                        flex: 1,
                        padding: '12px',
                        backgroundColor: '#dc3545',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '16px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                      onClick={() => handleRefund(order)}
                      disabled={refunding === order.id}
                    >
                      {refunding === order.id ? t("Refunding...") : t("↩ Refund")}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
          </div>
          </>
        )}

      {restockOrder && (
        <OrderRestockModal
          order={restockOrder}
          onClose={() => setRestockOrder(null)}
          onSuccess={() => {
            setRestockOrder(null)
            loadOrders()
          }}
        />
      )}

      {addItemsOrder && (
        <AddItemsToOrderModal
          order={addItemsOrder}
          onClose={() => setAddItemsOrder(null)}
          onSuccess={() => {
            setAddItemsOrder(null)
            loadOrders()
          }}
        />
      )}
    </div>
  )
}

function formatCurrency(amount) {
  return 'RWF ' + Number(amount).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

function formatOrderNumber(number) {
  return String(number ?? 0).padStart(3, '0')
}
