export default function roleMiddleware(...allowed) {
  return (req, res, next) => {
    const userRole = req.user?.role
    if (!userRole || (allowed.length && !allowed.includes(userRole))) {
      return res.status(403).json({ error: 'Forbidden: insufficient role.' })
    }
    next()
  }
}
