import { query } from '../config/database.js'
import bcrypt from 'bcryptjs'

const SEED_USERS = [
  ['Aline Uwimana', 'aline@barflow.rw', 'owner', 'Head Office', 'owner123', 'owner'],
  ['Eric Niyonzima', 'eric@barflow.rw', 'manager', 'Kigali Heights', 'manager123', 'manager'],
  ['Claudine Mukamana', 'claudine@barflow.rw', 'accountant', 'Head Office', 'accountant123', 'accountant'],
  ['David Habimana', 'david@barflow.rw', 'waiter', 'Kigali Heights', 'waiter123', 'waiter'],
]

const SEED_PRODUCTS = [
  { name: 'Mutzig', category: 'Beer', price: 2500, cost: 1800, stock: 200, unit: 'Bottle' },
  { name: 'Primus', category: 'Beer', price: 2000, cost: 1500, stock: 300, unit: 'Bottle' },
  { name: 'Heineken', category: 'Beer', price: 3500, cost: 2500, stock: 150, unit: 'Bottle' },
  { name: 'Skol', category: 'Beer', price: 2000, cost: 1400, stock: 250, unit: 'Bottle' },
  { name: 'Turbo King', category: 'Beer', price: 2500, cost: 1800, stock: 180, unit: 'Bottle' },
  { name: 'Amstel', category: 'Beer', price: 3000, cost: 2200, stock: 120, unit: 'Bottle' },
  { name: 'Coca-Cola', category: 'Soft Drinks', price: 1000, cost: 600, stock: 500, unit: 'Can' },
  { name: 'Fanta Orange', category: 'Soft Drinks', price: 1000, cost: 600, stock: 400, unit: 'Can' },
  { name: 'Sprite', category: 'Soft Drinks', price: 1000, cost: 600, stock: 400, unit: 'Can' },
  { name: 'Mountain Dew', category: 'Soft Drinks', price: 1000, cost: 600, stock: 300, unit: 'Can' },
  { name: 'Water (1.5L)', category: 'Soft Drinks', price: 800, cost: 400, stock: 200, unit: 'Bottle' },
  { name: 'Johnnie Walker Red', category: 'Whisky', price: 15000, cost: 10000, stock: 50, unit: 'Bottle' },
  { name: 'Johnnie Walker Black', category: 'Whisky', price: 25000, cost: 18000, stock: 30, unit: 'Bottle' },
  { name: 'Jameson', category: 'Whisky', price: 20000, cost: 14000, stock: 40, unit: 'Bottle' },
  { name: 'Chivas Regal 12', category: 'Whisky', price: 30000, cost: 22000, stock: 20, unit: 'Bottle' },
  { name: 'Smirnoff Red', category: 'Vodka', price: 12000, cost: 8000, stock: 60, unit: 'Bottle' },
  { name: 'Absolut Vodka', category: 'Vodka', price: 15000, cost: 10000, stock: 40, unit: 'Bottle' },
  { name: 'Cîroc', category: 'Vodka', price: 20000, cost: 14000, stock: 25, unit: 'Bottle' },
  { name: 'Baileys Irish Cream', category: 'Liqueur', price: 18000, cost: 13000, stock: 30, unit: 'Bottle' },
  { name: 'Amarula', category: 'Liqueur', price: 15000, cost: 10000, stock: 35, unit: 'Bottle' },
  { name: 'Jägermeister', category: 'Liqueur', price: 20000, cost: 14000, stock: 25, unit: 'Bottle' },
  { name: 'Hennessy VS', category: 'Cognac', price: 35000, cost: 25000, stock: 20, unit: 'Bottle' },
  { name: 'Martell VS', category: 'Cognac', price: 30000, cost: 22000, stock: 15, unit: 'Bottle' },
  { name: 'Rwandan Gin', category: 'Gin', price: 8000, cost: 5000, stock: 80, unit: 'Bottle' },
  { name: 'Bombay Sapphire', category: 'Gin', price: 18000, cost: 12000, stock: 30, unit: 'Bottle' },
  { name: 'Red Bull', category: 'Energy Drinks', price: 2500, cost: 1500, stock: 200, unit: 'Can' },
  { name: 'Monster Energy', category: 'Energy Drinks', price: 3000, cost: 2000, stock: 150, unit: 'Can' },
  { name: 'Orange Juice (Fresh)', category: 'Juices', price: 2000, cost: 1000, stock: 80, unit: 'Glass' },
  { name: 'Pineapple Juice (Fresh)', category: 'Juices', price: 2000, cost: 1000, stock: 80, unit: 'Glass' },
  { name: 'Chapati & Beans', category: 'Food', price: 3000, cost: 1500, stock: 50, unit: 'Plate' },
  { name: 'Brochettes (Beef)', category: 'Food', price: 1500, cost: 800, stock: 200, unit: 'Stick' },
  { name: 'Brochettes (Chicken)', category: 'Food', price: 2000, cost: 1000, stock: 150, unit: 'Stick' },
  { name: 'Fries (Large)', category: 'Food', price: 2500, cost: 1000, stock: 100, unit: 'Portion' },
  { name: 'Samosas (3 pcs)', category: 'Food', price: 2000, cost: 800, stock: 80, unit: 'Plate' },
  { name: 'Nyama Choma (1kg)', category: 'Food', price: 12000, cost: 7000, stock: 30, unit: 'Kg' },
]

