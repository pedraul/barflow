import { PUBLIC_APP_URL } from './publicAppUrl'

/** Public "scan to pay" page for a business (encoded in the printed payment QR). */
export function buildPayUrl(businessId) {
  const base = PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '')
  return `${base}/pay/${encodeURIComponent(businessId)}`
}
