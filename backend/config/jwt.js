import crypto from 'crypto'

const SECRET = process.env.JWT_SECRET || 'barflow-dev-secret'

export function sign(payload) {
  // iat (issued at, seconds) lets the server end sessions after the configured timeout.
  const body = Buffer.from(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000) })).toString('base64url')
  const signature = crypto.createHmac('sha256', SECRET).update(body).digest('base64url')
  return `${body}.${signature}`
}

export function verify(token) {
  if (!token || !token.includes('.')) return null
  const [body, signature] = token.split('.')
  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url')
  if (signature !== expected) return null
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString())
  } catch {
    return null
  }
}
