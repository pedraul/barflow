import { usePreferences } from '../../context/PreferencesContext'
import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import * as api from '../../api/endpoints'
import QRCodeSVG from 'react-qr-code'

const money = (v) =>
  'RWF ' +
  Number(v || 0).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })

const PAYMENT_METHODS = [
  { id: 'mtn_momo', name: 'MTN Mobile Money', icon: '📱', color: '#ffc107' },
  { id: 'airtel_money', name: 'Airtel Money', icon: '📱', color: '#e63946' },
  { id: 'qr', name: 'QR Payment', icon: '🔲', color: '#0066FF' },
  { id: 'cash', name: 'Cash', icon: '💵', color: '#2d6a4f' },
]

export default function WaiterCheckout() {
  const { t } = usePreferences()
  const navigate = useNavigate()
  const location = useLocation()
  const order = location.state?.order

  const [step, setStep] = useState('phone')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [selectedMethod, setSelectedMethod] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [paymentResult, setPaymentResult] = useState(null)
  const [receipt, setReceipt] = useState(null)
  const [smsSent, setSmsSent] = useState(false)
  const [error, setError] = useState(null)
  const [qrData, setQrData] = useState(null)

  useEffect(() => {
    if (!order) navigate('/waiter/new-order')
    if (step === 'qr' && !qrData) {
      handleLoadQR()
    }
  }, [order, navigate, step, qrData])

  useEffect(() => {
    if (step !== 'qr' || !order?.id || !qrData?.qrPayload) return undefined

    let active = true
    let checking = false
    const checkOrderPaid = async () => {
      if (checking) return
      checking = true
      try {
        const result = await api.checkOrderStatus(order.id)
        if (active && String(result.status || '').toLowerCase() === 'paid') {
          navigate('/waiter/orders', { state: { paid: true, orderNumber: order.orderNumber } })
        }
      } catch {
        // Keep waiting; the customer checkout continues polling the provider.
      } finally {
        checking = false
      }
    }

    checkOrderPaid()
    const interval = window.setInterval(checkOrderPaid, 3000)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [step, order?.id, order?.orderNumber, qrData?.qrPayload, navigate])

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

  if (!order) return null

  const total = Number(order.total || order.subtotal || 0)

  const handleInitiate = async () => {
    setError(null)
    if (!selectedMethod) {
      setError(t("Choose a payment method."))
      return
    }

    setProcessing(true)
    try {
      if (selectedMethod === 'qr') {
        setStep('qr')
        return
      }

      if (selectedMethod !== 'cash' && !phoneNumber.trim()) {
        setError(t("Enter the client phone number to send the USSD prompt."))
        setProcessing(false)
        return
      }

      setProcessing(true)
      try {
        const result = await api.initiatePayment({
          orderId: order.id,
          method: selectedMethod,
          customerPhone: phoneNumber.trim(),
        })

        if (!result?.paymentId) {
          throw new Error('Payment initiation failed: no payment ID returned.')
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
        setError(err.response?.data?.error || err.message || t("Payment failed."))
      } finally {
        setProcessing(false)
      }
    } catch (e) {
      setError(e?.message || t("Payment failed."))
      setProcessing(false)
    }
  }

  const handleLoadQR = async () => {
    setError(null)
    setProcessing(true)
    try {
      const qrResult = await api.generateQRPayment(order.id)
      setQrData(qrResult)
    } catch (err) {
      setError(err.response?.data?.error || err.message || t("Failed to load QR code."))
    } finally {
      setProcessing(false)
    }
  }

  const handleConfirm = async () => {
    if (!paymentResult?.paymentId) return
    setProcessing(true)
    try {
      const verifyResult = await api.verifyPayment(paymentResult.paymentId)
      if (verifyResult.status === 'completed') {
        setReceipt(verifyResult.receipt)
        setSmsSent(Boolean(verifyResult.smsSent))
        setStep('receipt')
      } else if (verifyResult.status === 'failed') {
        setPaymentResult((current) => ({ ...current, status: 'failed' }))
        setError(t("The payment was declined or could not be completed. Please try again."))
      } else {
        setError(t("The provider has not confirmed payment yet."))
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || t("Payment verification failed."))
    } finally {
      setProcessing(false)
    }
  }

  const handleCashConfirm = async () => {
    if (!paymentResult?.paymentId) return
    setProcessing(true)
    setError(null)
    try {
      const result = await api.confirmCashPayment(paymentResult.paymentId)
      if (result.status !== 'completed' || !result.receipt) {
        throw new Error('Cash payment could not be confirmed.')
      }
      setReceipt(result.receipt)
      setSmsSent(Boolean(result.smsSent))
      setStep('receipt')
    } catch (err) {
      setError(err.response?.data?.error || err.message || t("Cash payment confirmation failed."))
    } finally {
      setProcessing(false)
    }
  }

  // Step: Phone number + method
  if (step === 'phone') {
    return (
      <div className="page waiter-checkout waiter-checkout-modern">
        <div className="user-page-heading waiter-checkout-heading">
          <div>
            <p className="eyebrow">{t("Waiter workspace")}</p>
            <h1>{t("Customer checkout")}</h1>
            <p>{t("Completing payment for the customer's order")}{order.orderNumber}{' '}{t("· Table")}{' '}
              {order.tableNumber}.{' '}
              {selectedMethod === 'qr'
                ? t("Select QR Payment to show a scannable code for the customer.")
                : selectedMethod === 'cash'
                  ? t("Select cash if the customer will pay at the counter.")
                  : t("Enter the customer's phone number to send the payment prompt on their phone.")}
            </p>
          </div>
        </div>

        <section className="section-card waiter-checkout-card">
          <div className="waiter-checkout-total">
            <div><span>{t("Order")}{' '}{order.orderNumber}</span><small>{t("Amount to collect")}</small></div>
            <strong>{money(total)}</strong>
          </div>

          {['mtn_momo', 'airtel_money'].includes(selectedMethod) && (
            <label className="waiter-checkout-phone-label">{t("Customer's phone number")}</label>
          )}
          {['mtn_momo', 'airtel_money'].includes(selectedMethod) && (
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder={t("e.g. 0788123456")}
              className="waiter-checkout-phone-input"
            />
          )}

          <div className="waiter-checkout-section-heading"><h2>{t("Choose a payment method")}</h2><span>{t("Secure payment")}</span></div>
          <div className="waiter-payment-options">
            {PAYMENT_METHODS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedMethod(m.id)}
                className={`waiter-payment-option${selectedMethod === m.id ? ' is-selected' : ''}`}
              >
                <span className="waiter-payment-icon">{m.icon}</span>
                <span className="waiter-payment-name">{t(m.name)}<small>{m.id === 'cash' ? t("Pay at the counter") : m.id === 'qr' ? t('Scan with a payment app') : t('Approve a prompt on the customer phone')}</small></span>
                {selectedMethod === m.id && <span style={{ marginLeft: 'auto', color: '#2d6a4f' }}>✓</span>}
              </button>
            ))}
          </div>

          {error && (
            <div className="subscription-lock" style={{ padding: '12px', marginTop: 16 }}>
              {t(error)}
            </div>
          )}

          <div className="waiter-checkout-actions">
            <button className="secondary-action" onClick={() => navigate('/waiter/cart')}>{t("Back")}</button>
            <button
              className="pay-action"
              disabled={processing}
              onClick={handleInitiate}
            >
              {processing
                ? (selectedMethod === 'qr' ? t("Generating QR…") : selectedMethod === 'cash' ? t("Recording…") : t("Sending prompt…"))
                : (selectedMethod === 'qr' ? t("Show QR code") : selectedMethod === 'cash' ? t("Continue to cash confirmation") : t("Send payment prompt"))}
            </button>
          </div>
        </section>
      </div>
    )
  }

  // Step: QR Payment
  if (step === 'qr') {
    return (
      <div className="page waiter-checkout waiter-checkout-modern">
        <div className="user-page-heading waiter-checkout-heading">
          <div>
            <p className="eyebrow">{t("Waiter workspace")}</p>
            <h1>{t("Scan to pay")}</h1>
            <p>{t("The customer scans this code to open the order checkout and pay with MTN or Airtel Money.")}</p>
          </div>
        </div>

        <section className="section-card waiter-checkout-card waiter-checkout-qr-card" style={{ textAlign: 'center' }}>
          {processing ? (
            <p>{t("Loading QR code…")}</p>
          ) : qrData?.qrPayload || qrData?.qrImage ? (
            <>
              <div className="waiter-checkout-qr-code">
                {qrData.qrPayload ? <QRCodeSVG value={qrData.qrPayload} size={240} /> : <img src={qrData.qrImage} alt={t("QR payment code")} />}
              </div>
              <div style={{ textAlign: 'left', margin: '20px auto', maxWidth: 320 }}>
                <Row label={t("Order")} value={order.orderNumber} />
                <Row label={t("Table")} value={order.tableNumber} />
                <Row label={t("Amount")} value={money(total)} />
                <Row label={t("Merchant")} value={qrData.order?.merchantName || 'BarFlow Business'} />
              </div>
              <div style={{ background: '#e7f5ff', borderRadius: 10, padding: 16, textAlign: 'left', marginBottom: 16 }}>
                <strong style={{ color: '#004085', fontSize: 14 }}>{t("How to pay")}</strong>
                <p style={{ color: '#004085', fontSize: 13, margin: '6px 0 0' }}>{t("1. Scan this code with the phone camera")}<br />{t("2. Choose MTN or Airtel Money and enter the customer's number")}<br />{t("3. Approve the payment prompt on the phone")}<br />{t("4. BarFlow confirms payment automatically")}</p>
              </div>
              {error && (
                <div className="subscription-lock" style={{ padding: '12px', marginBottom: 16 }}>
                  {t(error)}
                </div>
              )}
              <div className="waiter-qr-waiting" role="status" aria-live="polite">
                <span className="waiter-qr-waiting-dot" />{t("Waiting for provider confirmation. This screen will update automatically.")}</div>
            </>
          ) : (
            <div className="waiter-qr-unavailable">
              <p role="alert">{error || t("The payment QR code could not be created.")}</p>
              <div>
                <button type="button" className="secondary-action" onClick={() => { setStep('phone'); setError(null); setSelectedMethod(null) }}>{t("Back to payment methods")}</button>
                <button type="button" className="pay-action" disabled={processing} onClick={handleLoadQR}>{processing ? t("Loading…") : t("Try again")}</button>
              </div>
            </div>
          )}
        </section>
      </div>
    )
  }

  if (step === 'cash' && paymentResult) {
    return (
      <div className="page waiter-checkout">
        <div className="user-page-heading">
          <div>
            <p className="eyebrow">{t("Waiter workspace")}</p>
            <h1>{t("Confirm cash received")}</h1>
          </div>
        </div>
        <section className="section-card" style={{ textAlign: 'center' }}>
          <p style={{ color: 'var(--text-3)' }}>{t("Confirm only after you have received the customer's cash.")}</p>
          <div style={{ textAlign: 'left', margin: '20px auto', maxWidth: 320 }}>
            <Row label={t("Amount")} value={money(total)} />
            <Row label={t("Reference")} value={paymentResult.reference} />
          </div>
          {error && <div className="subscription-lock" style={{ padding: 12, marginBottom: 16 }}>{t(error)}</div>}
          <button className="pay-action" style={{ width: '100%', padding: 14 }} disabled={processing} onClick={handleCashConfirm}>
            {processing ? t("Confirming…") : t("Cash received — complete order")}
          </button>
        </section>
      </div>
    )
  }

  // Step: Provider confirmation
  if (step === 'ussd' && paymentResult) {
    return (
      <div className="page waiter-checkout">
        <div className="user-page-heading">
          <div>
            <p className="eyebrow">{t("Waiter workspace")}</p>
            <h1>{t("Approve payment on customer phone")}</h1>
          </div>
        </div>

        <section className="section-card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📱</div>
          <p style={{ color: 'var(--text-3)', lineHeight: 1.6 }}>{paymentResult.message}</p>

          <div style={{ textAlign: 'left', margin: '20px auto', maxWidth: 320 }}>
            <Row label={t("Provider")} value={selectedMethod === 'mtn_momo' ? 'MTN MoMo' : 'Airtel Money'} />
            <Row label={t("Amount")} value={money(total)} />
            <Row label={t("Reference")} value={paymentResult.reference} />
          </div>

          <div style={{ background: '#e7f5ff', borderRadius: 10, padding: 16, textAlign: 'left', marginBottom: 16 }}>
            <strong style={{ color: '#004085', fontSize: 14 }}>{t("Waiting for provider confirmation")}</strong>
            <p style={{ color: '#004085', fontSize: 13, margin: '6px 0 0' }}>{t("The customer must approve the payment prompt on their phone. The order will only be marked paid after the provider confirms it.")}</p>
          </div>

          {error && (
            <div className="subscription-lock" style={{ padding: '12px', marginBottom: 16 }}>
              {t(error)}
            </div>
          )}

          {paymentResult.status === 'failed' ? (
            <button
              className="pay-action"
              style={{ width: '100%', padding: '14px' }}
              onClick={() => {
                setStep('phone')
                setPaymentResult(null)
                setSelectedMethod(null)
                setError(null)
              }}
            >{t("Try another payment method")}</button>
          ) : (
            <button
              className="pay-action"
              style={{ width: '100%', padding: '14px' }}
              disabled={processing}
              onClick={handleConfirm}
            >
              {processing ? t("Checking…") : t("Check payment status")}
            </button>
          )}
        </section>
      </div>
    )
  }

  // Step: Receipt
  return (
    <div className="page waiter-checkout">
      <div className="user-page-heading">
        <div>
          <p className="eyebrow">{t("Waiter workspace")}</p>
          <h1>{t("Receipt")}</h1>
        </div>
      </div>

      <section className="section-card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
        <h2 style={{ margin: '0 0 4px' }}>{t("Payment successful")}</h2>
        <p style={{ color: 'var(--text-4)' }}>{t("Receipt")}{' '}{receipt?.receiptNumber}</p>

        <div style={{ textAlign: 'left', margin: '20px auto', maxWidth: 320 }}>
          <Row label={t("Order")} value={receipt?.orderNumber} />
          <Row label={t("Table")} value={receipt?.tableNumber} />
          <Row label={t("Payment")} value={(receipt?.paymentMethod || '').replace('_', ' ').toUpperCase()} />
          <Row label={t("Amount")} value={money(receipt?.total)} />
          <Row label={t("Phone")} value={receipt?.customerPhone} />
        </div>

        {smsSent && (
          <p style={{ color: '#2d6a4f', fontWeight: 600 }}>{t("📱 Receipt sent to the client's phone")}</p>
        )}

        <button
          className="pay-action"
          style={{ width: '100%', marginTop: 12, padding: '12px' }}
          onClick={() => navigate('/waiter/orders')}
        >{t("Done — view ready orders")}</button>
      </section>
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '6px 0',
        fontSize: 14,
        borderBottom: '1px solid var(--border)',
      }}
    >
      <span style={{ color: 'var(--text-4)' }}>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}
