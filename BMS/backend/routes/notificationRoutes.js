import { Router } from 'express'
import { query } from '../config/database.js'
import authMiddleware from '../middleware/authMiddleware.js'

const router = Router()

async function getCurrentBusinessId(req) {
  if (req.user?.businessId) return req.user.businessId

  // Tokens issued before businessId was added should still be able to use
  // messaging instead of producing a database error from an undefined ID.
  try {
    const { rows } = await query('SELECT business_id FROM users WHERE id = $1::uuid', [req.user?.id])
    return rows[0]?.business_id || null
  } catch (err) {
    console.error('Failed to resolve business id for user:', req.user?.id, err)
    return null
  }
}

// GET /api/notifications - list all broadcast messages from same business
router.get('/', authMiddleware, async (req, res) => {
  try {
    const currentUserId = req.user.id
    const currentBusinessId = await getCurrentBusinessId(req)
    if (!currentBusinessId) return res.json([])
    const { rows } = await query(
      `SELECT n.*, u.full_name AS sender_name,
              COALESCE(nr.user_id IS NOT NULL, FALSE) AS is_read
       FROM notifications n
       JOIN users u ON u.id = n.sender_id
       LEFT JOIN notification_reads nr ON nr.notification_id = n.id AND nr.user_id = $1
       WHERE n.receiver_id IS NULL
         AND u.business_id = $2
       ORDER BY n.created_at DESC`,
      [currentUserId, currentBusinessId]
    )
    res.json(rows)
  } catch (error) {
    console.error('Error in GET /api/notifications/:', error)
    res.status(500).json({ error: error.message })
  }
})

