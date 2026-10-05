import { createBackup } from '../utils/backup.js'

export async function createBackupHandler(_req, res) {
  try {
    const file = await createBackup()
    res.json({ message: 'Backup created', file })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}
