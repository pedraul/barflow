// Customer-facing QR codes must always open the deployed application, even
// when an administrator generates or prints them from a local development URL.
export const PUBLIC_APP_URL = (import.meta.env.VITE_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/$/, '')

