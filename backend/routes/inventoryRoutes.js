import { Router } from 'express'
import { query } from '../config/database.js'
import { logAudit, getClientIp } from '../utils/audit.js'
import authMiddleware from '../middleware/authMiddleware.js'
import { getBranchContext } from '../middleware/branchContext.js'

const router = Router()

// Stock lives in branch_stock; the Manager dashboard adjusts it via this read endpoint.
router.get('/', authMiddleware, async (req, res) => {
  try {
    const scope = await getBranchContext(req, { requestedBranchId: req.query.branchId, allowOwnerAll: true })
    const branchFilter = scope.branchId ? ' AND bs.branch_id = $2' : ''
    const params = scope.branchId ? [scope.businessId, scope.branchId] : [scope.businessId]
    const { rows } = await query(
      `SELECT bs.branch_id, b.name AS branch, bs.product_id, p.name AS product, bs.quantity, bs.updated_at
       FROM branch_stock bs
       JOIN branches b ON b.id = bs.branch_id AND b.business_id = $1
       JOIN products p ON p.id = bs.product_id AND p.business_id = $1
       WHERE 1 = 1${branchFilter}
       ORDER BY b.name, p.name`,
      params
    )
    res.json(rows)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.patch('/:productId', authMiddleware, async (req, res) => {
  const { branchId, change } = req.body
  if (!branchId || change == null) {
    return res.status(400).json({ error: 'branchId and change are required.' })
  }
  try {
    const scope = await getBranchContext(req, { requestedBranchId: branchId, allowOwnerAll: false })
    await query(
      `INSERT INTO branch_stock (branch_id, product_id, quantity, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (branch_id, product_id)
       DO UPDATE SET quantity = GREATEST(0, branch_stock.quantity + $3), updated_at = NOW()`,
      [scope.branchId, req.params.productId, change]
    )
    await query(
      `INSERT INTO stock_movements (branch_id, product_id, movement_type, quantity_change, note)
       VALUES ($1, $2, 'adjustment', $3, 'Manual adjustment')`,
      [scope.branchId, req.params.productId, change]
    )

    await logAudit({
      userId: req.user?.id,
      actorName: req.user?.full_name || req.user?.email || 'System',
      action: `Adjusted stock for product ${req.params.productId} by ${change}`,
      targetModule: 'Inventory',
      ipAddress: getClientIp(req),
      businessId: req.user?.businessId,
    })

    res.json({ ok: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
