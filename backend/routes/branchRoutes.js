import { Router } from 'express'
import authMiddleware from '../middleware/authMiddleware.js'
import roleMiddleware from '../middleware/roleMiddleware.js'
import { query } from '../config/database.js'
import { logAudit, getClientIp } from '../utils/audit.js'

const router = Router()
const ownerOnly = [authMiddleware, roleMiddleware('owner')]

router.get('/', ...ownerOnly, async (req, res) => {
  try {
    const { rows } = await query(
            `SELECT b.id, b.name, b.address,
              COALESCE((to_jsonb(b)->>'is_active')::boolean, TRUE) AS is_active,
              COALESCE((to_jsonb(b)->>'is_main')::boolean, FALSE) AS is_main,
              b.created_at,
              COUNT(u.id)::int AS user_count
       FROM branches b
       LEFT JOIN users u ON u.branch_id = b.id AND u.is_active = TRUE
       WHERE b.business_id = $1
       GROUP BY b.id
       ORDER BY b.created_at ASC`,
      [req.user.businessId]
    )
    res.json(rows.map((branch) => ({
      id: branch.id,
      name: branch.name,
      address: branch.address || '',
      isActive: branch.is_active !== false,
      isMain: branch.is_main === true,
      userCount: branch.user_count,
      createdAt: branch.created_at,
    })))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.post('/', ...ownerOnly, async (req, res) => {
  const { name, address = '' } = req.body
  const normalizedName = String(name || '').trim()
  if (!normalizedName) return res.status(400).json({ error: 'Branch name is required.' })

  try {
    const { rows } = await query(
      `INSERT INTO branches (business_id, name, address)
       VALUES ($1, $2, $3)
       RETURNING id, name, address, created_at`,
      [req.user.businessId, normalizedName, address]
    )
    await query(
      `INSERT INTO branch_stock (branch_id, product_id, quantity, updated_at)
       SELECT $1, p.id, 0, NOW()
       FROM products p
       WHERE p.business_id = $2
       ON CONFLICT (branch_id, product_id) DO NOTHING`,
      [rows[0].id, req.user.businessId]
    )
    await logAudit({
      userId: req.user.id,
      actorName: req.user.full_name || req.user.email,
      action: `Created branch ${normalizedName}`,
      targetModule: 'Branches',
      ipAddress: getClientIp(req),
      businessId: req.user.businessId,
    })
    res.status(201).json({ ...rows[0], isActive: true })
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'A branch with this name already exists.' })
    res.status(500).json({ error: error.message })
  }
})

router.patch('/:id', ...ownerOnly, async (req, res) => {
  const { name, address, isActive } = req.body
  const fields = []
  const params = []
  let index = 1
  if (name !== undefined) { fields.push(`name = $${index++}`); params.push(String(name).trim()) }
  if (address !== undefined) { fields.push(`address = $${index++}`); params.push(address) }
  if (isActive !== undefined) { fields.push(`is_active = $${index++}`); params.push(Boolean(isActive)) }
  if (!fields.length) return res.status(400).json({ error: 'No branch fields to update.' })

  try {
    params.push(req.params.id, req.user.businessId)
    const { rows } = await query(
      `UPDATE branches SET ${fields.join(', ')}
       WHERE id = $${index} AND business_id = $${index + 1}
       RETURNING id, name, address, is_active, created_at`,
      params
    )
    if (!rows.length) return res.status(404).json({ error: 'Branch not found.' })
    res.json({ ...rows[0], isActive: rows[0].is_active !== false })
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'A branch with this name already exists.' })
    res.status(500).json({ error: error.message })
  }
})

export default router
