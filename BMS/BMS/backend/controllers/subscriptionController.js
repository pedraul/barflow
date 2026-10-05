import { query } from '../config/database.js'

export async function getSubscription(_req, res) {
  try {
    const { rows } = await query('SELECT status, plan FROM subscriptions ORDER BY created_at DESC LIMIT 1')
    res.json(rows[0] || { status: 'active', plan: 'Pro' })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function updateSubscription(req, res) {
  const { status } = req.body
  if (!status) return res.status(400).json({ error: 'Status is required.' })
  try {
    await query(
      `UPDATE subscriptions SET status = $1, cancelled_at = CASE WHEN $1 = 'inactive' THEN NOW() ELSE NULL END
       WHERE id = (SELECT id FROM subscriptions ORDER BY created_at DESC LIMIT 1)`,
      [status]
    )
    res.json({ status })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}
