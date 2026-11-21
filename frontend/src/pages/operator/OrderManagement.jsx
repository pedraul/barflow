import { usePreferences } from '../../context/PreferencesContext'
import OrderTableHeading from '../../components/OrderTableHeading'
import { orderCardStyle } from '../../utils/orderStatus'
import React, { useEffect, useState } from 'react'
import * as api from '../../api/endpoints'

export default function OrderManagement() {
  const { t } = usePreferences()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('pending') // pending | routed | completed
  const [routingNotice, setRoutingNotice] = useState(null)

  const loadOrders = async () => {
    setLoading(true)
    try {
      const data = await api.fetchOperatorOrders()
      setOrders(data)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadOrders()
    // Poll every 10 seconds
    const interval = setInterval(loadOrders, 10000)
    return () => clearInterval(interval)
  }, [])

  const handleRoute = async (orderId, destination) => {
    try {
      await api.routeOrder(orderId, destination)
      const order = orders.find((item) => item.id === orderId)
      setRoutingNotice({
        orderNumber: order?.orderNumber || orderId,
        destination: destination === 'kitchen' ? 'Kitchen' : 'Bar',
      })
      loadOrders()
    } catch (err) {
      alert(t("Error routing order:") + ' ' + t(err.message))
    }
  }

  const handleStatusUpdate = async (orderId, status) => {
    try {
      await api.updateOperatorOrderStatus(orderId, status)
      loadOrders()
    } catch (err) {
      alert(t("Error updating order:") + ' ' + t(err.message))
    }
  }

  const pendingOrders = orders.filter((o) => o.status === 'Open')
  const routedOrders = orders.filter((o) => o.status === 'Preparing' || o.status === 'Ready')
  const completedOrders = orders.filter((o) => o.status === 'Served' || o.status === 'Cancelled')

  const displayOrders = activeTab === 'pending' ? pendingOrders
    : activeTab === 'routed' ? routedOrders
    : completedOrders
  const emptyOrdersMessage = activeTab === 'pending'
    ? t('No pending orders')
    : activeTab === 'routed' ? t('No routed orders') : t('No completed orders')

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>{t("Order Management")}</h1>
        <button style={styles.refreshBtn} onClick={loadOrders}>{t("🔄 Refresh")}</button>
      </div>

      {/* Tabs */}
      <div style={styles.tabs}>
        <button
          style={{ ...styles.tab, ...(activeTab === 'pending' ? styles.activeTab : {}) }}
          onClick={() => setActiveTab('pending')}
        >{t("Pending (")}{pendingOrders.length})
        </button>
        <button
          style={{ ...styles.tab, ...(activeTab === 'routed' ? styles.activeTab : {}) }}
          onClick={() => setActiveTab('routed')}
        >{t("In Progress (")}{routedOrders.length})
        </button>
        <button
          style={{ ...styles.tab, ...(activeTab === 'completed' ? styles.activeTab : {}) }}
          onClick={() => setActiveTab('completed')}
        >{t("Completed (")}{completedOrders.length})
        </button>
      </div>

      {error && <div style={styles.errorBox}>{t("Error:")}{' '}{t(error)}</div>}

      {routingNotice && (
        <div style={styles.routingNotice} role="status">
          <span>{t("✓ Order")}{' '}{routingNotice.orderNumber}{' '}{t("was sent to the")}{' '}{t(routingNotice.destination)}.</span>
          <button type="button" style={styles.dismissBtn} onClick={() => setRoutingNotice(null)}>{t("Dismiss")}</button>
        </div>
      )}

      {loading && orders.length === 0 ? (
        <div style={styles.loadingState}>{t("Loading orders...")}</div>
      ) : displayOrders.length === 0 ? (
        <div style={styles.emptyState}>
          <p>{emptyOrdersMessage}</p>
        </div>
      ) : (
        <div style={styles.ordersList}>
          {displayOrders.map((order) => (
            <div key={order.id} style={{ ...styles.orderCard, ...orderCardStyle(order.status) }}>
              <OrderTableHeading order={order} size="lg" style={{ marginBottom: 10 }} />
              <div style={styles.orderHeader}>
                <div>
                  <span style={styles.orderNumber}>{t("Order")} {order.orderNumber}</span>
                  <span style={{
                    ...styles.statusBadge,
                    backgroundColor: order.status === 'Open' ? '#ffc107' 
                      : order.status === 'Preparing' ? '#17a2b8'
                      : order.status === 'Ready' ? '#28a745'
                      : '#6c757d',
                  }}>
                    {order.status}
                  </span>
                  {order.station && (
                    <span style={{
                      ...styles.statusBadge,
                      backgroundColor: order.station === 'bar' ? '#17a2b8' : order.station === 'kitchen' ? '#fd7e14' : '#6c757d',
                    }}>
                      {order.station === 'both' ? t("Kitchen + Bar") : order.station === 'bar' ? t("Bar") : t("Kitchen")}
                    </span>
                  )}
                </div>
                <span style={styles.orderType}>{order.orderType}</span>
              </div>

              <div style={styles.orderItems}>
                {order.items.map((item, idx) => (
                  <div key={idx} style={styles.itemRow}>
                    <span style={styles.itemName}>{item.name}</span>
                    <span style={styles.itemQty}>{t("x")}{item.quantity}</span>
                    <span style={styles.itemPrice}>{formatCurrency(item.price)}</span>
                  </div>
                ))}
              </div>

              <div style={styles.orderTotal}>
                <span>{t("Total:")}{' '}{formatCurrency(order.total)}</span>
                <span style={styles.orderTime}>{order.createdAt}</span>
              </div>

              {/* Action Buttons */}
              {order.status === 'Open' && (
                <div style={styles.actionBtns}>
                  <button
                    style={styles.kitchenBtn}
                    onClick={() => handleRoute(order.id, 'kitchen')}
                  >{t("🍳 Send to Kitchen")}</button>
                  <button
                    style={styles.barBtn}
                    onClick={() => handleRoute(order.id, 'bar')}
                  >{t("🍺 Send to Bar")}</button>
                </div>
              )}

              {order.status === 'Ready' && (
                <div style={styles.actionBtns}>
                  <button
                    style={styles.servedBtn}
                    onClick={() => handleStatusUpdate(order.id, 'Served')}
                  >{t("✓ Mark as Served")}</button>
                </div>
              )}
            </div>
          ))}
        </div>
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

const styles = {
  container: {
    maxWidth: '800px',
    margin: '0 auto',
    padding: '20px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
  },
  title: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#1a1a2e',
    margin: 0,
  },
  refreshBtn: {
    padding: '8px 16px',
    backgroundColor: '#f8f9fa',
    border: '1px solid #dee2e6',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  tabs: {
    display: 'flex',
    gap: '8px',
    marginBottom: '20px',
  },
  tab: {
    padding: '10px 20px',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
    backgroundColor: '#f0f0f0',
    color: '#6c757d',
  },
  activeTab: {
    backgroundColor: '#1a1a2e',
    color: 'white',
  },
  errorBox: {
    backgroundColor: '#fce4e4',
    color: '#cc0000',
    padding: '12px',
    borderRadius: '8px',
    marginBottom: '16px',
  },
  routingNotice: {
    backgroundColor: '#e8f7ee',
    border: '1px solid #93d9ad',
    color: '#166534',
    padding: '12px',
    borderRadius: '8px',
    marginBottom: '16px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontWeight: '600',
  },
  dismissBtn: {
    border: 'none',
    background: 'transparent',
    color: '#166534',
    cursor: 'pointer',
    fontWeight: '700',
  },
  loadingState: {
    textAlign: 'center',
    padding: '40px',
    color: '#6c757d',
  },
  emptyState: {
    textAlign: 'center',
    padding: '40px',
    color: '#6c757d',
  },
  ordersList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  orderCard: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '16px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  },
  orderHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  orderNumber: {
    fontSize: '18px',
    fontWeight: '700',
    color: '#1a1a2e',
    marginRight: '8px',
  },
  tableBadge: {
    backgroundColor: '#e9ecef',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '600',
    marginRight: '8px',
  },
  statusBadge: {
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '600',
    color: 'white',
  },
  orderType: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#6c757d',
    textTransform: 'uppercase',
  },
  orderItems: {
    borderTop: '1px solid #f0f0f0',
    borderBottom: '1px solid #f0f0f0',
    padding: '8px 0',
    marginBottom: '8px',
  },
  itemRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '4px 0',
    fontSize: '14px',
  },
  itemName: {
    flex: 1,
  },
  itemQty: {
    width: '40px',
    textAlign: 'center',
    fontWeight: '600',
  },
  itemPrice: {
    width: '80px',
    textAlign: 'right',
  },
  orderTotal: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '14px',
    fontWeight: '600',
    marginBottom: '12px',
  },
  orderTime: {
    fontWeight: '400',
    color: '#6c757d',
    fontSize: '12px',
  },
  actionBtns: {
    display: 'flex',
    gap: '8px',
  },
  kitchenBtn: {
    flex: 1,
    padding: '10px',
    backgroundColor: '#fd7e14',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '14px',
  },
  barBtn: {
    flex: 1,
    padding: '10px',
    backgroundColor: '#17a2b8',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '14px',
  },
  servedBtn: {
    flex: 1,
    padding: '10px',
    backgroundColor: '#28a745',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '14px',
  },
}
