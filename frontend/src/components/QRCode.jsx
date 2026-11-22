import React from 'react'
import { generateMatrix } from '../lib/qrcodegen'
import { usePreferences } from '../context/PreferencesContext'
import usePlatformInfo, { isLogoUrl } from '../hooks/usePlatformInfo'

// Error correction and the centre logo come from the platform settings (Settings → QR Code),
// unless a caller passes its own level.
export default function QRCode({
  value,
  size = 200,
  fg = '#000000',
  bg = '#ffffff',
  level,
  id,
  ariaLabel,
}) {
  const { t } = usePreferences()
  const platform = usePlatformInfo()
  if (!value) return null

  const logo = String(platform?.logo || '').trim()
  const withLogo = Boolean(platform?.qr?.includeLogo && logo)
  // A logo covers part of the code: use the highest error correction so it still scans.
  const ecLevel = withLogo ? 'H' : (level || platform?.qr?.errorCorrection || 'M')

  const qr = generateMatrix(value, ecLevel)
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

  // The logo takes at most ~22% of the width (well inside what level H can recover).
  const box = size * 0.22
  const boxStart = (size - box) / 2

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
      {withLogo && (
        <g>
          <rect x={boxStart - 2} y={boxStart - 2} width={box + 4} height={box + 4} rx={box * 0.18} fill={bg} />
          {isLogoUrl(logo) ? (
            <image href={logo} x={boxStart} y={boxStart} width={box} height={box} preserveAspectRatio="xMidYMid meet" />
          ) : (
            <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central" fontSize={box * 0.7} fontFamily="sans-serif" fontWeight="bold" fill={fg}>
              {logo.slice(0, 2)}
            </text>
          )}
        </g>
      )}
    </svg>
  )
}
