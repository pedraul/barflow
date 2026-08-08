import { query } from '../config/database.js'

export async function sendNotification({ title, message, userId = null }) {
  const { rows } = await query(
    `INSERT INTO notifications (business_id, user_id, title, message)
     VALUES ((SELECT id FROM businesses LIMIT 1), $1, $2, $3) RETURNING id`,
    [userId, title, message]
  )
  return rows[0]
}

export async function listNotifications(userId = null) {
  const { rows } = userId
    ? await query('SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC', [userId])
    : await query('SELECT * FROM notifications ORDER BY created_at DESC')
  return rows
}
