import { query, pool } from '../config/database.js'
import { logAudit, getClientIp } from '../utils/audit.js'

export async function createOrderCore({
  businessId,
  branchId,
  tableName,
  source,
  status = 'Open',
  customerName,
  orderType,
  paymentMethod,
  items = [],
  req,
}) {
  if (!items.length) {
    const err = new Error('Order must have at least one item')
    err.statusCode = 400
    throw err
  }

  const productIds = items.map((i) => i.productId).filter(Boolean)
const productsResult = await query(
      `SELECT id, name, category, selling_price, quantity
       FROM products
       WHERE business_id = $1 AND (id = ANY($2) OR name = ANY($3))`,
      [businessId, productIds, items.map((i) => i.name)]
    )
  const productMap = {}
  for (const p of productsResult.rows) {
    productMap[p.id] = p
    productMap[p.name] = p
  }

  const resolved = []
  for (const item of items) {
    const product = (item.productId && productMap[item.productId]) || productMap[item.name]
    if (!product) {
      const err = new Error(`Product ${item.name || item.productId} not found in your business menu`)
      err.statusCode = 400
      throw err
    }
    const orderedQty = Number(item.quantity) || 0
    if (Number(product.quantity) < orderedQty) {
      const err = new Error(`Insufficient stock for ${product.name}. Available: ${product.quantity}`)
      err.statusCode = 400
      throw err
    }
    resolved.push({
      product,
      quantity: orderedQty,
      unitPrice: Number(product.selling_price),
    })
  }

  // Exact category lists for automatic kitchen/bar routing of orders placed
  // by waiters or via QR code scan.
  const KITCHEN_CATEGORIES = [
    'Appetizers',
    'Snacks',
    'BBQ & Grills',
    'Chicken Dishes',
    'Beef Dishes',
    'Pork Dishes',
    'Fish & Seafood',
    'Burgers',
    'Pizza',
    'Sandwiches',
    'Fries & Chips',
    'Main Meals',
    'Local Dishes',
    'Salads',
    'Desserts',
  ]

  const BAR_CATEGORIES = [
    'Beer',
    'Wine',
    'Spirits',
    'Cocktails',
    'Mocktails',
    'Soft Drinks',
    'Juices',
    'Water',
    'Energy Drinks',
    'Tea and Coffee',
  ]

  const isKitchenCategory = (cat) => {
    const c = (cat || '').trim().toLowerCase()
    return KITCHEN_CATEGORIES.some((k) => k.toLowerCase() === c)
  }

  const isBarCategory = (cat) => {
    const c = (cat || '').trim().toLowerCase()
    return BAR_CATEGORIES.some((b) => b.toLowerCase() === c)
  }

  const isDrinkCategory = (cat) => {
    const c = (cat || '').toLowerCase()
    return (
      c.includes('drink') ||
      c.includes('beer') ||
      c.includes('wine') ||
      c.includes('cocktail') ||
      c.includes('beverage') ||
      c.includes('soft') ||
      c.includes('liquor') ||
      c.includes('spirit')
    )
  }

  const hasDrinks = resolved.some((r) => isDrinkCategory(r.product.category))
  const hasFood = resolved.some((r) => !isDrinkCategory(r.product.category))
  const finalOrderType = orderType || (hasDrinks && !hasFood ? 'drinks' : 'food')

  // Automatic kitchen/bar routing for all orders placed by waiters or via QR
  // code scan. Orders are directed directly to the kitchen when their items
  // belong to kitchen categories (Appetizers, Snacks, BBQ & Grills, Chicken
  // Dishes, Beef Dishes, Pork Dishes, Fish & Seafood, Burgers, Pizza,
  // Sandwiches, Fries & Chips, Main Meals, Local Dishes, Salads, Desserts) and
  // to the bar when their items belong to bar categories (Beer, Wine, Spirits,
  // Cocktails, Mocktails, Soft Drinks, Juices, Water, Energy Drinks, Hot
  // Beverages (Coffee & Tea)). Orders with both go to 'both'.
  const hasKitchenItems = resolved.some((r) => isKitchenCategory(r.product.category))
  const hasBarItems = resolved.some((r) => isBarCategory(r.product.category) || isDrinkCategory(r.product.category))
  const station = hasKitchenItems && hasBarItems ? 'both' : hasBarItems ? 'bar' : 'kitchen'

  let subtotal = 0
  for (const r of resolved) subtotal += r.unitPrice * r.quantity

  const taxRate = 0.18
  const taxAmount = subtotal * (taxRate / (1 + taxRate))
  const totalAmount = subtotal

  const countResult = await query(
    `SELECT COUNT(*)::int AS count FROM orders WHERE created_at::date = CURRENT_DATE`
  )
  const orderNumber = String(countResult.rows[0].count + 1).padStart(3, '0')

  const userId = req?.user?.id || null
  const createdBy = source === 'qr'
    ? `Customer (Table ${tableName})`
    : req?.user?.full_name || req?.user?.email || 'Staff'
  const auditActor = req?.user
    ? req.user.full_name || req.user.email || 'System'
    : source === 'qr'
    ? `Customer (Table ${tableName})`
    : 'System'

  const orderResult = await query(
    `INSERT INTO orders (business_id, branch_id, user_id, table_name, order_number, order_type,
      source, status, subtotal, tax_amount, total_amount, payment_method, station, customer_name, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW()) RETURNING id`,
    [
      businessId,
      branchId,
      userId,
      tableName,
      orderNumber,
      finalOrderType,
      source,
      status,
      subtotal,
      taxAmount,
      totalAmount,
      paymentMethod || null,
      station,
      customerName || null,
    ]
  )
  const orderId = orderResult.rows[0].id

  for (const r of resolved) {
    const lineTotal = r.unitPrice * r.quantity
    await query(
      `INSERT INTO order_items (order_id, product_id, quantity, unit_price, line_total)
       VALUES ($1, $2, $3, $4, $5)`,
      [orderId, r.product.id, r.quantity, r.unitPrice, lineTotal]
    )
    await query(
      `UPDATE products SET quantity = GREATEST(0, quantity - $1) WHERE id = $2`,
      [r.quantity, r.product.id]
    )
    if (branchId) {
      await query(
        `INSERT INTO stock_movements (branch_id, product_id, movement_type, quantity_change, note)
         VALUES ($1, $2, 'sale', $3, $4)`,
         [branchId, r.product.id, -r.quantity, `Order ${orderNumber}`]
      )
    }
  }

  await query(
    `INSERT INTO order_status_history (order_id, status, changed_by, note)
     VALUES ($1, $2, $3, $4)`,
    [
      orderId,
      status,
      createdBy,
      `Order created via ${source} by ${createdBy}`,
    ]
  )

  if (!req?.skipAudit) {
    await logAudit({
      userId,
      actorName: auditActor,
      action: `Created order ${orderNumber} (${source}, ${totalAmount} RWF)`,
      targetModule: 'Orders',
      ipAddress: getClientIp(req),
      businessId: req?.user?.businessId,
    })
  }

  return {
    id: orderId,
    orderId,
    orderNumber,
    orderType: finalOrderType,
    station,
    source,
    tableNumber: tableName,
    customerName: customerName || null,
    subtotal,
    tax: taxAmount,
    total: totalAmount,
    status,
    items: resolved.map((r) => ({
      productId: r.product.id,
      name: r.product.name,
      quantity: r.quantity,
      price: r.unitPrice,
      lineTotal: r.unitPrice * r.quantity,
    })),
  }
}

