import { usePreferences } from '../../context/PreferencesContext'
import OrderTableHeading from '../../components/OrderTableHeading'
import React, { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useCustomer } from '../../context/CustomerContext'
import { fetchOrdersByTable, addItemsToCustomerOrder } from '../../api/endpoints'
import CustomerAddItemsModal from '../../components/CustomerAddItemsModal'

export default function CartPage() {
  const { t } = usePreferences()
  const navigate = useNavigate()
  const location = useLocation()
  const {
    cart, updateQuantity, removeFromCart, getCartTotal, getCartCount, placeOrder,
    currentOrder, deferredOrder, placeDeferredOrder, clearDeferredOrder, setCurrentOrder,
    tableNumber, businessId, branchId
  } = useCustomer()
  const [ordering, setOrdering] = useState(false)
  const [error, setError] = useState(null)
  const [addItemsOrder, setAddItemsOrder] = useState(null)
  const [reloading, setReloading] = useState(false)

  const navOrder = location.state?.order
  const menuQuery = new URLSearchParams({ table: String(tableNumber || '1') })
  if (businessId) menuQuery.set('businessId', businessId)
  if (branchId) menuQuery.set('branchId', branchId)
  const menuPath = `/menu?${menuQuery.toString()}`

  const reloadOrder = async (orderId) => {
    setReloading(true)
    try {
      const data = await fetchOrdersByTable(tableNumber, businessId, branchId)
      const updated = data.orders.find((o) => o.orderId === orderId)
      if (updated) {
        const mapped = {
          id: updated.orderId,
          orderId: updated.orderId,
          orderNumber: updated.orderNumber,
          tableNumber: updated.tableNumber,
          total: updated.total,
          orderType: updated.orderType,
          items: updated.items,
          status: updated.status,
        }
        if (currentOrder?.orderId === orderId) {
          setCurrentOrder(mapped)
        } else if (deferredOrder?.orderId === orderId) {
          setDeferredOrder(mapped)
        }
      }
    } catch (e) {
      console.error(e)
    } finally {
      setReloading(false)
    }
  }

  // If order was already placed, show order confirmation
  const displayOrder = currentOrder || deferredOrder || navOrder
  if (displayOrder) {
    const order = displayOrder
    const destinationLabel = order.orderType === 'drinks' ? 'Bar' : 'Kitchen'
    return (
      <div className="customer-cart-page" style={styles.container}>
        <div className="customer-order-confirmation" style={styles.successContainer}>
          <OrderTableHeading order={order} size="lg" block={false} style={{ marginBottom: 12 }} />
          <span className="customer-order-number">{t("ORDER")}{' '}{order.orderNumber}</span>
          <h1 className="customer-order-confirmation-title" style={styles.successTitle}>
            {currentOrder ? t("Order Placed!") : 'Order Sent to ' + destinationLabel + '!'}
          </h1>
          <p className="customer-order-confirmation-subtitle" style={styles.successSubtitle}>{t("Your order has been sent to the")}{destinationLabel.toLowerCase()}.
          </p>
          <div className="customer-order-receipt" style={styles.orderSummary}>
            <div className="customer-order-receipt-meta">
              <p><span>{t("Table")}</span><strong>{order.tableNumber}</strong></p>
              <p><span>{t("Order type")}</span><strong>{order.orderType}</strong></p>
              <p><span>{t("Total")}</span><strong>{formatCurrency(order.total)}</strong></p>
            </div>
            {order.items && order.items.length > 0 && (
              <div className="customer-order-receipt-items" style={{ marginTop: 12, borderTop: '1px solid #dee2e6', paddingTop: 8 }}>
                {order.items.map((item, idx) => (
                  <div key={idx} className="customer-order-receipt-item" style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 14 }}>
                    <span>{item.name} × {item.quantity}</span>
                    <span>{formatCurrency((item.lineTotal ?? item.price * item.quantity))}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {currentOrder ? (
            <>
              <p className="customer-order-help" style={styles.helpText}>{t("When your order is ready, scan the QR code again to proceed to payment.")}</p>
              <button
                className="customer-order-action customer-order-add-more"
                style={{ ...styles.primaryBtn, backgroundColor: '#0d6efd' }}
                onClick={() => setAddItemsOrder(order)}
                disabled={reloading}
              >
                {reloading ? t("Loading...") : t("Add More Items")}
              </button>
              <button
                className="customer-order-action customer-order-pay"
                style={styles.primaryBtn}
                onClick={() => navigate('/payment', { state: { order } })}
              >{t("Proceed to Payment")}</button>
            </>
          ) : (
            <>
              <p className="customer-order-help" style={styles.helpText}>{t("Enjoy your meal! You can pay later by scanning the QR code or asking your waiter.")}</p>
              <button
                className="customer-order-action customer-order-add-more"
                style={{ ...styles.primaryBtn, backgroundColor: '#0d6efd' }}
                onClick={() => setAddItemsOrder(order)}
                disabled={reloading}
              >
                {reloading ? t("Loading...") : t("Add More Items")}
              </button>
              <button
                className="customer-order-action customer-order-pay"
                style={styles.primaryBtn}
                onClick={() => navigate('/payment', { state: { order } })}
              >{t("Proceed to Payment")}</button>
            </>
          )}
          <button
            className="customer-order-action customer-order-back"
            style={styles.secondaryBtn}
            onClick={() => { resetSession(); navigate(menuPath) }}
          >{t("Back to Menu")}</button>
        </div>

        {addItemsOrder && (
          <CustomerAddItemsModal
            order={addItemsOrder}
            onClose={() => setAddItemsOrder(null)}
            onSuccess={() => {
              setAddItemsOrder(null)
              reloadOrder(addItemsOrder.id)
            }}
          />
        )}
      </div>
    )
  }

  const handlePlaceOrder = async () => {
    setOrdering(true)
    setError(null)
    try {
      const order = await placeOrder()
      // Success state handled by currentOrder above
    } catch (err) {
      setError(err.message)
      setOrdering(false)
    }
  }

  const handlePlaceDeferredOrder = async () => {
    setOrdering(true)
    setError(null)
    try {
      await placeDeferredOrder()
    } catch (err) {
      setError(err.message)
      setOrdering(false)
    }
  }

  if (cart.length === 0) {
    return (
      <div className="customer-cart-page" style={styles.container}>
        <div style={styles.emptyContainer}>
          <h2 style={styles.emptyTitle}>{t("Your Cart is Empty")}</h2>
          <p style={styles.emptyText}>{t("Browse the menu and add some items!")}</p>
          <button
            style={styles.primaryBtn}
            onClick={() => navigate(menuPath)}
          >{t("Browse Menu")}</button>
        </div>
      </div>
    )
  }

  return (
    <div className="customer-cart-page" style={styles.container}>
      {/* Header */}
      <div className="customer-cart-header" style={styles.header}>
        <button style={styles.backBtn} onClick={() => navigate(menuPath)}>{t("← Back")}</button>
        <h1 style={styles.title}>{t("My Cart")}</h1>
        <div style={styles.headerSpacer}></div>
      </div>

      <div className="customer-cart-layout" style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        <div className="customer-cart-items" style={{ flex: 1 }}>
          <div className="customer-cart-table-header" style={styles.tableHeader}>
            <div className="cart-col-item" style={{ flex: 4 }}>{t("Item")}</div>
            <div className="cart-col-price" style={{ flex: 2 }}>{t("Unit Price")}</div>
            <div className="cart-col-qty" style={{ width: 120, textAlign: 'center' }}>{t("Qty")}</div>
            <div className="cart-col-total" style={{ width: 120, textAlign: 'right' }}>{t("Total")}</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {cart.map((item) => (
              <div key={item.productId} className="customer-cart-row" style={styles.cartRow}>
                <div className="customer-cart-item-info" style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 4, minWidth: 0 }}>
                  <div style={styles.itemImage}>
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.name} style={styles.thumbImg} />
                    ) : null}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>{item.name}</div>
                    <div style={{ color: '#6c757d', fontSize: 13 }}>{item.category || ''}</div>
                    {item.notes && <div style={{ marginTop: 6, color: '#495057', fontSize: 13 }}>{t("Special:")}{' '}{item.notes}</div>}
                  </div>
                </div>

                <div className="customer-cart-unit-price" style={{ flex: 2, alignSelf: 'center' }}>{formatCurrency(item.price)}</div>

                <div className="customer-cart-quantity" style={{ width: 120, textAlign: 'center' }}>
                  <button
                    className="customer-cart-qty-btn"
                    aria-label={t('Decrease quantity')}
                    style={styles.qtyBtn}
                    onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                  >
                    -
                  </button>
                  <span style={{ margin: '0 8px', fontWeight: 700 }}>{item.quantity}</span>
                  <button
                    className="customer-cart-qty-btn"
                    aria-label={t('Increase quantity')}
                    style={styles.qtyBtn}
                    onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                  >
                    +
                  </button>
                </div>

                <div className="customer-cart-line-total" style={{ width: 120, textAlign: 'right' }}>
                  <div className="customer-cart-item-total" style={styles.totalText}>{formatCurrency(item.price * item.quantity)}</div>
                  <button style={styles.removeBtn} aria-label={t('Remove item')} onClick={() => removeFromCart(item.productId)}>✕</button>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>{t("Special Instructions")}</div>
            <textarea placeholder={t("No special instructions")} className="customer-cart-instructions" style={{ width: '100%', minHeight: 56, padding: 10, borderRadius: 8, border: '1px solid #dee2e6' }} />
            <div style={{ marginTop: 8 }}>
              <button style={{ ...styles.primaryBtn, padding: '8px 12px' }} onClick={() => navigate(menuPath)}>{t("Add Items")}</button>
            </div>
          </div>
        </div>

        <aside className="customer-cart-summary" style={styles.sideSummary}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>{t("Order Summary")}</div>
          <div style={styles.summaryRow}><span>{t("Subtotal")}</span><span>{formatCurrency(getCartTotal())}</span></div>
          <div style={styles.summaryRow}><span>{t("Discount")}</span><span>{formatCurrency(0)}</span></div>
          <div style={{ height: 1, background: '#e9ecef', margin: '12px 0' }} />
          <div style={{ ...styles.summaryRow, fontWeight: 800, fontSize: 18 }}><span>{t("Total")}</span><span>{formatCurrency(getCartTotal())}</span></div>
          <div style={{ color: '#6c757d', marginTop: 8 }}>{t("Items:")}{' '}{getCartCount()}</div>

          <div style={{ marginTop: 18 }}>
            <button
              style={{ ...styles.placeOrderBtn, width: '100%' }}
              onClick={handlePlaceOrder}
              disabled={ordering}
            >
              {ordering ? t("Placing Order...") : t("Place Order")}
            </button>
            <button
              style={{ ...styles.payAfterBtn, width: '100%' }}
              onClick={handlePlaceDeferredOrder}
              disabled={ordering}
            >
              {ordering ? t("Processing...") : t("Pay After Service")}
            </button>
          </div>
        </aside>
      </div>

      

      {error && (
        <div style={styles.errorBox}>
          {t(error)}
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
    maxWidth: '480px',
    margin: '0 auto',
    padding: '16px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    backgroundColor: '#f8f9fa',
    minHeight: '100vh',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '20px',
    paddingTop: '10px',
  },
  backBtn: {
    background: 'none',
    border: 'none',
    fontSize: '16px',
    color: '#e63946',
    cursor: 'pointer',
    padding: '8px 0',
    fontWeight: '600',
  },
  title: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#1a1a2e',
    margin: 0,
  },
  headerSpacer: {
    width: '60px',
  },
  cartItems: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginBottom: '20px',
  },
  cartItem: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '12px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
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
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#1a1a2e',
    margin: '0 0 4px 0',
  },
  itemPrice: {
    fontSize: '13px',
    color: '#6c757d',
    margin: 0,
  },
  quantityControl: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  qtyBtn: {
    width: '30px',
    height: '30px',
    borderRadius: '50%',
    border: '1px solid #dee2e6',
    backgroundColor: 'white',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#1a1a2e',
  },
  qtyValue: {
    width: '24px',
    textAlign: 'center',
    fontSize: '14px',
    fontWeight: '600',
  },
  itemTotal: {
    textAlign: 'right',
    minWidth: '60px',
  },
  totalText: {
    fontSize: '14px',
    fontWeight: '700',
    color: '#e63946',
    margin: '0 0 4px 0',
  },
  removeBtn: {
    background: 'none',
    border: 'none',
    color: '#dc3545',
    cursor: 'pointer',
    fontSize: '12px',
    padding: '2px',
  },
  tableHeader: {
    display: 'flex',
    gap: '12px',
    padding: '12px',
    fontSize: '13px',
    color: '#6c757d',
    backgroundColor: 'white',
    borderRadius: '8px',
    alignItems: 'center',
    marginBottom: 8,
  },
  cartRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    background: 'white',
    borderRadius: 8,
    boxShadow: '0 1px 4px rgba(0,0,0,0.04)'
  },
  sideSummary: {
    width: 320,
    background: 'white',
    borderRadius: 12,
    padding: 16,
    boxShadow: '0 2px 12px rgba(0,0,0,0.06)'
  },
  summary: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '16px',
    marginBottom: '20px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  },
  summaryRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 0',
    fontSize: '14px',
    color: '#6c757d',
  },
  totalRow: {
    borderTop: '1px solid #dee2e6',
    marginTop: '8px',
    paddingTop: '12px',
    fontSize: '18px',
    fontWeight: '700',
    color: '#1a1a2e',
  },
  placeOrderBtn: {
    width: '100%',
    padding: '16px',
    backgroundColor: '#e63946',
    color: 'white',
    border: 'none',
    borderRadius: '12px',
    fontSize: '18px',
    fontWeight: '700',
    cursor: 'pointer',
    marginBottom: '40px',
  },
  placeOrderBtnDisabled: {
    opacity: 0.7,
    cursor: 'not-allowed',
  },
  payAfterBtn: {
    width: '100%',
    padding: '16px',
    backgroundColor: '#2d6a4f',
    color: 'white',
    border: 'none',
    borderRadius: '12px',
    fontSize: '18px',
    fontWeight: '700',
    cursor: 'pointer',
    marginBottom: '40px',
  },
  errorBox: {
    backgroundColor: '#fce4e4',
    color: '#cc0000',
    padding: '12px',
    borderRadius: '8px',
    marginBottom: '16px',
    fontSize: '14px',
    textAlign: 'center',
  },
  emptyContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '60vh',
    textAlign: 'center',
  },
  emptyIcon: {
    fontSize: '64px',
    marginBottom: '16px',
  },
  emptyTitle: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#1a1a2e',
    margin: '0 0 8px 0',
  },
  emptyText: {
    color: '#6c757d',
    margin: '0 0 24px 0',
  },
  primaryBtn: {
    padding: '12px 32px',
    backgroundColor: '#e63946',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  secondaryBtn: {
    padding: '12px 32px',
    backgroundColor: 'transparent',
    color: '#e63946',
    border: '2px solid #e63946',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    marginTop: '12px',
  },
  successContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '60vh',
    textAlign: 'center',
  },
  successIcon: {
    fontSize: '64px',
    marginBottom: '16px',
  },
  successTitle: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#2d6a4f',
    margin: '0 0 8px 0',
  },
  successSubtitle: {
    color: '#6c757d',
    margin: '0 0 20px 0',
    fontSize: '16px',
  },
  orderSummary: {
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '20px',
    width: '100%',
    maxWidth: '300px',
    textAlign: 'left',
  },
  helpText: {
    color: '#6c757d',
    fontSize: '14px',
    margin: '0 0 20px 0',
    fontStyle: 'italic',
  },
}
