import { query } from '../config/database.js'
import { getTaxBreakdown } from '../utils/taxCalculator.js'

export async function listSalary(_req, res) {
  try {
    const { rows } = await query(
      `SELECT id, name, phone, gross_amount, tax_amount, insurance_amount, net_amount, method, actor, paid_at FROM salary_payments ORDER BY paid_at DESC`
    )
    res.json(rows.map((r) => ({
      id: r.id, name: r.name, phone: r.phone || '', grossAmount: Number(r.gross_amount) || 0,
      taxAmount: Number(r.tax_amount) || 0, insuranceAmount: Number(r.insurance_amount) || 0,
      netAmount: Number(r.net_amount) || 0, method: r.method, actor: r.actor, time: new Date(r.paid_at).toLocaleString(),
    })))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function recordSalary(req, res) {
  const { name, phone, amount, method, actor, bonus, promotion } = req.body
  if (!name || amount == null) return res.status(400).json({ error: 'Name and amount are required.' })

  const gross = Number(amount) || 0
  const { grossAmount, taxAmount: tax, insuranceAmount: insurance, netAmount: net } = getTaxBreakdown(gross)

  try {
    const { rows } = await query(
      `INSERT INTO salary_payments (business_id, name, phone, gross_amount, tax_amount, insurance_amount, net_amount, amount, method, actor, bonus, promotion)
       VALUES ((SELECT id FROM businesses LIMIT 1), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [name, phone || '', gross, tax, insurance, net, net, method, actor, bonus || 0, promotion || '']
    )
    res.status(201).json({ id: rows[0].id, gross, tax, insurance, net })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}
