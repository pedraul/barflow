import React from 'react'
import { usePreferences } from '../context/PreferencesContext'
import { orderStatusColors } from '../utils/orderStatus'

/** Status pill in the shared order-status colors. */
export default function OrderStatusBadge({ status, style }) {
  const { t } = usePreferences()
  if (!status) return null
  const c = orderStatusColors(status)
  return (
    <span
      style={{
        display: 'inline-block',
        background: c.solid,
        color: '#ffffff',
        borderRadius: 999,
        padding: '2px 10px',
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {t(c.label || status)}
    </span>
  )
}
