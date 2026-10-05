import { verify } from '../config/jwt.js'

export default function authMiddleware(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  const user = verify(token)
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  req.user = user
  next()
}
