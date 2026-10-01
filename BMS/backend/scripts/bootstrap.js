import { migrate } from '../migrations/run.js'
import { seed } from '../seeders/seed.js'
import { pool } from '../config/database.js'

try {
  console.log('Initializing database migrations...')
  await migrate()
  console.log('Running database seeders...')
  await seed()
  console.log('Database bootstrap complete.')
} finally {
  await pool.end()
}
