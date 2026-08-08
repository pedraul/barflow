import { Router } from 'express'
import authMiddleware from '../middleware/authMiddleware.js'
import roleMiddleware from '../middleware/roleMiddleware.js'
import { query } from '../config/database.js'
import { logAudit, getClientIp } from '../utils/audit.js'

const router = Router()

const managerOnly = [authMiddleware, roleMiddleware('manager')]

const DEFAULT_CATEGORY = 'Other'

function cleanCategory(category) {
  return String(category || '').trim().replace(/\s+/g, ' ') || DEFAULT_CATEGORY
}

// Keep one display name for a category even when older products contain
// different casing or accidental whitespace (for example, "drinks" / "Drinks").
function groupProductsByCategory(products) {
  const grouped = new Map()
  for (const product of products) {
    const category = cleanCategory(product.category)
    const key = category.toLocaleLowerCase()
    if (!grouped.has(key)) grouped.set(key, { name: category, items: [] })
    grouped.get(key).items.push({
      id: product.id,
      name: product.name,
      price: Number(product.selling_price),
      imageUrl: product.image_url || '',
      unit: product.stock_unit,
      quantity: Number(product.quantity) || 0,
    })
  }
  return [...grouped.values()]
}

async function reuseCategoryName(businessId, category) {
  const cleaned = cleanCategory(category)
  const { rows } = await query(
    `SELECT category FROM products
     WHERE business_id = $1 AND LOWER(TRIM(category)) = LOWER($2)
     ORDER BY created_at ASC LIMIT 1`,
    [businessId, cleaned]
  )
  return rows[0]?.category ? cleanCategory(rows[0].category) : cleaned
}

