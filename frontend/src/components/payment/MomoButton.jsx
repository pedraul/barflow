import React, { useEffect, useState } from 'react'
import { initiateMomoPayment, getPaymentStatus } from '../../services/paymentService'
import { usePreferences } from '../../context/PreferencesContext'

export default function MomoButton({ orderId, amount, method = 'mtn_momo', customerPhone, customerName, onSuccess }) {
  const { t } = usePreferences()
  const [loading, setLoading] = useState(false)
  const [payment, setPayment] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!payment?.paymentId || payment.status !== 'pending') return undefined

    let active = true
    let checking = false
    const checkStatus = async () => {
      if (checking) return
      checking = true
      try {
        const status = await getPaymentStatus(payment.paymentId)
        if (!active) return
        if (status.status === 'completed') {
          setPayment((current) => ({ ...current, status: 'completed' }))
          onSuccess?.(status)
        } else if (status.status === 'failed') {
          setPayment((current) => ({ ...current, status: 'failed' }))
          setError(t('The payment was declined or could not be completed.'))
        }
      } catch (err) {
        if (active) setError(err.response?.data?.error || err.message || t('Unable to check payment status.'))
      } finally {
        checking = false
      }
    }
    const interval = window.setInterval(checkStatus, 3000)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [payment, onSuccess, t])

  const handlePay = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await initiateMomoPayment({ orderId, amount, method, customerPhone, customerName })
      setPayment(data)
    } catch (e) {
      setError(e.response?.data?.error || e.message || t('Payment initiation failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button disabled={loading} onClick={handlePay} className="bg-emerald-500 text-white px-4 py-2 rounded">
        {loading ? t('Processing…') : `${t('Pay')} ${amount}`}
      </button>
      {payment?.status === 'pending' && <p className="mt-3 text-sm text-slate-600">{t('Approve the payment prompt on your phone. Waiting for provider confirmation…')}</p>}
      {error && <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>}
    </div>
  )
}
