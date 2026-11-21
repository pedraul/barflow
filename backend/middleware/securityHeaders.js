// Transport security for every API session.
// - Requests that arrive over plain HTTP in production are redirected/refused,
//   so all traffic is TLS-encrypted (TLS 1.2/1.3 uses AES-GCM / ChaCha20 ciphers).
// - HSTS tells browsers to only ever connect over HTTPS.
// - API responses carry financial data, so they are never cached.
const isProduction = () =>
  process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL) || Boolean(process.env.RENDER)

export function enforceHttps(req, res, next) {
  if (!isProduction() || String(process.env.ALLOW_HTTP).toLowerCase() === 'true') return next()
  const proto = String(req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http')).split(',')[0].trim()
  if (proto === 'https') return next()
  if (req.method === 'GET' || req.method === 'HEAD') {
    return res.redirect(308, `https://${req.headers.host}${req.originalUrl}`)
  }
  return res.status(403).json({ error: 'HTTPS is required.' })
}

export function securityHeaders(req, res, next) {
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
  if (req.path.startsWith('/api')) {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Pragma', 'no-cache')
  }
  next()
}
