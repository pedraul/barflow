import React, { useState } from 'react'
import { initiateMomoPayment, getPaymentStatus } from '../../services/paymentService'

export default function MomoButton({ orderId, amount, method = 'mtn_momo', customerPhone, customerName, onSuccess }) {
  const [loading, setLoading] = useState(false)
  const [payment, setPayment] = useState(null)

  const handlePay = async () => {
    setLoading(true)
    try {
      const data = await initiateMomoPayment({ orderId, amount, method, customerPhone, customerName })
      setPayment(data)
      // If provider returns paymentId, poll status
      if (data.paymentId) {
        const interval = setInterval(async () => {
          const status = await getPaymentStatus(data.paymentId)
          if (status.provider_status === 'COMPLETED' || status.paid_at) {
            clearInterval(interval)
            onSuccess && onSuccess(status)
          }
        }, 3000)
      }
    } catch (e) {
      console.error('Momo initiate failed', e)
      alert(e.message || 'Payment initiation failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button disabled={loading} onClick={handlePay} className="bg-emerald-500 text-white px-4 py-2 rounded">
        {loading ? 'Processing…' : `Pay ${amount}`}
      </button>
      {payment && payment.ussdDetails && (
        <div className="mt-3 text-sm text-slate-600">
          <strong>USSD Instructions:</strong>
          <ol className="list-decimal ml-5">
            {payment.ussdDetails.instructions.map((i, idx) => <li key={idx}>{i}</li>)}
          </ol>
        </div>
      )}
    </div>
  )
}
