import { Router } from 'express'

const router = Router()

// Reporting is computed in the dashboard views; this endpoint is a placeholder
// for server-side report generation.
router.get('/', (_req, res) => {
  res.json({ message: 'Reports are computed per role in the dashboards.' })
})

export default router
