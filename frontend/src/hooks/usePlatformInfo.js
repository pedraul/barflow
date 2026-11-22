import { useEffect, useState } from 'react'
import { fetchPlatformInfo } from '../api/endpoints'

// Public platform details (Settings → General / Platform Info / QR), fetched once per page load
// and shared by every component that needs them.
let cached = null
let pending = null

export function loadPlatformInfo() {
  if (cached) return Promise.resolve(cached)
  if (!pending) {
    pending = fetchPlatformInfo()
      .then((info) => { cached = info || {}; return cached })
      .catch(() => { pending = null; return {} })
  }
  return pending
}

/** Forget the cached details (after the admin saves settings). */
export function refreshPlatformInfo() {
  cached = null
  pending = null
  return loadPlatformInfo()
}

export default function usePlatformInfo() {
  const [info, setInfo] = useState(cached)
  useEffect(() => {
    let alive = true
    loadPlatformInfo().then((value) => { if (alive) setInfo(value) })
    return () => { alive = false }
  }, [])
  return info
}

/** A logo setting is either an image address or a short text/emoji. */
export const isLogoUrl = (logo) => /^(https?:\/\/|data:image\/|\/)/i.test(String(logo || '').trim())
