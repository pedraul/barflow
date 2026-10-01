import { migrate } from '../migrations/run.js'
import { pool } from '../config/database.js'

try {
  await migrate()
  console.log('Database migrations complete.')
} finally {
  await pool.end()
}