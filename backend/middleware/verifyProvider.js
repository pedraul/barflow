import dotenv from 'dotenv'
import crypto from 'crypto'
dotenv.config()

const SHARED_SECRET = process.env.MOMO_WEBHOOK_SECRET || process.env.MOMO_SECRET || ''

export default function verifyProvider(req, res, next) {
  if (!SHARED_SECRET) return next()

  const signature = req.headers['x-momo-signature'] || req.headers['x-signature'] || ''
  if (!signature) return res.status(401).json({ error: 'Missing signature' })

  const payload = JSON.stringify(req.body || {})
  const hmac = crypto.createHmac('sha256', SHARED_SECRET).update(payload).digest('hex')
  if (hmac !== signature) return res.status(401).json({ error: 'Invalid signature' })

  return next()
}