export async function seed() {
  const { rows: existingBiz } = await query('SELECT id FROM businesses LIMIT 1')

  if (!existingBiz.length) {
    const business = (await query(`INSERT INTO businesses (name) VALUES ('BarFlow Demo') RETURNING id`)).rows[0]

    const branchRows = await Promise.all(
      [
        ['Head Office', 'KG 123 St', true],
        ['Kigali Heights', 'KG 456 Ave', true],
        ['Remera Branch', 'KG 789 Rd', false],
      ].map(([name, address, isActive]) =>
        query(
          `INSERT INTO branches (business_id, name, address, is_active) VALUES ($1, $2, $3, $4) RETURNING id, name`,
          [business.id, name, address, isActive]
        )
      )
    )
    const branchByName = Object.fromEntries(branchRows.map((r) => [r.rows[0].name, r.rows[0].id]))

    for (const [name, email, role, branchName, password, username] of SEED_USERS) {
      const passwordHash = await bcrypt.hash(password, 10)
      await query(
        `INSERT INTO users (business_id, branch_id, full_name, email, username, password_hash, role, salary, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)`,
        [business.id, branchByName[branchName], name, email, username, passwordHash, role, role === 'owner' ? 0 : 450000]
      )
    }

    const adminHash = await bcrypt.hash('admin123', 10)
    await query(
      `INSERT INTO platform_admins (email, password_hash, full_name, role, is_active)
       VALUES ($1, $2, $3, $4, TRUE)`,
      ['admin@barflow.com', adminHash, 'Super Admin', 'super_admin']
    )

    for (const product of SEED_PRODUCTS) {
      await query(
        `INSERT INTO products (business_id, name, category, selling_price, cost_price, quantity, stock_unit, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)`,
        [business.id, product.name, product.category, product.price, product.cost, product.stock, product.unit]
      )
    }

    await query(`INSERT INTO subscriptions (business_id, status, plan, payment_status, is_active, current_period_end) VALUES ($1, 'active', 'Pro', 'verified', TRUE, NOW() + INTERVAL '1 year')`, [business.id])

    await query(
      `INSERT INTO audit_logs (business_id, actor_name, action, entity_type)
       VALUES ($1, 'Owner', 'Created the initial staff accounts.', 'user')`,
      [business.id]
    )

    console.log('Seed data inserted with 35 products and platform admin.')
  } else {
    console.log('Business already exists, ensuring users exist...')

    const { rows: ownerUsers } = await query("SELECT id FROM users WHERE role = 'owner' LIMIT 1")
    if (!ownerUsers.length) {
      const business = existingBiz[0]
      const { rows: branches } = await query('SELECT id FROM branches WHERE business_id = $1 LIMIT 1', [business.id])
      const branchId = branches.length ? branches[0].id : null

      const owner = SEED_USERS.find((u) => u[2] === 'owner') || ['Owner', 'owner@barflow.rw', 'owner', 'Head Office', 'owner123', 'owner']
      const [name, email, , , password, username] = owner
      const passwordHash = await bcrypt.hash(password, 10)

      await query(
        `INSERT INTO users (business_id, branch_id, full_name, email, username, password_hash, role, salary, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)`,
        [business.id, branchId, name, email, username, passwordHash, 'owner', 0]
      )
      console.log('Created missing owner user for existing business.')
    }

    const { rows: existingAdmins } = await query('SELECT id FROM platform_admins LIMIT 1')
    if (!existingAdmins.length) {
      const adminHash = await bcrypt.hash('admin123', 10)
      await query(
        `INSERT INTO platform_admins (email, password_hash, full_name, role, is_active)
         VALUES ($1, $2, $3, $4, TRUE)`,
        ['admin@barflow.com', adminHash, 'Super Admin', 'super_admin']
      )
      console.log('Created missing platform admin.')
    }
  }

  const { rows: existingPlans } = await query('SELECT id FROM subscription_plans LIMIT 1')
  if (!existingPlans.length) {
    await query(
      `INSERT INTO subscription_plans (name, description, price_monthly, price_yearly, features, discount_quarterly, discount_annually, is_active, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        'Pro', 'Full platform access with monthly, quarterly, or annual billing', 48000, 460800,
        JSON.stringify(['Unlimited branches', 'Unlimited users', 'Full inventory suite', 'Priority support', 'Analytics dashboard', 'Custom integrations']),
        8, 14, true, 1,
      ]
    )
    console.log('Subscription plan seeded.')
  }
}
