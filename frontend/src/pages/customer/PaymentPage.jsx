import { usePreferences } from '../../context/PreferencesContext'
import React, { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useCustomer } from '../../context/CustomerContext'
import * as api from '../../api/endpoints'
import CustomerAddItemsModal from '../../components/CustomerAddItemsModal'

const PAYMENT_METHODS = [
  { id: 'mtn_momo', name: 'MTN Mobile Money', icon: '📱', color: '#ffc107' },
  { id: 'airtel_money', name: 'Airtel Money', icon: '📱', color: '#e63946' },
  { id: 'cash', name: 'Cash', icon: '💵', color: '#2d6a4f' },
]

export default function PaymentPage() {
  const { t } = usePreferences()
  const navigate = useNavigate()
  const location = useLocation()
  const { currentOrder, tableNumber, businessId, branchId, resetSession, setCurrentOrder } = useCustomer()
  const paymentLinkOrderId = new URLSearchParams(location.search).get('orderId')
  const paymentLinkProviders = new URLSearchParams(location.search).get('providers')?.split(',').filter(Boolean) || []
  const [selectedMethod, setSelectedMethod] = useState(null)
  const [phoneNumber, setPhoneNumber] = useState('')
  const [processing, setProcessing] = useState(false)
  const [step, setStep] = useState('select') // select | ussd | receipt
  const [paymentResult, setPaymentResult] = useState(null)
  const [receipt, setReceipt] = useState(null)
  const [smsSent, setSmsSent] = useState(false)
  const [error, setError] = useState(null)
  const [lookupTable, setLookupTable] = useState('')
  const [lookupResults, setLookupResults] = useState([])
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupError, setLookupError] = useState(null)
  const [addItemsOrder, setAddItemsOrder] = useState(null)
  const [reloading, setReloading] = useState(false)
  const [paymentLinkLoading, setPaymentLinkLoading] = useState(Boolean(paymentLinkOrderId))
  const [paymentLinkError, setPaymentLinkError] = useState(null)

  const navOrder = location.state?.order
  const savedOrder = navOrder || currentOrder
  const activeOrder = paymentLinkOrderId
    ? ((savedOrder?.orderId || savedOrder?.id) === paymentLinkOrderId ? savedOrder : null)
    : savedOrder
  const returnTo = location.state?.returnTo || '/cart'

  useEffect(() => {
    if (navOrder && !currentOrder) {
      setCurrentOrder(navOrder)
    }
  }, [navOrder, currentOrder, setCurrentOrder])

  useEffect(() => {
    if (!paymentLinkOrderId) {
      setPaymentLinkLoading(false)
      return undefined
    }
    if (activeOrder) {
      setPaymentLinkLoading(false)
      return undefined
    }

    let active = true
    setPaymentLinkLoading(true)
    setPaymentLinkError(null)
    api.checkOrderStatus(paymentLinkOrderId)
      .then((result) => {
        if (!active) return
        if (['paid', 'cancelled'].includes(String(result.status || '').toLowerCase())) {
          setPaymentLinkError(`${t('This order is already')} ${String(result.status).toLowerCase()}.`)
          return
        }
        setCurrentOrder({
          id: result.orderId || result.id,
          orderId: result.orderId || result.id,
          orderNumber: result.order_number || result.orderNumber,
          tableNumber: result.table_number || result.tableNumber,
          total: Number(result.total_amount ?? result.total) || 0,
          orderType: result.order_type || result.orderType,
          items: [],
          status: result.status,
        })
      })
      .catch((err) => {
        if (active) setPaymentLinkError(err.response?.data?.error || err.message || 'Unable to load this order.')
      })
      .finally(() => {
        if (active) setPaymentLinkLoading(false)
      })

    return () => { active = false }
  }, [paymentLinkOrderId, activeOrder, setCurrentOrder])

  useEffect(() => {
    const pendingOnline = step === 'ussd' && paymentResult?.status === 'pending'
    const pendingCash = step === 'cash' && paymentResult?.status === 'pending_cash'
    if (!pendingOnline && !pendingCash) return undefined

    let active = true
    let checking = false
    const checkStatus = async () => {
      if (checking) return
      checking = true
      try {
        const result = await api.verifyPayment(paymentResult.paymentId)
        if (!active) return
        if (result.status === 'completed') {
          setReceipt(result.receipt)
          setSmsSent(Boolean(result.smsSent))
          setStep('receipt')
        } else if (result.status === 'failed') {
          setPaymentResult((current) => ({ ...current, status: 'failed' }))
          setError(t("The payment was declined or could not be completed. Please try again."))
        }
      } catch (err) {
        if (active) setError(err.response?.data?.error || err.message || t("Unable to check payment status."))
      } finally {
        checking = false
      }
    }
    const interval = window.setInterval(checkStatus, 3000)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [step, paymentResult])

  // If no order, allow looking up by table number
  if (!activeOrder) {
    if (paymentLinkOrderId) {
      return (
        <div style={styles.container}>
          <div style={styles.lookupCard}>
            <h1 style={styles.lookupTitle}>{paymentLinkLoading ? t("Loading payment details") : t("Unable to continue with payment")}</h1>
            <p style={styles.lookupText}>
              {paymentLinkLoading ? t("Please wait while we securely load this order.") : paymentLinkError ? t(paymentLinkError) : t('The order could not be loaded.')}
            </p>
            {!paymentLinkLoading && <button style={styles.primaryBtn} onClick={() => navigate('/menu')}>{t("Back to menu")}</button>}
          </div>
        </div>
      )
    }

    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <button style={styles.backBtn} onClick={() => navigate('/menu')}>{t("← Back")}</button>
          <h1 style={styles.title}>{t("Payment")}</h1>
          <div style={styles.headerSpacer}></div>
        </div>

        {lookupResults.length === 0 ? (
          <>
            <div style={styles.lookupCard}>
              <h2 style={styles.lookupTitle}>{t("Look up your order")}</h2>
              <p style={styles.lookupText}>{t("Enter your table number to find your unpaid order.")}</p>
              <div style={styles.lookupInputRow}>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder={t("Table number")}
                  value={lookupTable}
                  onChange={(e) => setLookupTable(e.target.value)}
                  style={styles.lookupInput}
                />
                <button
                  style={styles.lookupBtn}
                  onClick={async () => {
                    setLookupLoading(true)
                    setLookupError(null)
                    try {
                      const data = await api.fetchOrdersByTable(lookupTable, businessId, branchId)
                      setLookupResults(data.orders || [])
                    } catch (err) {
                      setLookupError(err.message)
                    } finally {
                      setLookupLoading(false)
                    }
                  }}
                  disabled={lookupLoading || !lookupTable}
                >
                  {lookupLoading ? t("Looking up...") : t("Find Order")}
                </button>
              </div>
              {lookupError && <div style={styles.errorBox}>{t(lookupError)}</div>}
              {lookupResults.length === 0 && lookupTable && !lookupLoading && !lookupError && (
                <p style={styles.lookupNoResults}>{t("No unpaid orders found for this table.")}</p>
              )}
            </div>

            <div style={styles.orSection}>
              <span style={styles.orText}>{t("or")}</span>
            </div>

            <button style={styles.primaryBtn} onClick={() => navigate('/menu')}>{t("Place a New Order")}</button>
          </>
        ) : (
          <>
            <div style={styles.lookupCard}>
              <h2 style={styles.lookupTitle}>{t("Select your order")}</h2>
              {lookupResults.map((order) => (
                <div
                  key={order.orderId}
                  style={styles.orderOption}
                  onClick={() => {
                    setCurrentOrder({
                      orderId: order.orderId,
                      orderNumber: order.orderNumber,
                      tableNumber: order.tableNumber,
                      total: order.total,
                      orderType: order.orderType,
                      items: order.items,
                    })
                    setSelectedMethod(null)
                    setPhoneNumber('')
                    setStep('select')
                    setPaymentResult(null)
                    setReceipt(null)
                    setSmsSent(false)
                    setError(null)
                    setLookupResults([])
                    setLookupTable('')
                  }}
                >
                  <div style={styles.orderOptionHeader}>
                    <span style={styles.orderOptionNumber}>{t("Order")}{' '}{order.orderNumber}</span>
                    <span style={styles.orderOptionStatus}>{order.status}</span>
                  </div>
                  <p style={styles.orderOptionDetail}>{t("Table")}{' '}{order.tableNumber} • {order.items.length}{' '}{t("item")}{order.items.length !== 1 ? t("s") : ''}</p>
                  <p style={styles.orderOptionTotal}>{formatCurrency(order.total)}</p>
                </div>
              ))}
              <button
                style={styles.secondaryBtn}
                onClick={() => {
                  setLookupResults([])
                  setLookupError(null)
                }}
              >{t("← Back")}</button>
            </div>
          </>
        )}
      </div>
    )
  }

  if (paymentLinkOrderId && ['paid', 'cancelled'].includes(String(activeOrder.status || '').toLowerCase())) {
    return (
      <div style={styles.container}>
        <div style={styles.lookupCard}>
          <h1 style={styles.lookupTitle}>{t("Order")}{' '}{String(activeOrder.status).toLowerCase()}</h1>
          <p style={styles.lookupText}>{t("This payment link can no longer be used.")}</p>
        </div>
      </div>
    )
  }

  const handleMethodSelect = (method) => {
    setSelectedMethod(method)
    setError(null)
    if (method === 'cash') {
      handleInitiatePayment(method, '')
    }
  }

  const handleInitiatePayment = async (method, phone) => {
    if (!activeOrder?.orderId) {
      setError(t("No active order found. Please place an order first."))
      return
    }

    setProcessing(true)
    setError(null)
    try {
      const result = await api.initiatePayment({
        orderId: activeOrder.orderId,
        method: method,
        customerPhone: phone || '',
      })

      if (!result?.paymentId) {
        throw new Error('Payment initiation failed: no payment ID returned')
      }

      setPaymentResult(result)

      if (result.status === 'pending') {
        setStep('ussd')
      } else if (result.status === 'pending_cash') {
        setStep('cash')
      } else {
        const verifyResult = await api.verifyPayment(result.paymentId)
        if (verifyResult.status === 'completed') {
          setReceipt(verifyResult.receipt)
          setSmsSent(verifyResult.smsSent)
          setStep('receipt')
        }
      }
    } catch (err) {
      const message = err.response?.data?.error || err.message || 'Payment failed'
      setError(message)
    } finally {
      setProcessing(false)
    }
  }

  const handleUSSDConfirm = async () => {
    if (!paymentResult?.paymentId) return
    setProcessing(true)
    try {
      const verifyResult = await api.verifyPayment(paymentResult.paymentId)
      if (verifyResult.status === 'completed') {
        setReceipt(verifyResult.receipt)
        setSmsSent(verifyResult.smsSent)
        setStep('receipt')
      } else if (verifyResult.status === 'failed') {
        setPaymentResult((current) => ({ ...current, status: 'failed' }))
        setError(t("The payment was declined or could not be completed. Please try again."))
      } else {
        setError(t("The provider has not confirmed your payment yet."))
      }
    } catch (err) {
      const message = err.response?.data?.error || err.message || 'Payment verification failed'
      setError(message)
    } finally {
      setProcessing(false)
    }
  }

  const menuParams = new URLSearchParams({ table: String(activeOrder?.tableNumber || tableNumber || '1') })
  if (businessId) menuParams.set('businessId', businessId)
  if (branchId) menuParams.set('branchId', branchId)
  const newOrderPath = `/menu?${menuParams.toString()}`

  const reloadOrder = async (orderId) => {
    setReloading(true)
    try {
      const data = await api.fetchOrdersByTable(activeOrder.tableNumber, businessId, branchId)
      const updated = data.orders.find((o) => o.orderId === orderId)
      if (updated) {
        setCurrentOrder({
          orderId: updated.orderId,
          orderNumber: updated.orderNumber,
          tableNumber: updated.tableNumber,
          total: updated.total,
          orderType: updated.orderType,
          items: updated.items,
          status: updated.status,
        })
      }
    } catch (e) {
      console.error(e)
    } finally {
      setReloading(false)
    }
  }

  if (step === 'cash' && paymentResult) {
    return (
      <div style={styles.container}>
        <div style={styles.ussdContainer}>
          <h2 style={styles.ussdTitle}>{t("Completing cash payment")}</h2>
          <p style={styles.ussdSubtitle}>{t("Your order will be marked paid automatically. No staff approval is needed.")}</p>
          <div style={styles.ussdDetails}>
            <div style={styles.ussdRow}><span>{t("Amount")}</span><strong>{formatCurrency(activeOrder.total || activeOrder.total_amount)}</strong></div>
            <div style={styles.ussdRow}><span>{t("Reference")}</span><strong>{paymentResult.reference}</strong></div>
          </div>
          {error && <div style={styles.errorBox}>{t(error)}</div>}
        </div>
      </div>
    )
  }

  // Step: Provider confirmation
  if (step === 'ussd' && paymentResult) {
    return (
      <div style={styles.container}>
        <div style={styles.ussdContainer}>
          <h2 style={styles.ussdTitle}>{t("Approve payment on your phone")}</h2>
          <p style={styles.ussdSubtitle}>{paymentResult.message}</p>

            <div style={styles.ussdDetails}>
              <div style={styles.ussdRow}>
                <span>{t("Provider")}</span>
                <strong>{selectedMethod === 'mtn_momo' ? t("MTN MoMo") : t("Airtel Money")}</strong>
              </div>
              <div style={styles.ussdRow}>
                <span>{t("Amount")}</span>
                <strong style={{ color: '#e63946' }}>
                  {formatCurrency(activeOrder.total || activeOrder.total_amount)}
                </strong>
              </div>
            <div style={styles.ussdRow}>
              <span>{t("Reference")}</span>
              <strong>{paymentResult.reference}</strong>
            </div>
          </div>

          <div style={styles.ussdInstructions}>
            <h3 style={styles.instructionsTitle}>{t("Waiting for provider confirmation")}</h3>
            <p style={styles.instructionStep}>{t("Approve the payment prompt on your phone. This page will update automatically once the provider confirms payment.")}</p>
          </div>

          {paymentResult.status === 'failed' ? (
            <button
              style={styles.primaryBtn}
              onClick={() => {
                setStep('select')
                setPaymentResult(null)
                setSelectedMethod(null)
                setError(null)
              }}
            >{t("Try another payment method")}</button>
          ) : (
            <button
              style={{
                ...styles.primaryBtn,
                ...(processing ? { opacity: 0.7 } : {}),
              }}
              onClick={handleUSSDConfirm}
              disabled={processing}
            >
              {processing ? t("Checking...") : t("Check payment status")}
            </button>
          )}

          {error && <div style={styles.errorBox}>{t(error)}</div>}
        </div>
      </div>
    )
  }

  // Step: Show Receipt
  if (step === 'receipt' && receipt) {
    return (
      <div style={styles.container}>
        <div style={styles.receiptContainer}>
          <div style={styles.receiptHeader}>
            <h1 style={styles.receiptTitle}>{t("Payment Successful!")}</h1>
          </div>

          <div style={styles.receiptCard}>
            <div style={styles.receiptBusiness}>
              <h2 style={styles.businessName}>{receipt.businessName}</h2>
              <p style={styles.receiptNumber}>{t("Receipt:")}{' '}{receipt.receiptNumber}</p>
            </div>

            <div style={styles.receiptInfo}>
              <div style={styles.receiptRow}>
                <span>{t("Order")}</span>
                <span>{receipt.orderNumber}</span>
              </div>
              <div style={styles.receiptRow}>
                <span>{t("Table")}</span>
                <span>{receipt.tableNumber}</span>
              </div>
              <div style={styles.receiptRow}>
                <span>{t("Payment")}</span>
                <span>{receipt.paymentMethod.replace('_', ' ').toUpperCase()}</span>
              </div>
              {receipt.waiterName && (
                <div style={styles.receiptRow}>
                  <span>{t("Waiter")}</span>
                  <span>{receipt.waiterName}</span>
                </div>
              )}
              <div style={styles.receiptRow}>
                <span>{t("Date")}</span>
                <span>{receipt.date}</span>
              </div>
              <div style={styles.receiptRow}>
                <span>{t("Reference")}</span>
                <span>{receipt.reference}</span>
              </div>
            </div>

            <div style={styles.receiptItems}>
              <h3 style={styles.itemsTitle}>{t("Items")}</h3>
              {receipt.items.map((item, index) => (
                <div key={index} style={styles.receiptItemRow}>
                  <span style={styles.itemName}>{item.name}{' '}{t("x")}{item.quantity}</span>
                  <span>{formatCurrency(item.lineTotal)}</span>
                </div>
              ))}
            </div>

            <div style={styles.receiptTotal}>
              <span>{t("Total Paid")}</span>
              <span style={styles.totalAmount}>{formatCurrency(receipt.total)}</span>
            </div>
          </div>

          <p style={styles.thankYou}>{t("Thank you for your order! 🎉")}</p>

          {smsSent && (
            <p style={styles.smsSentText}>{t("📱 Receipt sent to your phone")}</p>
          )}

          <Link to={newOrderPath} style={styles.primaryBtn} onClick={resetSession}>{t("Start New Order")}</Link>
        </div>
      </div>
    )
  }

  // Step: Select Payment Method
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={() => navigate(returnTo)}>{t("← Back")}</button>
        <h1 style={styles.title}>{t("Payment")}</h1>
        <div style={styles.headerSpacer}></div>
      </div>

      {/* Order Summary */}
      <div style={styles.orderCard}>
        <p style={styles.orderLabel}>{t("Order")}{' '}{activeOrder.orderNumber}</p>
        <p style={styles.orderAmount}>{formatCurrency(activeOrder.total || activeOrder.total_amount)}</p>
        <p style={styles.orderTable}>{t("Table")}{' '}{activeOrder.tableNumber}</p>
      </div>

      <button
        hidden={Boolean(paymentLinkOrderId)}
        style={{
          ...styles.primaryBtn,
          backgroundColor: '#0d6efd',
          marginBottom: 16,
        }}
        onClick={() => setAddItemsOrder(activeOrder)}
        disabled={reloading}
      >
        {reloading ? t("Loading...") : t("Add More Items")}
      </button>

      {/* Payment Methods */}
      <h2 style={styles.sectionTitle}>{t("Choose Payment Method")}</h2>
      <div style={styles.methodsList}>
        {PAYMENT_METHODS.filter((method) => {
          if (!paymentLinkOrderId) return true
          if (method.id === 'cash') return false
          return paymentLinkProviders.length === 0 || paymentLinkProviders.includes(method.id)
        }).map((method) => (
          <button
            key={method.id}
            style={{
              ...styles.methodBtn,
              ...(selectedMethod === method.id ? { ...styles.methodBtnActive, borderColor: method.color } : {}),
            }}
            onClick={() => setSelectedMethod(method.id)}
          >
            <span style={styles.methodName}>{t(method.name)}</span>
          </button>
        ))}
      </div>

      {/* Phone Number Input (for mobile money) */}
      {selectedMethod && selectedMethod !== 'cash' && (
        <div style={styles.phoneSection}>
          <label style={styles.phoneLabel}>{t("Mobile Money Phone Number")}</label>
          <input
            type="tel"
            placeholder={t("e.g. 0788123456")}
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            style={styles.phoneInput}
          />
        </div>
      )}

        {error && <div style={styles.errorBox}>{t(error)}</div>}

      {/* Pay Button */}
      <button
        style={{
          ...styles.payBtn,
          ...(!selectedMethod || processing ? styles.payBtnDisabled : {}),
        }}
        onClick={() => handleInitiatePayment(selectedMethod, phoneNumber)}
        disabled={!selectedMethod || processing}
      >
        {processing
          ? t("Processing...")
          : `Pay ${formatCurrency(activeOrder.total || activeOrder.total_amount)}`}
      </button>

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
  orderCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: '12px',
    padding: '20px',
    textAlign: 'center',
    marginBottom: '24px',
    color: 'white',
  },
  orderLabel: {
    fontSize: '14px',
    opacity: 0.8,
    margin: '0 0 8px 0',
  },
  orderAmount: {
    fontSize: '36px',
    fontWeight: '700',
    margin: '0 0 4px 0',
  },
  orderTable: {
    fontSize: '14px',
    opacity: 0.8,
    margin: 0,
  },
  sectionTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#1a1a2e',
    marginBottom: '12px',
  },
  methodsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginBottom: '24px',
  },
  methodBtn: {
    display: 'flex',
    alignItems: 'center',
    padding: '16px',
    backgroundColor: 'white',
    borderRadius: '12px',
    border: '2px solid #e9ecef',
    cursor: 'pointer',
    gap: '12px',
    transition: 'all 0.2s',
  },
  methodBtnActive: {
    borderWidth: '2px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  methodIcon: {
    fontSize: '28px',
  },
  methodName: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#1a1a2e',
    flex: 1,
    textAlign: 'left',
  },
  checkMark: {
    color: '#2d6a4f',
    fontSize: '18px',
    fontWeight: '700',
  },
  phoneSection: {
    marginBottom: '24px',
  },
  phoneLabel: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '600',
    color: '#1a1a2e',
    marginBottom: '8px',
  },
  phoneInput: {
    width: '100%',
    padding: '14px',
    border: '2px solid #dee2e6',
    borderRadius: '8px',
    fontSize: '16px',
    boxSizing: 'border-box',
    outline: 'none',
  },
  payBtn: {
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
  payBtnDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
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
  // USSD Step
  ussdContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    paddingTop: '40px',
  },
  ussdIcon: {
    fontSize: '64px',
    marginBottom: '16px',
  },
  ussdTitle: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#1a1a2e',
    margin: '0 0 8px 0',
  },
  ussdSubtitle: {
    fontSize: '14px',
    color: '#6c757d',
    textAlign: 'center',
    margin: '0 0 24px 0',
    lineHeight: '1.5',
  },
  ussdDetails: {
    width: '100%',
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '16px',
    marginBottom: '20px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  },
  ussdRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 0',
    fontSize: '14px',
    borderBottom: '1px solid #f0f0f0',
  },
  ussdInstructions: {
    width: '100%',
    backgroundColor: '#fff3cd',
    borderRadius: '12px',
    padding: '16px',
    marginBottom: '20px',
  },
  instructionsTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#856404',
    margin: '0 0 8px 0',
  },
  instructionStep: {
    fontSize: '13px',
    color: '#856404',
    margin: '0 0 4px 0',
    lineHeight: '1.6',
  },
  // Receipt Step
  receiptContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    paddingTop: '20px',
  },
  receiptHeader: {
    textAlign: 'center',
    marginBottom: '20px',
  },
  successIcon: {
    fontSize: '48px',
    marginBottom: '8px',
  },
  receiptTitle: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#2d6a4f',
    margin: 0,
  },
  receiptCard: {
    width: '100%',
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    marginBottom: '20px',
  },
  receiptBusiness: {
    textAlign: 'center',
    marginBottom: '16px',
    paddingBottom: '16px',
    borderBottom: '2px dashed #dee2e6',
  },
  businessName: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#1a1a2e',
    margin: '0 0 4px 0',
  },
  receiptNumber: {
    fontSize: '12px',
    color: '#6c757d',
    margin: 0,
  },
  receiptInfo: {
    marginBottom: '16px',
  },
  receiptRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '6px 0',
    fontSize: '13px',
    borderBottom: '1px solid #f0f0f0',
  },
  receiptItems: {
    marginBottom: '16px',
  },
  itemsTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#1a1a2e',
    margin: '0 0 8px 0',
  },
  receiptItemRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '6px 0',
    fontSize: '13px',
  },
  receiptTotal: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '12px 0 0',
    borderTop: '2px solid #1a1a2e',
    fontSize: '18px',
    fontWeight: '700',
    color: '#1a1a2e',
  },
  totalAmount: {
    color: '#e63946',
  },
  thankYou: {
    fontSize: '16px',
    color: '#6c757d',
    marginBottom: '24px',
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
    width: '100%',
    marginBottom: '40px',
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
  lookupCard: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    marginBottom: '20px',
  },
  lookupTitle: {
    fontSize: '18px',
    fontWeight: '700',
    color: '#1a1a2e',
    margin: '0 0 8px 0',
  },
  lookupText: {
    fontSize: '14px',
    color: '#6c757d',
    margin: '0 0 16px 0',
  },
  lookupInputRow: {
    display: 'flex',
    gap: '8px',
  },
  lookupInput: {
    flex: 1,
    padding: '14px',
    border: '2px solid #dee2e6',
    borderRadius: '8px',
    fontSize: '16px',
    outline: 'none',
  },
  lookupBtn: {
    padding: '14px 20px',
    backgroundColor: '#e63946',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  lookupNoResults: {
    fontSize: '14px',
    color: '#6c757d',
    marginTop: '12px',
    textAlign: 'center',
  },
  orSection: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: '20px',
  },
  orText: {
    fontSize: '14px',
    color: '#6c757d',
    backgroundColor: '#f8f9fa',
    padding: '0 12px',
  },
  orderOption: {
    backgroundColor: '#f8f9fa',
    borderRadius: '12px',
    padding: '16px',
    marginBottom: '12px',
    cursor: 'pointer',
    border: '2px solid transparent',
  },
  orderOptionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  orderOptionNumber: {
    fontSize: '16px',
    fontWeight: '700',
    color: '#1a1a2e',
  },
  orderOptionStatus: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#e63946',
    backgroundColor: '#ffe6e8',
    padding: '4px 10px',
    borderRadius: '20px',
  },
  orderOptionDetail: {
    fontSize: '14px',
    color: '#6c757d',
    margin: '0 0 4px 0',
  },
  orderOptionTotal: {
    fontSize: '18px',
    fontWeight: '700',
    color: '#1a1a2e',
    margin: 0,
  },
  smsSentText: {
    fontSize: '14px',
    color: '#2d6a4f',
    marginBottom: '20px',
    textAlign: 'center',
    fontWeight: '600',
  },
}