// GET /api/notifications/group - all staff group messages from same business
router.get('/group', authMiddleware, async (req, res) => {
  try {
    const currentUserId = req.user.id
    const currentBusinessId = await getCurrentBusinessId(req)
    if (!currentBusinessId) return res.json([])
    const { rows } = await query(
      `SELECT n.*, u.full_name AS sender_name,
              COALESCE(nr.user_id IS NOT NULL, FALSE) AS is_read
       FROM notifications n
       JOIN users u ON u.id = n.sender_id
       LEFT JOIN notification_reads nr ON nr.notification_id = n.id AND nr.user_id = $1
       WHERE n.receiver_id IS NULL
         AND u.business_id = $2
       ORDER BY n.created_at ASC`,
      [currentUserId, currentBusinessId]
    )
    res.json(rows)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})
router.get('/unread-count', authMiddleware, async (req, res) => {
  try {
    const currentUserId = req.user.id
    const currentBusinessId = await getCurrentBusinessId(req)
    if (!currentBusinessId) return res.json({ count: 0 })
    const { rows } = await query(
      `SELECT COUNT(*) AS count FROM notifications n
       JOIN users u ON u.id = n.sender_id
       WHERE n.receiver_id IS NULL
         AND u.business_id = $1::uuid
         AND n.id NOT IN (
           SELECT notification_id FROM notification_reads WHERE user_id = $2::uuid
         )`,
      [currentBusinessId, currentUserId]
    )
    res.json({ count: Number(rows[0].count) })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// GET /api/notifications/conversations - list conversations for current user within same business
router.get('/conversations', authMiddleware, async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
    const currentUserId = req.user.id
    const currentBusinessId = await getCurrentBusinessId(req)
    if (!currentBusinessId) return res.json([])
    const { rows } = await query(
      `SELECT 
         CASE 
           WHEN n.sender_id = $1::uuid THEN n.receiver_id 
           ELSE n.sender_id 
         END AS other_user_id,
         MAX(n.created_at) AS last_message_at,
         COUNT(*) AS message_count
       FROM notifications n
       WHERE (n.sender_id = $1::uuid OR n.receiver_id = $1::uuid)
         AND n.receiver_id IS NOT NULL
         AND (
           (n.sender_id = $1::uuid AND EXISTS (SELECT 1 FROM users WHERE id = n.receiver_id AND business_id = $2::uuid))
            OR
           (n.receiver_id = $1::uuid AND EXISTS (SELECT 1 FROM users WHERE id = n.sender_id AND business_id = $2::uuid))
         )
       GROUP BY other_user_id
       ORDER BY last_message_at DESC`,
      [currentUserId, currentBusinessId]
    )
    if (!rows || rows.length === 0) return res.json([])

    const conversations = await Promise.all(rows.map(async (r) => {
      try {
        if (!r || !r.other_user_id) return null
        // continue below
      } catch (mapErr) {
        console.error('Error mapping conversation row:', mapErr, { row: r })
        return null
      }
      const { rows: userRows } = await query(
        `SELECT id, full_name, avatar_url FROM users WHERE id = $1::uuid AND business_id = $2::uuid`,
        [r.other_user_id, currentBusinessId]
      )
      const otherUser = userRows[0] || { id: r.other_user_id, full_name: 'Unknown', avatar_url: '' }
      const { rows: msgRows } = await query(
        `SELECT n.*, u.full_name AS sender_name
         FROM notifications n
         JOIN users u ON u.id = n.sender_id
         WHERE ((n.sender_id = $1::uuid AND n.receiver_id = $2::uuid) OR (n.sender_id = $2::uuid AND n.receiver_id = $1::uuid))
           AND n.receiver_id IS NOT NULL
           AND (
             (n.sender_id = $1::uuid AND EXISTS (SELECT 1 FROM users WHERE id = n.receiver_id AND business_id = $3::uuid))
             OR
             (n.receiver_id = $1::uuid AND EXISTS (SELECT 1 FROM users WHERE id = n.sender_id AND business_id = $3::uuid))
           )
         ORDER BY n.created_at ASC`,
        [currentUserId, r.other_user_id, currentBusinessId]
      )
      const lastMessage = msgRows[msgRows.length - 1] || null
      const unreadCount = msgRows.filter(m => m.sender_id !== currentUserId && !m.is_read).length
      return {
        userId: otherUser.id,
        userName: otherUser.full_name,
        userAvatar: otherUser.avatar_url || '',
        lastMessage: lastMessage ? lastMessage.message : '',
        lastMessageTime: lastMessage ? lastMessage.created_at : r.last_message_at,
        unreadCount,
        messages: msgRows,
      }
    }))
    // filter out any nulls produced from failed rows
    res.json((conversations || []).filter(Boolean))
  } catch (error) {
    console.error('Error in GET /api/notifications/conversations:', error)
    res.status(500).json({ error: error.message })
  }
})

// GET /api/notifications/messages/:userId - get messages with a specific user within same business
router.get('/messages/:userId', authMiddleware, async (req, res) => {
  try {
    const currentUserId = req.user.id
    const currentBusinessId = await getCurrentBusinessId(req)
    const { userId } = req.params
    if (!currentBusinessId) return res.status(400).json({ error: 'Could not determine business for current user' })
    const { rows } = await query(
      `SELECT n.*, u.full_name AS sender_name
       FROM notifications n
       JOIN users u ON u.id = n.sender_id
       WHERE ((n.sender_id = $1::uuid AND n.receiver_id = $2::uuid) OR (n.sender_id = $2::uuid AND n.receiver_id = $1::uuid))
         AND n.receiver_id IS NOT NULL
         AND EXISTS (SELECT 1 FROM users WHERE id = $2::uuid AND business_id = $3::uuid)
       ORDER BY n.created_at ASC`,
      [currentUserId, userId, currentBusinessId]
    )
    await query(
      `UPDATE notifications SET is_read = TRUE 
       WHERE receiver_id = $1::uuid AND sender_id = $2::uuid AND is_read = FALSE`,
      [currentUserId, userId]
    )
    res.json(rows)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// POST /api/notifications - send a broadcast/direct message or reply
router.post('/', authMiddleware, async (req, res) => {
  try {
    const currentUserId = req.user.id
    const { message, receiverId, parentId, mediaUrl, mediaType } = req.body
    if (!message && !mediaUrl) {
      return res.status(400).json({ error: 'Message or media is required.' })
    }
    const trimmedMessage = message?.trim() || ''
    try {
      const { rows } = await query(
        `INSERT INTO notifications (sender_id, receiver_id, message, parent_id, media_url, media_type)
          VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5, $6) RETURNING *`,
        [currentUserId, receiverId || null, trimmedMessage, parentId || null, mediaUrl || null, mediaType || null]
      )
      res.status(201).json(rows[0])
    } catch (insertError) {
      if (insertError.message.includes('column') && insertError.message.includes('does not exist')) {
        const { rows } = await query(
          `INSERT INTO notifications (sender_id, receiver_id, message, parent_id)
            VALUES ($1::uuid, $2::uuid, $3, $4::uuid) RETURNING *`,
          [currentUserId, receiverId || null, trimmedMessage, parentId || null]
        )
        res.status(201).json(rows[0])
      } else {
        throw insertError
      }
    }
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// DELETE /api/notifications/:id - delete a message (sender only)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params
    const currentUserId = req.user.id
    const { rows } = await query(
      `SELECT sender_id FROM notifications WHERE id = $1::uuid`,
      [id]
    )
    if (!rows.length) return res.status(404).json({ error: 'Message not found' })
    if (rows[0].sender_id !== currentUserId) {
      return res.status(403).json({ error: 'You can only delete your own messages' })
    }
    await query(`DELETE FROM notifications WHERE id = $1::uuid`, [id])
    res.json({ id })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// PATCH /api/notifications/:id - edit message text (sender only)
router.patch('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params
    const currentUserId = req.user.id
    const { message } = req.body
    if (message === undefined) return res.status(400).json({ error: 'message is required' })
    const { rows } = await query(
      `SELECT sender_id FROM notifications WHERE id = $1::uuid`,
      [id]
    )
    if (!rows.length) return res.status(404).json({ error: 'Message not found' })
    if (rows[0].sender_id !== currentUserId) {
      return res.status(403).json({ error: 'You can only edit your own messages' })
    }
    const { rows: updated } = await query(
      `UPDATE notifications SET message = $1 WHERE id = $2::uuid RETURNING *`,
      [message, id]
    )
    res.json(updated[0])
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// PATCH /api/notifications/:id/read - mark a broadcast as read for current user
router.patch('/:id/read', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params
    const currentUserId = req.user.id
    await query(
      `INSERT INTO notification_reads (notification_id, user_id)
       VALUES ($1::uuid, $2::uuid)
       ON CONFLICT (notification_id, user_id) DO NOTHING`,
      [id, currentUserId]
    )
    res.json({ id })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// PATCH /api/notifications/mark-all-read - mark all broadcasts as read for current user
router.patch('/mark-all-read', authMiddleware, async (req, res) => {
  try {
    const currentUserId = req.user.id
    await query(
      `INSERT INTO notification_reads (user_id, notification_id)
       SELECT $1::uuid, id FROM notifications WHERE receiver_id IS NULL
       ON CONFLICT (notification_id, user_id) DO NOTHING`,
      [currentUserId]
    )
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
