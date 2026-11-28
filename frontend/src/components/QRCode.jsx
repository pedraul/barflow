import React from 'react'
import { generateMatrix } from '../lib/qrcodegen'
import { usePreferences } from '../context/PreferencesContext'

export default function QRCode({
  value,
  size = 200,
  fg = '#000000',
  bg = '#ffffff',
  level = 'M',
  id,
  ariaLabel,
}) {
  const { t } = usePreferences()
  if (!value) return null

  const qr = generateMatrix(value, level)
  const count = qr.size
  const cell = size / count
  const rects = []

  for (let y = 0; y < count; y++) {
    for (let x = 0; x < count; x++) {
      if (qr.modules[y][x]) {
        rects.push(
          <rect key={`${x}-${y}`} x={x * cell} y={y * cell} width={cell} height={cell} fill={fg} />
        )
      }
    }
  }

  return (
    <svg
      width={size}
      height={size}
      id={id}
      viewBox={`0 0 ${size} ${size}`}
      xmlns="http://www.w3.org/2000/svg"
      shapeRendering="crispEdges"
      style={{ background: bg, display: 'block' }}
      role="img"
      aria-label={t(ariaLabel || 'QR code')}
    >
      <rect width={size} height={size} fill={bg} />
      {rects}
    </svg>
  )
}
