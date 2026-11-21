import React from 'react'
import { usePreferences } from '../context/PreferencesContext'
import { getOrderLocation } from '../utils/orderDisplay'
import { orderStatusColors } from '../utils/orderStatus'

const hasTableNumber = (order) => order?.tableNumber != null && order.tableNumber !== ''

/** "TABLE 5", or the order's location (walk-in, waiter…) in capitals. */
export function orderTableText(order, t = (s) => s) {
  const text = hasTableNumber(order) ? `${t('Table')} ${order.tableNumber}` : t(getOrderLocation(order))
  return String(text).toLocaleUpperCase()
}

/**
 * "WAITER: JOHN" for orders a waiter created at a table. Returns '' when there
 * is no table (the main line already names the waiter then) or no waiter.
 */
export function orderWaiterText(order, t = (s) => s) {
  const waiterName = order?.waiterName || order?.waiter_name
  const isWaiterOrder = String(order?.source || '').toLowerCase() === 'waiter' || Boolean(order?.waiterId || order?.waiter_id)
  if (!hasTableNumber(order) || !isWaiterOrder || !waiterName) return ''
  return `${t('Waiter')}: ${waiterName}`.toLocaleUpperCase()
}

const SIZES = {
  sm: { fontSize: 13, padding: '3px 10px', sub: 11 },
  md: { fontSize: 17, padding: '6px 12px', sub: 12 },
  lg: { fontSize: 22, padding: '8px 14px', sub: 13 },
}

/**
 * Prominent table label shown first at the top of an order, with the waiter
 * who created it underneath. Colors are inline so theme overrides can't wash it out.
 */
export default function OrderTableHeading({ order, size = 'md', block = true, style, showStatus = true }) {
  const { t } = usePreferences()
  const { sub, ...box } = SIZES[size] || SIZES.md
  const waiter = orderWaiterText(order, t)
  const status = orderStatusColors(order?.status)
  const statusLabel = showStatus && order?.status ? t(status.label || order.status) : ''
  return (
    <div
      className="order-table-heading"
      data-status={String(order?.status || '').toLowerCase() || undefined}
      style={{
        display: block ? 'block' : 'inline-block',
        background: status.solid,
        color: '#ffffff',
        fontWeight: 800,
        letterSpacing: '0.06em',
        lineHeight: 1.2,
        borderRadius: 8,
        textTransform: 'uppercase',
        wordBreak: 'break-word',
        ...box,
        ...style,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <span>{orderTableText(order, t)}</span>
        {statusLabel && (
          <span
            style={{
              fontSize: sub,
              fontWeight: 800,
              letterSpacing: '0.06em',
              background: 'rgba(255,255,255,0.22)',
              border: '1px solid rgba(255,255,255,0.55)',
              borderRadius: 999,
              padding: '2px 9px',
              whiteSpace: 'nowrap',
            }}
          >
            {String(statusLabel).toLocaleUpperCase()}
          </span>
        )}
      </span>
      {waiter && (
        <span style={{ display: 'block', marginTop: 2, fontSize: sub, fontWeight: 700, letterSpacing: '0.04em', color: 'rgba(255,255,255,0.85)' }}>
          {waiter}
        </span>
      )}
    </div>
  )
}
