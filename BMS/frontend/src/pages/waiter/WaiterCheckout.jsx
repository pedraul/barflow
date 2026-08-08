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
  const navigate = useNavigate()
  const location = useLocation()
  const order = location.state?.order

  const [step, setStep] = useState('phone') // phone | ussd | qr | receipt
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

  if (!order) return null

  const total = Number(order.total || order.subtotal || 0)

  const handleInitiate = async () => {
    setError(null)
    if (!selectedMethod) {
      setError('Choose a payment method.')
      return
    }

    setProcessing(true)
    try {
      if (selectedMethod === 'qr') {
        setStep('qr')
        return
      }

      if (selectedMethod !== 'cash' && !phoneNumber.trim()) {
        setError('Enter the client phone number to send the USSD prompt.')
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

        if (result.status === 'pending_ussd_confirmation') {
          setStep('ussd')
        } else {
          const verifyResult = await api.verifyPayment(result.paymentId)
          setReceipt(verifyResult.receipt)
          setSmsSent(verifyResult.smsSent)
          setStep('receipt')
        }
      } catch (err) {
        setError(err.response?.data?.error || err.message || 'Payment failed.')
      } finally {
        setProcessing(false)
      }
    } catch (e) {
      setError(e?.message || 'Payment failed.')
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
      setError(err.response?.data?.error || err.message || 'Failed to load QR code.')
    } finally {
      setProcessing(false)
    }
  }

  const handleQRConfirm = async () => {
    setProcessing(true)
    try {
      const verifyResult = await api.verifyQRPayment({
        orderId: order.id,
        method: 'qr',
        amount: total,
        reference: `QR-${order.orderNumber}-${Date.now()}`,
      })
      if (verifyResult?.success) {
        navigate('/waiter/orders', { state: { paid: true } })
      } else {
        setError('QR payment verification failed.')
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'QR payment failed.')
    } finally {
      setProcessing(false)
    }
  }

  const handleConfirm = async () => {
    if (!paymentResult?.paymentId) return
    setProcessing(true)
    try {
      const verifyResult = await api.verifyPayment(paymentResult.paymentId)
      setReceipt(verifyResult.receipt)
      setSmsSent(verifyResult.smsSent)
      setStep('receipt')
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Payment verification failed.')
    } finally {
      setProcessing(false)
    }
  }

  // Step: Phone number + method
  if (step === 'phone') {
    return (
      <div className="page waiter-checkout">
        <div className="user-page-heading">
          <div>
            <p className="eyebrow">Waiter workspace</p>
            <h1>Customer checkout</h1>
            <p>
              Completing payment for the customer's order {order.orderNumber} · Table{' '}
              {order.tableNumber}.{' '}
              {selectedMethod === 'qr'
                ? 'Select QR Payment to show a scannable code for the customer.'
                : 'Enter the customer\'s phone number to send the payment prompt on their phone.'}
            </p>
          </div>
        </div>

        <section className="section-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <span style={{ color: 'var(--text-4)' }}>Total to collect</span>
            <strong style={{ fontSize: 20, color: '#e63946' }}>{money(total)}</strong>
          </div>

          {selectedMethod !== 'qr' && (
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 8 }}>
              Customer's phone number
            </label>
          )}
          {selectedMethod !== 'qr' && (
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="e.g. 0788123456"
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                fontSize: 16,
                marginBottom: 16,
                boxSizing: 'border-box',
              }}
            />
          )}

          <h2 style={{ fontSize: 16, marginBottom: 12 }}>Payment method</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {PAYMENT_METHODS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedMethod(m.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '14px 16px',
                  borderRadius: 10,
                  border: `2px solid ${selectedMethod === m.id ? m.color : 'var(--border)'}`,
                  background: selectedMethod === m.id ? '#fff8f8' : 'white',
                  cursor: 'pointer',
                  fontSize: 15,
                  fontWeight: 600,
                }}
              >
                <span style={{ fontSize: 22 }}>{m.icon}</span>
                {m.name}
                {selectedMethod === m.id && <span style={{ marginLeft: 'auto', color: '#2d6a4f' }}>✓</span>}
              </button>
            ))}
          </div>

          {error && (
            <div className="subscription-lock" style={{ padding: '12px', marginTop: 16 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
            <button className="secondary-action" style={{ flex: 1 }} onClick={() => navigate('/waiter/cart')}>
              Back
            </button>
            <button
              className="pay-action"
              style={{ flex: 2, padding: '12px' }}
              disabled={processing}
              onClick={handleInitiate}
            >
              {processing ? (selectedMethod === 'qr' ? 'Generating QR…' : 'Sending prompt…') : (selectedMethod === 'qr' ? 'Show QR code' : 'Send payment prompt')}
            </button>
          </div>
        </section>
      </div>
    )
  }

  // Step: QR Payment
  if (step === 'qr') {
    return (
      <div className="page waiter-checkout">
        <div className="user-page-heading">
          <div>
            <p className="eyebrow">Waiter workspace</p>
            <h1>QR Payment</h1>
            <p>
              Ask the customer to scan the QR code below with their mobile money app.
            </p>
          </div>
        </div>

        <section className="section-card" style={{ textAlign: 'center' }}>
          {processing ? (
            <p>Loading QR code…</p>
          ) : qrData ? (
            <>
              <div style={{ display: 'inline-block', padding: 16, border: '2px solid var(--border)', borderRadius: 12, background: 'white' }}>
                <QRCodeSVG value={qrData.qrPayload || ''} size={240} />
              </div>
              <div style={{ textAlign: 'left', margin: '20px auto', maxWidth: 320 }}>
                <Row label="Order" value={order.orderNumber} />
                <Row label="Table" value={order.tableNumber} />
                <Row label="Amount" value={money(total)} />
                <Row label="Merchant" value={qrData.order?.merchantName || 'BarFlow Business'} />
              </div>
              <div style={{ background: '#e7f5ff', borderRadius: 10, padding: 16, textAlign: 'left', marginBottom: 16 }}>
                <strong style={{ color: '#004085', fontSize: 14 }}>How to pay</strong>
                <p style={{ color: '#004085', fontSize: 13, margin: '6px 0 0' }}>
                  1. Open your mobile money app (MTN MoMo, Airtel Money) or banking app<br />
                  2. Scan the QR code above<br />
                  3. Confirm the amount and merchant<br />
                  4. Show the confirmation to the waiter
                </p>
              </div>
              {error && (
                <div className="subscription-lock" style={{ padding: '12px', marginBottom: 16 }}>
                  {error}
                </div>
              )}
              <button
                className="pay-action"
                style={{ width: '100%', padding: '14px' }}
                disabled={processing}
                onClick={handleQRConfirm}
              >
                {processing ? 'Verifying…' : 'Customer confirmed payment'}
              </button>
            </>
          ) : (
            <p style={{ color: 'var(--text-4)' }}>No QR code available.</p>
          )}
        </section>
      </div>
    )
  }

  // Step: USSD confirmation
  if (step === 'ussd' && paymentResult) {
    return (
      <div className="page waiter-checkout">
        <div className="user-page-heading">
          <div>
            <p className="eyebrow">Waiter workspace</p>
            <h1>Confirm payment</h1>
          </div>
        </div>

        <section className="section-card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📱</div>
          <p style={{ color: 'var(--text-3)', lineHeight: 1.6 }}>{paymentResult.message}</p>

          <div style={{ textAlign: 'left', margin: '20px auto', maxWidth: 320 }}>
            <Row label="Provider" value={paymentResult.ussdDetails?.provider} />
            <Row label="Amount" value={money(total)} />
            <Row label="Reference" value={paymentResult.reference} />
          </div>

          <div style={{ background: '#fff3cd', borderRadius: 10, padding: 16, textAlign: 'left', marginBottom: 16 }}>
            <strong style={{ color: '#856404', fontSize: 14 }}>Instructions</strong>
            {paymentResult.ussdDetails?.instructions?.map((inst, i) => (
              <p key={i} style={{ color: '#856404', fontSize: 13, margin: '6px 0 0' }}>{inst}</p>
            ))}
          </div>

          {error && (
            <div className="subscription-lock" style={{ padding: '12px', marginBottom: 16 }}>
              {error}
            </div>
          )}

          <button
            className="pay-action"
            style={{ width: '100%', padding: '14px' }}
            disabled={processing}
            onClick={handleConfirm}
          >
            {processing ? 'Verifying…' : "Client confirmed payment"}
          </button>
        </section>
      </div>
    )
  }

  // Step: Receipt
  return (
    <div className="page waiter-checkout">
      <div className="user-page-heading">
        <div>
          <p className="eyebrow">Waiter workspace</p>
          <h1>Receipt</h1>
        </div>
      </div>

      <section className="section-card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
        <h2 style={{ margin: '0 0 4px' }}>Payment successful</h2>
        <p style={{ color: 'var(--text-4)' }}>Receipt {receipt?.receiptNumber}</p>

        <div style={{ textAlign: 'left', margin: '20px auto', maxWidth: 320 }}>
          <Row label="Order" value={receipt?.orderNumber} />
          <Row label="Table" value={receipt?.tableNumber} />
          <Row label="Payment" value={(receipt?.paymentMethod || '').replace('_', ' ').toUpperCase()} />
          <Row label="Amount" value={money(receipt?.total)} />
          <Row label="Phone" value={receipt?.customerPhone} />
        </div>

        {smsSent && (
          <p style={{ color: '#2d6a4f', fontWeight: 600 }}>
            📱 Receipt sent to the client's phone
          </p>
        )}

        <button
          className="pay-action"
          style={{ width: '100%', marginTop: 12, padding: '12px' }}
          onClick={() => navigate('/waiter/orders')}
        >
          Done — view ready orders
        </button>
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
