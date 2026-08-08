import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotifications } from '../context/NotificationContext'

export default function NotificationIcon() {
  const navigate = useNavigate()
  const { unreadCount } = useNotifications()

  return (
    <button
      type="button"
      className="notification-icon-btn"
      onClick={() => navigate('/notifications')}
      aria-label={`Messages${unreadCount ? ` (${unreadCount} unread)` : ''}`}
      title="Messages"
    >
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM7 9h10v2H7V9zm6 4H7v-2h6v2zm4-6H7V5h10v2z" fill="currentColor"/>
      </svg>
      {unreadCount > 0 && (
        <span className="notification-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
      )}
    </button>
  )
}