export async function addItemsToOrder({ orderId, items, req }) {
  if (!items || !Array.isArray(items) || !items.length) {
    throw new Error('No items provided to add')
  }

  const orderResult = await query('SELECT * FROM orders WHERE id = $1', [orderId])
  if (!orderResult.rows.length) {
    throw new Error('Order not found')
  }
  const order = orderResult.rows[0]

  const modifiableStatuses = ['Open', 'Preparing', 'Pending', 'Waiting for Preparation']
  if (!modifiableStatuses.includes(order.status)) {
    const err = new Error(`Order cannot be modified because it is already ${order.status}`)
    err.statusCode = 400
    throw err
  }

  const businessId = order.business_id
  const branchId = order.branch_id

  // Resolve products
  const productIds = items.map((i) => i.productId).filter(Boolean)
const productsResult = await query(
    `SELECT id, name, category, selling_price, quantity
      FROM products
      WHERE business_id = $1 AND (id = ANY($2) OR name = ANY($3))`,
    [businessId, productIds, items.map((i) => i.name)]
  )
  const productMap = {}
  for (const p of productsResult.rows) {
    productMap[p.id] = p
    productMap[p.name] = p
  }

  const resolved = []
  for (const item of items) {
    const product = (item.productId && productMap[item.productId]) || productMap[item.name]
    if (!product) {
      const err = new Error(`Product ${item.name || item.productId} not found in your business menu`)
      err.statusCode = 400
      throw err
    }
    const addQty = Number(item.quantity) || 0
    if (addQty <= 0) {
      const err = new Error('Quantity to add must be greater than 0')
      err.statusCode = 400
      throw err
    }
    if (Number(product.quantity) < addQty) {
      const err = new Error(`Insufficient stock for ${product.name}. Available: ${product.quantity}`)
      err.statusCode = 400
      throw err
    }
    resolved.push({
      product,
      quantity: addQty,
      unitPrice: Number(product.selling_price),
    })
  }

  const userId = req?.user?.id || null
  const actorName = req?.user?.full_name || req?.user?.email || 'System'

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    let addedSubtotal = 0

    for (const r of resolved) {
      const lineTotal = r.unitPrice * r.quantity

      // Check if product already exists in order_items
      const existingItem = await client.query(
        'SELECT * FROM order_items WHERE order_id = $1 AND product_id = $2',
        [orderId, r.product.id]
      )

      if (existingItem.rows.length) {
        const orderItem = existingItem.rows[0]
        const newQty = Number(orderItem.quantity) + r.quantity
        const newLineTotal = Number(orderItem.unit_price) * newQty
        await client.query(
          'UPDATE order_items SET quantity = $1, line_total = $2 WHERE id = $3',
          [newQty, newLineTotal, orderItem.id]
        )
        await client.query(
          `INSERT INTO order_item_changes (order_id, order_item_id, product_id, original_quantity, updated_quantity, change_type, reason, changed_by, changed_by_name)
           VALUES ($1, $2, $3, $4, $5, 'add', 'Additional items added to order', $6, $7)`,
          [orderId, orderItem.id, r.product.id, Number(orderItem.quantity), newQty, userId, actorName]
        )
      } else {
        const insertResult = await client.query(
          `INSERT INTO order_items (order_id, product_id, quantity, unit_price, line_total)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [orderId, r.product.id, r.quantity, r.unitPrice, lineTotal]
        )
        await client.query(
          `INSERT INTO order_item_changes (order_id, order_item_id, product_id, original_quantity, updated_quantity, change_type, reason, changed_by, changed_by_name)
           VALUES ($1, $2, $3, $4, $5, 'add', 'New item added to order', $6, $7)`,
          [orderId, insertResult.rows[0].id, r.product.id, 0, r.quantity, userId, actorName]
        )
      }

      // Deduct stock
      await client.query(
        'UPDATE products SET quantity = GREATEST(0, quantity - $1) WHERE id = $2',
        [r.quantity, r.product.id]
      )

      if (branchId) {
        await client.query(
          `INSERT INTO stock_movements (branch_id, product_id, movement_type, quantity_change, note)
           VALUES ($1, $2, 'sale', $3, $4)`,
          [branchId, r.product.id, -r.quantity, `Added to order ${order.order_number}`]
        )
      }

      addedSubtotal += lineTotal
    }

    // Update order totals
    const newSubtotal = Number(order.subtotal) + addedSubtotal
    const taxRate = 0.18
    const newTax = newSubtotal * (taxRate / (1 + taxRate))
    const newTotal = newSubtotal

    await client.query(
      'UPDATE orders SET subtotal = $1, tax_amount = $2, total_amount = $3 WHERE id = $4',
      [newSubtotal, newTax, newTotal, orderId]
    )

    await client.query(
      `INSERT INTO order_status_history (order_id, status, changed_by, note)
       VALUES ($1, $2, 'staff', 'Items added to order by ' || $3)`,
      [orderId, order.status, actorName]
    )

    await client.query('COMMIT')

    // Fetch updated order to return
    const updatedOrder = await query(
      `SELECT o.*, (
         SELECT COALESCE(json_agg(json_build_object(
           'productId', oi.product_id,
           'name', p.name,
           'quantity', oi.quantity,
           'price', oi.unit_price,
           'lineTotal', oi.line_total,
           'category', p.category
         )), '[]')
         FROM order_items oi JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id = o.id
       ) AS items
       FROM orders o WHERE o.id = $1`,
      [orderId]
    )

    return {
      success: true,
      order: updatedOrder.rows[0],
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function restockOrderItems({ orderId, items, reason, req }) {
  if (!items || !Array.isArray(items) || !items.length) {
    throw new Error('No items provided for restocking')
  }
  if (!reason || !reason.trim()) {
    throw new Error('Reason for restocking is required')
  }

  const businessId = req?.user?.businessId
  const orderResult = await query('SELECT * FROM orders WHERE id = $1 AND business_id = $2', [orderId, businessId])
  if (!orderResult.rows.length) {
    throw new Error('Order not found')
  }
  const order = orderResult.rows[0]

  const modifiableStatuses = ['Open', 'Preparing', 'Pending', 'Waiting for Preparation']
  if (!modifiableStatuses.includes(order.status)) {
    const err = new Error(`Order cannot be modified because it is already ${order.status}`)
    err.statusCode = 400
    throw err
  }

  const userId = req?.user?.id || null
  const actorName = req?.user?.full_name || req?.user?.email || 'System'

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    let subtotalAdjustment = 0
    let taxAdjustment = 0

    for (const item of items) {
      const itemResult = await client.query(
        'SELECT * FROM order_items WHERE order_id = $1 AND product_id = $2',
        [orderId, item.productId]
      )
      if (!itemResult.rows.length) {
        throw new Error(`Item not found in order: ${item.productId}`)
      }
      const orderItem = itemResult.rows[0]

      const restockQty = Number(item.quantityToRestock) || 0
      if (restockQty <= 0) {
        throw new Error('Quantity to restock must be greater than 0')
      }
      const currentQty = Number(orderItem.quantity)
      if (restockQty > currentQty) {
        throw new Error(`Cannot restock more than ordered quantity. Ordered: ${currentQty}, Requested: ${restockQty}`)
      }

      const newQty = currentQty - restockQty

      await client.query(
        `INSERT INTO order_item_changes (order_id, order_item_id, product_id, original_quantity, updated_quantity, change_type, reason, changed_by, changed_by_name)
         VALUES ($1, $2, $3, $4, $5, 'restock', $6, $7, $8)`,
        [orderId, orderItem.id, item.productId, currentQty, newQty, reason.trim(), userId, actorName]
      )

      if (newQty === 0) {
        await client.query('DELETE FROM order_items WHERE id = $1', [orderItem.id])
      } else {
        const newLineTotal = Number(orderItem.unit_price) * newQty
        await client.query(
          'UPDATE order_items SET quantity = $1, line_total = $2 WHERE id = $3',
          [newQty, newLineTotal, orderItem.id]
        )
      }

      await client.query(
        'UPDATE products SET quantity = GREATEST(0, quantity + $1) WHERE id = $2',
        [restockQty, item.productId]
      )

      const movementBranchId = order.branch_id || null
      if (movementBranchId) {
        await client.query(
          `INSERT INTO stock_movements (branch_id, product_id, movement_type, quantity_change, note)
           VALUES ($1, $2, 'adjustment', $3, $4)`,
          [movementBranchId, item.productId, restockQty, `Restocked from order ${order.order_number}: ${reason.trim()}`]
        )
      }

      const removedSubtotal = Number(orderItem.unit_price) * restockQty
      const removedTax = removedSubtotal * (0.18 / 1.18)
      subtotalAdjustment += removedSubtotal
      taxAdjustment += removedTax
    }

    const newSubtotal = Math.max(0, Number(order.subtotal) - subtotalAdjustment)
    const newTax = Math.max(0, Number(order.tax_amount) - taxAdjustment)
    const newTotal = newSubtotal

    await client.query(
      'UPDATE orders SET subtotal = $1, tax_amount = $2, total_amount = $3 WHERE id = $4',
      [newSubtotal, newTax, newTotal, orderId]
    )

    await client.query(
      `INSERT INTO order_status_history (order_id, status, changed_by, note)
       VALUES ($1, $2, 'staff', 'Inventory restocked: ' || $3)`,
      [orderId, order.status, reason.trim()]
    )

    await client.query('COMMIT')
    return { success: true }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
