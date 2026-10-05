import { Router } from 'express'
import { query } from '../config/database.js'
import { mapUser } from './helpers.js'
import { logAudit, getClientIp } from '../utils/audit.js'
import authMiddleware from '../middleware/authMiddleware.js'

const router = Router()

router.get('/', authMiddleware, async (req, res) => {
  try {
    let currentBusinessId = req.user.businessId
    if (!currentBusinessId) {
      // tokens issued before businessId existed might not include it
      try {
        const { rows: bizRows } = await query('SELECT business_id FROM users WHERE id = $1::uuid', [req.user?.id])
        currentBusinessId = bizRows[0]?.business_id || null
      } catch (err) {
        console.error('Failed to resolve business id for user in /users:', req.user?.id, err)
        currentBusinessId = null
      }
    }

    if (!currentBusinessId) return res.json([])

    const { rows } = await query(
      `SELECT u.*, b.name AS branch_name
       FROM users u LEFT JOIN branches b ON b.id = u.branch_id
       WHERE u.business_id = $1 AND u.is_active = TRUE
       ORDER BY u.created_at`,
      [currentBusinessId]
    )
    res.json(rows.map(mapUser))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.post('/', authMiddleware, async (req, res) => {
  const { name, email, phone, role, branch, status = 'Active', salary = 0, password = 'password123' } = req.body
  if (!name || !email || !role) {
    return res.status(400).json({ error: 'Name, email, and role are required.' })
  }
  try {
    const { rows } = await query(
      `INSERT INTO users (business_id, branch_id, full_name, email, phone, password_hash, role, is_active, salary)
       VALUES (
        $9,
        (SELECT id FROM branches WHERE name = $1 AND business_id = $9),
        $2, $3, $4, crypt($5, gen_salt('bf')), $6, $7, $8
      )
      RETURNING id`,
      [branch, name, email, phone, password, role, status === 'Active', salary, req.user.businessId]
    )

    await logAudit({
      userId: req.user?.id,
      actorName: req.user?.full_name || req.user?.email || 'System',
      action: `Created user "${name}" (${role})`,
      targetModule: 'Users',
      ipAddress: getClientIp(req),
      businessId: req.user?.businessId,
    })

    res.status(201).json({ id: rows[0].id })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.patch('/:id', authMiddleware, async (req, res) => {
  const { name, email, phone, role, branch, status, salary } = req.body
  const fields = []
  const params = []
  let i = 1
  if (name !== undefined) { fields.push(`full_name = $${i++}`); params.push(name) }
  if (email !== undefined) { fields.push(`email = $${i++}`); params.push(email) }
  if (phone !== undefined) { fields.push(`phone = $${i++}`); params.push(phone) }
  if (role !== undefined) { fields.push(`role = $${i++}`); params.push(role) }
  if (salary !== undefined) { fields.push(`salary = $${i++}`); params.push(salary) }
  if (status !== undefined) { fields.push(`is_active = $${i++}`); params.push(status === 'Active') }
  if (branch !== undefined) {
    fields.push(`branch_id = (SELECT id FROM branches WHERE name = $${i})`)
    params.push(branch)
    i++
  }
  if (!fields.length) return res.status(400).json({ error: 'No fields to update.' })
  params.push(req.params.id)
  params.push(req.user.businessId)
  try {
    await query(`UPDATE users SET ${fields.join(', ')} WHERE id = $${i} AND business_id = $${i + 1}`, params)
    const { rows } = await query(
      `SELECT u.*, b.name AS branch_name FROM users u LEFT JOIN branches b ON b.id = u.branch_id WHERE u.id = $1`,
      [req.params.id]
    )

    await logAudit({
      userId: req.user?.id,
      actorName: req.user?.full_name || req.user?.email || 'System',
      action: `Updated user "${rows[0].full_name}"`,
      targetModule: 'Users',
      ipAddress: getClientIp(req),
      businessId: req.user?.businessId,
    })

    res.json(mapUser(rows[0]))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { rows } = await query('SELECT full_name FROM users WHERE id = $1 AND business_id = $2', [req.params.id, req.user.businessId])
    const userName = rows[0]?.full_name || 'Unknown'

    await query('DELETE FROM users WHERE id = $1 AND business_id = $2', [req.params.id, req.user.businessId])

    await logAudit({
      userId: req.user?.id,
      actorName: req.user?.full_name || req.user?.email || 'System',
      action: `Deleted user "${userName}"`,
      targetModule: 'Users',
      ipAddress: getClientIp(req),
      businessId: req.user?.businessId,
    })

    res.json({ id: req.params.id })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