router.get('/public-menu', async (req, res) => {
  const tableNumber = req.query.table || '1'
  const businessId = req.query.businessId || req.user?.businessId
  try {
    if (!businessId) {
      return res.json({ tableNumber, categories: [] })
    }

    const { rows } = await query(
      `SELECT id, name, category, selling_price, image_url, stock_unit, quantity
       FROM products
       WHERE is_active = true AND business_id = $1
       ORDER BY category, name`,
      [businessId]
    )

    res.json({
      tableNumber,
      categories: groupProductsByCategory(rows),
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.get('/', ...managerOnly, async (req, res) => {
  try {
    const businessId = req.user?.businessId
    const { rows } = await query(
      `SELECT id, name, category, selling_price, cost_price, stock_unit, low_stock_threshold, image_url, quantity, is_active, created_at
       FROM products
       WHERE business_id = $1
       ORDER BY created_at DESC`,
      [businessId]
    )
    res.json(
      rows.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category || 'Other',
        price: Number(p.selling_price) || 0,
        costPrice: Number(p.cost_price) || 0,
        unit: p.stock_unit || 'unit',
        minStockLevel: Number(p.low_stock_threshold) || 0,
        imageUrl: p.image_url || '',
        quantity: Number(p.quantity) || 0,
        isActive: p.is_active,
        createdAt: p.created_at ? new Date(p.created_at).toISOString() : null,
      }))
    )
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.post('/', ...managerOnly, async (req, res) => {
  try {
    const { name, category, price, costPrice, unit, minStockLevel, imageUrl, quantity } = req.body
    if (!name || price == null) {
      return res.status(400).json({ error: 'Name and price are required.' })
    }
    const businessId = req.user?.businessId
    if (!businessId) {
      return res.status(400).json({ error: 'No business associated with this account.' })
    }
    const { rows } = await query(
      `INSERT INTO products (business_id, name, category, selling_price, cost_price, stock_unit, low_stock_threshold, image_url, quantity)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, name, category, selling_price, cost_price, stock_unit, low_stock_threshold, image_url, quantity, is_active, created_at`,
      [businessId, name, await reuseCategoryName(businessId, category), price, costPrice || 0, unit || 'unit', minStockLevel || 0, imageUrl || '', quantity || 0]
    )
    const p = rows[0]

await logAudit({
       userId: req.user?.id,
       actorName: req.user?.full_name || req.user?.email || 'System',
       action: `Created product "${name}"`,
       targetModule: 'Products',
       ipAddress: getClientIp(req),
       businessId: req.user?.businessId,
     })

    res.status(201).json({
      id: p.id,
      name: p.name,
      category: p.category || 'Other',
      price: Number(p.selling_price) || 0,
      costPrice: Number(p.cost_price) || 0,
      unit: p.stock_unit || 'unit',
      minStockLevel: Number(p.low_stock_threshold) || 0,
      imageUrl: p.image_url || '',
      quantity: Number(p.quantity) || 0,
      isActive: p.is_active,
      createdAt: p.created_at ? new Date(p.created_at).toISOString() : null,
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.patch('/:id', ...managerOnly, async (req, res) => {
  try {
    const { id } = req.params
    const { name, category, price, costPrice, unit, minStockLevel, imageUrl, quantity, isActive } = req.body
    const fields = []
    const params = []
    let idx = 1

    if (name !== undefined) { fields.push(`name = $${idx++}`); params.push(name) }
    if (category !== undefined) { fields.push(`category = $${idx++}`); params.push(await reuseCategoryName(req.user?.businessId, category)) }
    if (price !== undefined) { fields.push(`selling_price = $${idx++}`); params.push(price) }
    if (costPrice !== undefined) { fields.push(`cost_price = $${idx++}`); params.push(costPrice) }
    if (unit !== undefined) { fields.push(`stock_unit = $${idx++}`); params.push(unit) }
    if (minStockLevel !== undefined) { fields.push(`low_stock_threshold = $${idx++}`); params.push(minStockLevel) }
    if (imageUrl !== undefined) { fields.push(`image_url = $${idx++}`); params.push(imageUrl) }
    if (quantity !== undefined) { fields.push(`quantity = $${idx++}`); params.push(quantity) }
    if (isActive !== undefined) { fields.push(`is_active = $${idx++}`); params.push(isActive) }

    if (!fields.length) {
      return res.status(400).json({ error: 'No fields provided to update.' })
    }

    params.push(id, req.user?.businessId)
    const { rows } = await query(
      `UPDATE products SET ${fields.join(', ')} WHERE id = $${idx} AND business_id = $${idx + 1} RETURNING id, name, category, selling_price, cost_price, stock_unit, low_stock_threshold, image_url, quantity, is_active, created_at`,
      params
    )

    if (!rows.length) {
      return res.status(404).json({ error: 'Product not found.' })
    }

await logAudit({
       userId: req.user?.id,
       actorName: req.user?.full_name || req.user?.email || 'System',
       action: `Updated product "${rows[0].name}"`,
       targetModule: 'Products',
       ipAddress: getClientIp(req),
       businessId: req.user?.businessId,
     })

    const p = rows[0]
    res.json({
      id: p.id,
      name: p.name,
      category: p.category || 'Other',
      price: Number(p.selling_price) || 0,
      costPrice: Number(p.cost_price) || 0,
      unit: p.stock_unit || 'unit',
      minStockLevel: Number(p.low_stock_threshold) || 0,
      imageUrl: p.image_url || '',
      quantity: Number(p.quantity) || 0,
      isActive: p.is_active,
      createdAt: p.created_at ? new Date(p.created_at).toISOString() : null,
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.delete('/:id', ...managerOnly, async (req, res) => {
  try {
    const businessId = req.user?.businessId
    const { rows } = await query('DELETE FROM products WHERE id = $1 AND business_id = $2 RETURNING id, name', [req.params.id, businessId])
    if (!rows.length) {
      return res.status(404).json({ error: 'Product not found in your business.' })
    }

await logAudit({
       userId: req.user?.id,
       actorName: req.user?.full_name || req.user?.email || 'System',
       action: `Deleted product "${rows[0].name}"`,
       targetModule: 'Products',
       ipAddress: getClientIp(req),
       businessId: req.user?.businessId,
     })

    res.json({ id: rows[0].id })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
