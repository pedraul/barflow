import React, { useEffect, useRef, useState } from 'react'
import * as api from '../api/endpoints'
import { useAuth } from '../context/AuthContext'
import { useOwner } from '../context/OwnerContext'
import { usePreferences } from '../context/PreferencesContext'

function formatCurrency(amount) {
  return 'RWF ' + Number(amount).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

function formatOrderNumber(number) {
  return String(number ?? 0).padStart(3, '0')
}

/**
 * Shared order-fulfilment board for a preparation station (Kitchen or Bar).
 * The logic is identical; the two stations only differ by theme props, so the
 * kitchen and bar stay "the same" under the hood but "different" on screen.
 */
export default function StationDisplay({
  title,
  accent = '#fd7e14',
  stationLabel = 'Kitchen',
  fetchOrders,
  newHeading = '🆕 New Orders',
  preparingHeading = '👨‍🍳 In Progress',
  readyHeading = '✅ Ready for Serving',
  paidHeading = '💳 Paid — Waiting for Delivery',
  newAlert = '🔔 New Order Received!',
  startLabel = '▶ Start Preparing',
  readyLabel = '✓ Mark as Ready',
  showImage = false,
}) {
  const { user } = useAuth()
  const { activeBranchId } = useOwner()
  const { t } = usePreferences()
  const branchId = String(user?.role || '').toLowerCase() === 'owner'
    ? activeBranchId
    : user?.branchId
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [soundAlert, setSoundAlert] = useState(false)
  const activeBranchRef = useRef(branchId)

  const loadOrders = async () => {
    try {
      const data = await fetchOrders(branchId)
      if (activeBranchRef.current !== branchId) return
      setOrders(data)
      setError(null)
      const newOrders = data.filter((o) => o.status === 'Open')
      if (newOrders.length > 0) {
        setSoundAlert(true)
        setTimeout(() => setSoundAlert(false), 3000)
      }
    } catch (err) {
      if (activeBranchRef.current !== branchId) return
      setError(err.message)
    } finally {
      if (activeBranchRef.current === branchId) setLoading(false)
    }
  }

  useEffect(() => {
    activeBranchRef.current = branchId
    setOrders([])
    setLoading(true)
    setError(null)
    loadOrders()
    const interval = setInterval(loadOrders, 5000)
    return () => clearInterval(interval)
  }, [fetchOrders, branchId])

  const handleStart = async (id) => {
    try {
      await api.startPreparing(id, branchId)
      loadOrders()
    } catch (err) {
      alert(`${t('Error:')} ${err.message}`)
    }
  }

  const handleReady = async (id) => {
    try {
      await api.markAsReady(id, branchId)
      loadOrders()
    } catch (err) {
      alert(`${t('Error:')} ${err.message}`)
    }
  }

  if (loading && orders.length === 0) {
    return (
      <div style={styles.loadingScreen}>
        <div style={{ ...styles.spinner, borderTop: `4px solid ${accent}` }} />
        <h2>{t('Loading')} {t(stationLabel)} {t('Orders...')}</h2>
      </div>
    )
  }

  const newOrders = orders.filter((o) => o.status === 'Open')
  const preparingOrders = orders.filter((o) => o.status === 'Preparing')
  const readyOrders = orders.filter((o) => o.status === 'Ready')
  const paidOrders = orders.filter((o) => o.status === 'Paid')

  const renderItem = (item, idx) => {
    if (showImage) {
      return (
        <div key={idx} style={styles.itemRow}>
          <div style={styles.itemImage}>
            {item.imageUrl ? (
              <img src={item.imageUrl} alt={item.name} style={styles.thumbImg} />
            ) : (
              <div style={styles.thumbPlaceholder}>🍺</div>
            )}
          </div>
          <div style={styles.itemInfo}>
            <span style={styles.itemName}>{item.name}</span>
            <span style={styles.itemQty}>{item.quantity}×</span>
            <span style={styles.itemPrice}>{formatCurrency(item.price)}</span>
          </div>
        </div>
      )
    }
    return (
      <div key={idx} style={styles.itemRow}>
        <span style={styles.itemName}>{item.name}</span>
        <span style={styles.itemQty}>{item.quantity}×</span>
        <span style={styles.itemPrice}>{formatCurrency(item.price)}</span>
      </div>
    )
  }

  const renderOrderCard = (queuePosition, order, trailing) => (
    <div key={order.id} style={{ ...styles.orderCard, borderLeft: `4px solid ${accent}` }}>
      <div style={styles.orderHeader}>
        <span style={styles.queueBadge}>#{queuePosition}</span>
                  <span style={styles.orderNumber}>{formatOrderNumber(order.orderNumber)}</span>
        <span style={styles.tableBadge}>{t('Table')} {order.tableNumber}</span>
      </div>
      <div style={styles.itemsList}>
        {order.items.map((item, idx) => renderItem(item, idx))}
      </div>
      <div style={styles.orderTotalRow}>
        <span style={styles.orderTotalLabel}>{t('Total')}</span>
        <span style={styles.orderTotalValue}>{formatCurrency(order.total || 0)}</span>
      </div>
      {trailing}
    </div>
  )

  return (
    <div style={styles.container}>
      {soundAlert && newOrders.length > 0 && (
        <div style={{ ...styles.alertBanner, backgroundColor: accent }}>{t(newAlert)}</div>
      )}

      <div style={styles.header}>
        <h1 style={styles.title}>{t(title)}</h1>
        <div style={styles.stats}>
          <span style={styles.stat}>{t('New:')} {newOrders.length}</span>
          <span style={styles.stat}>{t('Preparing:')} {preparingOrders.length}</span>
          <span style={styles.stat}>{t('Ready:')} {readyOrders.length}</span>
          <span style={styles.stat}>{t('Paid:')} {paidOrders.length}</span>
        </div>
      </div>

      {error && <div style={styles.errorBox}>{t('Error:')} {error}</div>}

      {newOrders.length > 0 && (
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>{t(newHeading)}</h2>
          <div style={styles.ordersGrid}>
            {newOrders.map((order, idx) =>
              renderOrderCard(
                idx + 1,
                order,
                <button style={{ ...styles.startBtn, backgroundColor: accent }} onClick={() => handleStart(order.id)}>
                  {t(startLabel)}
                </button>
              )
            )}
          </div>
        </div>
      )}

      {preparingOrders.length > 0 && (
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>{t(preparingHeading)}</h2>
          <div style={styles.ordersGrid}>
            {preparingOrders.map((order, idx) =>
              renderOrderCard(
                idx + 1,
                order,
                <button style={{ ...styles.readyBtn, backgroundColor: '#28a745' }} onClick={() => handleReady(order.id)}>
                  {t(readyLabel)}
                </button>
              )
            )}
          </div>
        </div>
      )}

      {readyOrders.length > 0 && (
        <div style={styles.section}>
          <h2 style={{ ...styles.sectionTitle, color: '#28a745' }}>{t(readyHeading)}</h2>
          <div style={styles.ordersGrid}>
            {readyOrders.map((order, idx) => (
              <div key={order.id} style={{ ...styles.orderCard, borderLeft: '4px solid #28a745' }}>
                <div style={styles.orderHeader}>
                  <span style={styles.queueBadge}>#{idx + 1}</span>
                  <span style={styles.orderNumber}>{formatOrderNumber(order.orderNumber)}</span>
                  <span style={styles.tableBadge}>{t('Table')} {order.tableNumber}</span>
                </div>
                <div style={styles.itemsList}>
                  {order.items.map((item, idx) => renderItem(item, idx))}
                </div>
                <div style={styles.orderTotalRow}>
                  <span style={styles.orderTotalLabel}>{t('Total')}</span>
                  <span style={styles.orderTotalValue}>{formatCurrency(order.total || 0)}</span>
                </div>
                <div style={{ ...styles.readyLabel, color: '#28a745' }}>{t('Ready! 🎉')}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {paidOrders.length > 0 && (
        <div style={styles.section}>
          <h2 style={{ ...styles.sectionTitle, color: '#0d6efd' }}>{t(paidHeading)}</h2>
          <div style={styles.ordersGrid}>
            {paidOrders.map((order, idx) => (
              <div key={order.id} style={{ ...styles.orderCard, borderLeft: '4px solid #0d6efd' }}>
                <div style={styles.orderHeader}>
                  <span style={styles.queueBadge}>#{idx + 1}</span>
                  <span style={styles.orderNumber}>{formatOrderNumber(order.orderNumber)}</span>
                  <span style={styles.tableBadge}>{t('Table')} {order.tableNumber}</span>
                </div>
                <div style={styles.itemsList}>
                  {order.items.map((item, idx) => renderItem(item, idx))}
                </div>
                <div style={styles.orderTotalRow}>
                  <span style={styles.orderTotalLabel}>{t('Total')}</span>
                  <span style={styles.orderTotalValue}>{formatCurrency(order.total || 0)}</span>
                </div>
                <div style={{ ...styles.readyLabel, color: '#0d6efd' }}>{t('Paid • awaiting pickup')}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {orders.length === 0 && (
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>{stationLabel === 'Bar' ? '🍺' : '🍳'}</div>
          <h2>{t('No orders yet')}</h2>
          <p>{t('Waiting for new')} {t(stationLabel.toLowerCase())} {t('orders to come in...')}</p>
        </div>
      )}
    </div>
  )
}

const styles = {
  container: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '20px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    backgroundColor: '#f8f9fa',
    minHeight: '100vh',
  },
  loadingScreen: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    gap: '16px',
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '4px solid #f3f3f3',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    paddingBottom: '16px',
    borderBottom: '2px solid #dee2e6',
  },
  title: {
    fontSize: '28px',
    fontWeight: '700',
    color: '#1a1a2e',
    margin: 0,
  },
  stats: {
    display: 'flex',
    gap: '16px',
  },
  stat: {
    padding: '8px 16px',
    backgroundColor: 'white',
    borderRadius: '8px',
    fontWeight: '600',
    fontSize: '14px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
  },
  alertBanner: {
    color: 'white',
    padding: '12px 20px',
    borderRadius: '8px',
    fontSize: '18px',
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: '16px',
    animation: 'pulse 1s ease-in-out 3',
  },
  errorBox: {
    backgroundColor: '#fce4e4',
    color: '#cc0000',
    padding: '12px',
    borderRadius: '8px',
    marginBottom: '16px',
  },
  section: {
    marginBottom: '32px',
  },
  sectionTitle: {
    fontSize: '22px',
    fontWeight: '700',
    color: '#1a1a2e',
    marginBottom: '16px',
  },
  ordersGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: '16px',
  },
  orderCard: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  },
  orderHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  orderNumber: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#1a1a2e',
  },
  tableBadge: {
    backgroundColor: '#e9ecef',
    padding: '6px 12px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '600',
  },
  queueBadge: {
    backgroundColor: '#1a1a2e',
    color: 'white',
    padding: '4px 10px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '700',
    marginRight: '8px',
  },
  itemsList: {
    marginBottom: '16px',
  },
  orderTotalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTop: '2px solid #1a1a2e',
    paddingTop: '10px',
    marginBottom: '12px',
  },
  orderTotalLabel: {
    fontWeight: '700',
    fontSize: '16px',
    color: '#1a1a2e',
  },
  orderTotalValue: {
    fontWeight: '800',
    fontSize: '18px',
    color: '#1a1a2e',
  },
  itemRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 0',
    borderBottom: '1px solid #f0f0f0',
    fontSize: '16px',
  },
  itemName: {
    flex: 1,
    fontWeight: 500,
  },
  itemQty: {
    fontWeight: '700',
    color: '#e63946',
    minWidth: '30px',
  },
  itemPrice: {
    fontWeight: '700',
    color: '#1a1a2e',
    minWidth: '90px',
    textAlign: 'right',
  },
  itemImage: {
    width: '50px',
    height: '50px',
    borderRadius: '8px',
    overflow: 'hidden',
    flexShrink: 0,
  },
  thumbImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  thumbPlaceholder: {
    width: '50px',
    height: '50px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '24px',
    backgroundColor: '#f0f0f0',
    borderRadius: '8px',
  },
  itemInfo: {
    flex: 1,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  startBtn: {
    width: '100%',
    padding: '12px',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  readyBtn: {
    width: '100%',
    padding: '12px',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  readyLabel: {
    textAlign: 'center',
    fontSize: '18px',
    fontWeight: '700',
    padding: '8px',
  },
  emptyState: {
    textAlign: 'center',
    padding: '80px 20px',
    color: '#6c757d',
  },
  emptyIcon: {
    fontSize: '64px',
    marginBottom: '16px',
  },
}

// Inject keyframes
const styleSheet = document.createElement('style')
styleSheet.textContent = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
`
document.head.appendChild(styleSheet)
