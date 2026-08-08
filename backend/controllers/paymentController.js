import { query } from '../config/database.js'

export async function listPayments(_req, res) {
  try {
    const { rows } = await query('SELECT * FROM payments ORDER BY paid_at DESC')
    res.json(rows)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function recordPayment(req, res) {
  const { orderId, method, amount, reference, receivedBy } = req.body
  if (!orderId || amount == null) return res.status(400).json({ error: 'orderId and amount are required.' })
  try {
    const { rows } = await query(
      `INSERT INTO payments (order_id, received_by, method, amount, reference) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [orderId, receivedBy, method, amount, reference]
    )
    res.status(201).json({ id: rows[0].id })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}
