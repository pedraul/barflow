import React, { useState } from 'react'
import * as api from '../api/endpoints'
import { usePreferences } from '../context/PreferencesContext'

const REASONS = [
  'Customer changed mind',
  'Wrong item selected',
  'Order entered incorrectly',
  'Item out of stock',
  'Customer request',
  'Other',
]

export default function OrderRestockModal({ order, onClose, onSuccess }) {
  const { t } = usePreferences()
  const [restocks, setRestocks] = useState(
    (order.items || []).map((item) => ({
      productId: item.productId,
      name: item.name,
      currentQty: item.quantity,
      quantityToRestock: 0,
    }))
  )
  const [reason, setReason] = useState('')
  const [customReason, setCustomReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState(null)

  const hasRestock = restocks.some((r) => r.quantityToRestock > 0)
  const selectedReason = reason === 'Other' ? customReason : reason

  const changeRestockQty = (productId, delta) => {
    setRestocks((prev) =>
      prev
        .map((r) => {
          if (r.productId !== productId) return r
          const next = Math.max(0, Math.min(r.currentQty, r.quantityToRestock + delta))
          return { ...r, quantityToRestock: next }
        })
        .filter((r) => r.quantityToRestock > 0 || r.currentQty > 0)
    )
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFeedback(null)
    if (!hasRestock) {
      setFeedback({ type: 'error', text: t('Select at least one item quantity to restock.') })
      return
    }
    if (!selectedReason || !selectedReason.trim()) {
      setFeedback({ type: 'error', text: t('Reason for restocking is required.') })
      return
    }

    setSubmitting(true)
    try {
      const itemsToRestock = restocks
        .filter((r) => r.quantityToRestock > 0)
        .map((r) => ({
          productId: r.productId,
          quantityToRestock: r.quantityToRestock,
        }))

      await api.restockOrderItem(order.id, {
        items: itemsToRestock,
        reason: selectedReason.trim(),
      })

      setFeedback({ type: 'success', text: t('Restock processed successfully.') })
      setTimeout(() => {
        onSuccess?.()
        onClose()
      }, 800)
    } catch (err) {
      setFeedback({ type: 'error', text: err.message || t('Failed to restock.') })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="confirm-dialog" role="dialog" aria-modal="true" aria-label={t('Restock order items')} onClick={(event) => event.stopPropagation()}>
        <h2>{t('Restock Items — Order')} {order.orderNumber ?? order.id}</h2>

        {feedback && (
          <div style={{
            padding: '10px 12px',
            borderRadius: 8,
            marginBottom: 12,
            fontSize: 14,
            border: feedback.type === 'error' ? '1px solid #f5c6cb' : '1px solid #c3e6cb',
            backgroundColor: feedback.type === 'error' ? '#f8d7da' : '#d4edda',
            color: feedback.type === 'error' ? '#721c24' : '#155724',
          }}>
            {feedback.text}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 12 }}>
            <p style={{ fontSize: 13, color: '#4a5568', marginBottom: 8 }}>
              {t('Select the quantity to return to stock for each item. Only orders in')} {t('Open')} {t('or')} {t('Preparing')} {t('status can be modified.')}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {restocks.map((item) => (
                <div key={item.productId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #e2e8f0' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ display: 'block', fontSize: 14 }}>{item.name}</strong>
                    <span style={{ fontSize: 12, color: '#718096' }}>{t('Ordered:')} {item.currentQty}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button type="button" aria-label={t('Decrease quantity')} onClick={() => changeRestockQty(item.productId, -1)} style={qtyBtn}>−</button>
                    <span style={{ minWidth: 20, textAlign: 'center', fontWeight: 600 }}>{item.quantityToRestock}</span>
                    <button type="button" aria-label={t('Increase quantity')} onClick={() => changeRestockQty(item.productId, 1)} style={qtyBtn}>+</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{t('Reason for restocking')}</label>
            <select value={reason} onChange={(e) => setReason(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e0', fontSize: 14 }}>
              <option value="">{t('Select a reason')}</option>
              {REASONS.map((r) => (
                <option key={r} value={r}>{t(r)}</option>
              ))}
            </select>
            {reason === 'Other' && (
              <input
                type="text"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder={t('Enter reason')}
                style={{ width: '100%', marginTop: 6, padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e0', fontSize: 14 }}
                required
              />
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="secondary-action" style={{ padding: '8px 14px' }} onClick={onClose} disabled={submitting}>
              {t('Cancel')}
            </button>
            <button type="submit" className="pay-action" style={{ padding: '8px 14px' }} disabled={submitting || !hasRestock}>
              {submitting ? t('Processing...') : t('Confirm Restock')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const qtyBtn = {
  width: 28,
  height: 28,
  borderRadius: 6,
  border: '1px solid #cbd5e0',
  background: 'white',
  cursor: 'pointer',
  fontSize: 16,
  lineHeight: 1,
}
