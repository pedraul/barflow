import { query } from '../config/database.js'

const mapUser = (u) => ({
  id: u.id,
  name: u.full_name,
  email: u.email,
  phone: u.phone || '',
  role: u.role,
  branch: u.branch_name || '',
  status: u.is_active ? 'Active' : 'Inactive',
  salary: Number(u.salary) || 0,
  bonus: Number(u.bonus) || 0,
  promotion: u.promotion || '',
  lastLogin: u.last_login ? new Date(u.last_login).toLocaleString() : 'Never',
})

export async function listUsers(_req, res) {
  try {
    const { rows } = await query(
      `SELECT u.*, b.name AS branch_name
       FROM users u LEFT JOIN branches b ON b.id = u.branch_id ORDER BY u.created_at`
    )
    res.json(rows.map(mapUser))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function createUser(req, res) {
  const { name, email, phone, role, branch, status = 'Active', salary = 0, password = 'password123' } = req.body
  if (!name || !email || !role) return res.status(400).json({ error: 'Name, email, and role are required.' })
  try {
    const { rows } = await query(
      `INSERT INTO users (business_id, branch_id, full_name, email, phone, password_hash, role, is_active, salary)
       VALUES ((SELECT id FROM businesses LIMIT 1), (SELECT id FROM branches WHERE name = $1), $2, $3, $4, crypt($5, gen_salt('bf')), $6, $7, $8)
       RETURNING id`,
      [branch, name, email, phone, password, role, status === 'Active', salary]
    )
    res.status(201).json({ id: rows[0].id })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function updateUser(req, res) {
  const { name, email, phone, role, branch, status, salary, bonus, promotion } = req.body
  const fields = []
  const params = []
  let i = 1
  if (name !== undefined) { fields.push(`full_name = $${i++}`); params.push(name) }
  if (email !== undefined) { fields.push(`email = $${i++}`); params.push(email) }
  if (phone !== undefined) { fields.push(`phone = $${i++}`); params.push(phone) }
  if (role !== undefined) { fields.push(`role = $${i++}`); params.push(role) }
  if (salary !== undefined) { fields.push(`salary = $${i++}`); params.push(salary) }
  if (bonus !== undefined) { fields.push(`bonus = $${i++}`); params.push(bonus) }
  if (promotion !== undefined) { fields.push(`promotion = $${i++}`); params.push(promotion) }
  if (status !== undefined) { fields.push(`is_active = $${i++}`); params.push(status === 'Active') }
  if (branch !== undefined) {
    fields.push(`branch_id = (SELECT id FROM branches WHERE name = $${i})`)
    params.push(branch)
    i++
  }
  if (!fields.length) return res.status(400).json({ error: 'No fields to update.' })
  params.push(req.params.id)
  try {
    await query(`UPDATE users SET ${fields.join(', ')} WHERE id = $${i}`, params)
    const { rows } = await query(
      `SELECT u.*, b.name AS branch_name FROM users u LEFT JOIN branches b ON b.id = u.branch_id WHERE u.id = $1`,
      [req.params.id]
    )
    res.json(mapUser(rows[0]))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function removeUser(req, res) {
  try {
    const { rows } = await query(
      `UPDATE users SET is_active = FALSE, updated_at = NOW()
       WHERE id = $1 RETURNING id, full_name`,
      [req.params.id]
    )
    if (!rows.length) return res.status(404).json({ error: 'User not found.' })
    res.json({
      id: rows[0].id,
      deactivated: true,
      message: `${rows[0].full_name} was deactivated. Historical records were preserved.`,
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}
