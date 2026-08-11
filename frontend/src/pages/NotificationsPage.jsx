import React, { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNotifications } from '../context/NotificationContext'
import * as api from '../api/endpoints'

export default function NotificationsPage() {
  const { user, logout } = useAuth()
  const {
    notifications,
    conversations,
    activeConversation,
    messages,
    unreadCount,
    loading,
    sending,
    error,
    loadGroupMessages,
    loadConversationMessages,
    sendMessage,
    sendGroupMessage,
    markAllRead,
    setActiveConversation,
  } = useNotifications()

  const [message, setMessage] = useState('')
  const [replyTo, setReplyTo] = useState(null)
  const [users, setUsers] = useState([])
  const [search, setSearch] = useState('')
  const [mediaPreview, setMediaPreview] = useState('')
  const messagesEndRef = useRef(null)
  const chatScrollRef = useRef(null)
  const autoSelectedGroup = useRef(false)
  const fileInputRef = useRef(null)
  const [menu, setMenu] = useState(null) // { msg, x, y }
  const [forwardTarget, setForwardTarget] = useState(null) // userId to forward to
  const [editing, setEditing] = useState(null) // msg being edited
  const [mobileView, setMobileView] = useState('list') // 'list' | 'chat'

  useEffect(() => {
    api.fetchUsers().then((data) => {
      setUsers(data.filter((u) => u.id !== user?.id))
    }).catch(() => {})
  }, [user])

  useEffect(() => {
    if (!autoSelectedGroup.current) {
      autoSelectedGroup.current = true
      handleSelectGroup()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Only auto-scroll to the bottom when the user is already near the bottom.
  // This prevents the view from jumping down while reading older history.
  const nearBottomRef = useRef(true)
  const handleScroll = () => {
    const el = chatScrollRef.current
    if (!el) return
    const threshold = 120
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold
  }

  useEffect(() => {
    if (nearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, notifications])

  const isGroupChat = activeConversation === 'staff-group'

  const activeChat = isGroupChat ? null : conversations.find((c) => c.userId === activeConversation)

  const canUseMessageActions = !['admin', 'super_admin'].includes((user?.role || '').toLowerCase())

  // List every created staff member (so new users appear immediately) and merge
  // in conversation metadata (last message, unread count) where available.
  const convMap = {}
  for (const c of conversations) {
    convMap[c.userId] = c
  }
  const chatList = users.map((u) => {
    const meta = convMap[u.id] || {}
    return {
      userId: u.id,
      userName: u.full_name || u.name || 'Unknown',
      userAvatar: u.avatar_url || u.avatar || '',
      lastMessage: meta.lastMessage || '',
      lastMessageTime: meta.lastMessageTime || null,
      unreadCount: meta.unreadCount || 0,
      isUser: true,
    }
  })
  const filteredConversations = chatList.filter((conv) =>
    conv.userName?.toLowerCase().includes(search.toLowerCase())
  )

  const sortedGroupMessages = [...notifications].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

  const handleSelectConversation = (conv) => {
    setReplyTo(null)
    setMenu(null)
    nearBottomRef.current = true
    loadConversationMessages(conv.userId)
    setMobileView('chat')
  }

  const handleSelectGroup = () => {
    setReplyTo(null)
    setMenu(null)
    nearBottomRef.current = true
    setActiveConversation('staff-group')
    loadGroupMessages()
    setMobileView('chat')
  }

  const handleBackToList = () => {
    setMobileView('list')
  }

  const handleSend = async (e) => {
    e.preventDefault()
    if (!message.trim() && !mediaPreview) return
    try {
      if (isGroupChat) {
        await sendGroupMessage(message.trim(), replyTo?.id, mediaPreview, mediaPreview ? 'image' : null)
      } else if (activeConversation) {
        await sendMessage(message.trim(), activeConversation, mediaPreview, mediaPreview ? 'image' : null)
      }
      setMessage('')
      setReplyTo(null)
      removeMedia()
    } catch {
      // error shown in context
    }
  }

  const handleReply = (msg) => {
    setReplyTo(msg)
    setMenu(null)
  }

  const cancelReply = () => {
    setReplyTo(null)
  }

  const handleCopy = (msg) => {
    if (msg.message) navigator.clipboard?.writeText(msg.message).catch(() => {})
    setMenu(null)
  }

  const handleForward = (msg) => {
    setMenu(null)
    setForwardTarget({ text: msg.message, mediaUrl: msg.media_url || null })
  }

  const handleEdit = (msg) => {
    setMenu(null)
    setEditing(msg)
    setMessage(msg.message || '')
  }

  const handleDelete = async (msg) => {
    setMenu(null)
    if (!window.confirm('Delete this message for everyone?')) return
    try {
      await api.deleteNotification(msg.id)
      if (isGroupChat) await loadGroupMessages()
      else await loadConversationMessages(activeConversation)
    } catch (err) {
      alert(err.message || 'Could not delete message.')
    }
  }

  const confirmForward = async (userId) => {
    try {
      const target = forwardTarget
      setForwardTarget(null)
      await api.sendNotification(target.text, userId, null, target.mediaUrl, target.mediaUrl ? 'image' : null)
      alert('Message forwarded.')
    } catch (err) {
      alert(err.message || 'Could not forward message.')
    }
  }

  const renderMessage = (msg, isSent, senderName, isGroup) => {
    const isEditing = editing?.id === msg.id
    return (
      <div
        key={msg.id}
        className={`message-row ${isSent ? 'sent' : 'received'}`}
        onContextMenu={(e) => {
          if (!canUseMessageActions) return
          e.preventDefault()
          setMenu({ msg, x: e.clientX, y: e.clientY })
        }}
      >
        {isGroup && (
          <div style={{ marginBottom: '4px', fontSize: '12px', color: '#667781', fontWeight: 600, paddingLeft: isSent ? '0' : '4px', paddingRight: isSent ? '4px' : '0', textAlign: isSent ? 'right' : 'left' }}>
            {senderName}
          </div>
        )}
        <div className="message-bubble" style={isSent ? sentBubbleStyle : receivedBubbleStyle}>
          {msg.parent_id && (
            <div style={{ fontSize: '12px', color: '#667781', marginBottom: '4px', fontStyle: 'italic' }}>
              Reply to previous message
            </div>
          )}
          {msg.media_url && (
            <img src={msg.media_url} alt="Shared media" style={{ maxWidth: '100%', borderRadius: '8px', marginBottom: '8px', display: 'block' }} />
          )}
          {isEditing ? (
            <textarea
              autoFocus
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              style={{ width: '100%', minHeight: '60px', fontSize: '16px', lineHeight: 1.5, border: '1px solid var(--border)', borderRadius: '8px', padding: '8px', resize: 'vertical' }}
            />
          ) : (
            <p style={{ margin: 0, fontSize: '16px', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.message}</p>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
            {canUseMessageActions ? (
              <span style={{ fontSize: '13px', color: '#667781', cursor: 'pointer' }} onClick={() => setMenu({ msg, x: null, y: null })}>⋯</span>
            ) : (
              <span style={{ fontSize: '12px', color: '#9ca3af' }}>No actions</span>
            )}
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className="message-time" style={{ fontSize: '12px', color: '#667781', textAlign: 'right' }}>{formatMessageTime(msg.created_at)}</span>
              {isSent && (
                <span style={{ fontSize: '14px', color: msg.is_read ? 'var(--success)' : 'var(--text-4)' }}>
                  {msg.is_read ? '✓✓' : '✓'}
                </span>
              )}
            </span>
          </div>
          {isEditing && (
            <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
              <button type="button" className="pay-action" onClick={async () => { try { await api.editNotification(msg.id, message.trim()); setEditing(null); setMessage(''); if (isGroup) await loadGroupMessages(); else await loadConversationMessages(activeConversation) } catch (e) { alert(e.message) } }} style={{ padding: '6px 12px', borderRadius: '8px', fontSize: '13px' }}>Save</button>
              <button type="button" className="secondary-action" onClick={() => { setEditing(null); setMessage('') }} style={{ padding: '6px 12px', borderRadius: '8px', fontSize: '13px' }}>Cancel</button>
            </div>
          )}
        </div>
      </div>
    )
  }

  const handleMediaSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      alert('Please select a valid image file.')
      return
    }
    const reader = new FileReader()
    reader.onloadend = () => {
      setMediaPreview(reader.result)
    }
    reader.readAsDataURL(file)
  }

  const removeMedia = () => {
    setMediaPreview('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const formatTime = (dateStr) => {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const formatMessageTime = (dateStr) => {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    return d.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit' })
  }

  const getInitials = (name) => {
    return (name || '?').split(' ').map((n) => n[0]).join('').slice(0, 2)
  }

  const sidebarStyle = {
    width: '320px',
    minWidth: '320px',
  }

  const headerStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  }

  const titleStyle = {
    margin: 0,
    fontSize: '24px',
    color: 'var(--text)',
    fontWeight: 700,
  }

  const searchInputStyle = {
    width: '100%',
    padding: '14px 18px',
    border: '1px solid var(--border)',
    borderRadius: '10px',
    fontSize: '16px',
    outline: 'none',
    background: '#f8fafc',
  }

  const tabBtnStyle = (isActive) => ({
    flex: 1,
    padding: '16px',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    fontWeight: isActive ? 700 : 500,
    fontSize: '16px',
    color: isActive ? 'var(--brand)' : 'var(--text-3)',
    borderBottom: isActive ? '3px solid var(--brand)' : '3px solid transparent',
  })

  const convItemStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '18px 20px',
    cursor: 'pointer',
    borderBottom: '1px solid var(--border)',
    transition: 'background 0.2s ease',
  }

  const avatarStyle = {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    background: '#dfe5e7',
    color: 'var(--text)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 600,
    fontSize: '20px',
    flexShrink: 0,
  }

  const nameStyle = {
    fontWeight: 600,
    color: 'var(--text)',
    fontSize: '18px',
  }

  const metaStyle = {
    fontSize: '13px',
    color: 'var(--text-3)',
    marginTop: '4px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }

  const badgeStyle = {
    background: 'var(--danger)',
    color: '#fff',
    fontSize: '13px',
    fontWeight: 700,
    padding: '4px 10px',
    borderRadius: '9999px',
    flexShrink: 0,
  }

  const emptyStyle = {
    padding: '3rem',
    textAlign: 'center',
    color: 'var(--text-4)',
  }

  const chatHeaderStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 24px',
    background: '#f0f2f5',
    borderBottom: '1px solid var(--border)',
    zIndex: 10,
  }

  const messagesStyle = {
    flex: 1,
    overflowY: 'auto',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    background: '#e5ddd5',
    backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M11 18c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm48 25c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm-43-7c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm63 31c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm34-90c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm63 31c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm-43-7c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm63 31c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM34 90c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm56-76c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm12 65c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM12 86c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm28-65c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm23-11c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-6 60c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm29 22c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-9-21c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM60 91c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM35 41c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM12 60c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2z' fill='%23d1d7db' fill-opacity='0.4' fill-rule='evenodd'/%3E%3C/svg%3E")`,
  }

  const bubbleStyle = {
    maxWidth: '65%',
    padding: '12px 16px',
    borderRadius: '10px',
    position: 'relative',
    boxShadow: '0 1px 1px rgba(0,0,0,0.1)',
    wordWrap: 'break-word',
  }

  const sentBubbleStyle = {
    ...bubbleStyle,
    background: '#d9fdd3',
    borderTopRightRadius: 0,
  }

  const receivedBubbleStyle = {
    ...bubbleStyle,
    background: '#fff',
    borderTopLeftRadius: 0,
  }

  const chatInputFormStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '16px 24px',
    background: '#f0f2f5',
    borderTop: '1px solid var(--border)',
  }

  const chatInputStyle = {
    flex: 1,
    padding: '14px 18px',
    border: '1px solid var(--border)',
    borderRadius: '10px',
    fontSize: '16px',
    outline: 'none',
    background: '#fff',
  }

  const sendBtnStyle = {
    background: 'var(--brand)',
    color: '#fff',
    border: 'none',
    borderRadius: '50%',
    width: '48px',
    height: '48px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'background 0.2s ease',
  }

  return (
    <div className="page notifications-page">

      <div className={`whatsapp-layout${mobileView === 'chat' ? ' mobile-show-chat' : ' mobile-show-sidebar'}`} style={{ height: 'calc(100vh - var(--header-h) - 40px)', maxWidth: '1800px', margin: '20px auto', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.12)' }}>
        {/* Left Sidebar */}
        <div className="whatsapp-sidebar" style={{ ...sidebarStyle, flex: '0 0 auto' }}>
          <div className="whatsapp-sidebar-header" style={{ padding: '24px', borderBottom: '1px solid var(--border)', background: '#fff' }}>
            <div style={headerStyle}>
              <h1 style={titleStyle}>Messages</h1>
              {unreadCount > 0 && (
                <span style={badgeStyle}>{unreadCount}</span>
              )}
            </div>
            <input
              type="text"
              placeholder="Search or start new chat"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="whatsapp-search"
              style={searchInputStyle}
            />
          </div>

          <div className="conversation-list" style={{ flex: 1, overflowY: 'auto' }}>
            {/* Direct Conversations */}
            {filteredConversations.map((conv) => (
              <div
                key={conv.userId}
                className={`conversation-item${activeConversation === conv.userId ? ' active' : ''}`}
                onClick={() => handleSelectConversation(conv)}
                style={convItemStyle}
              >
                <div className="conversation-avatar" style={avatarStyle}>
                  {getInitials(conv.userName)}
                </div>
                <div className="conversation-meta">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className="conversation-name" style={nameStyle}>{conv.userName || 'Unknown'}</div>
                    <div className="conversation-time" style={{ fontSize: '14px', color: 'var(--text-4)' }}>{formatTime(conv.lastMessageTime)}</div>
                  </div>
                  <div style={metaStyle}>
                    {conv.lastMessage || 'No messages yet'}
                  </div>
                </div>
                {Number(conv.unreadCount) > 0 && (
                  <span className="conversation-unread-badge" style={badgeStyle}>{conv.unreadCount}</span>
                )}
              </div>
            ))}

            {/* Staff Group Chat */}
            <div
              className={`conversation-item${isGroupChat ? ' active' : ''}`}
              onClick={handleSelectGroup}
              style={convItemStyle}
            >
              <div className="conversation-avatar" style={{ ...avatarStyle, background: '#e3f2fd', fontSize: '14px', lineHeight: 1.2, letterSpacing: '0.02em' }}>
                chat
              </div>
              <div className="conversation-meta">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="conversation-name" style={nameStyle}>Staff Group</div>
                  <div className="conversation-time" style={{ fontSize: '14px', color: 'var(--text-4)' }}>
                    {sortedGroupMessages.length > 0 ? formatTime(sortedGroupMessages[sortedGroupMessages.length - 1].created_at) : ''}
                  </div>
                </div>
                <div style={metaStyle}>
                  {sortedGroupMessages.length > 0
                    ? `${sortedGroupMessages.length} messages`
                    : 'All staff messages'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Chat Area */}
        <div className="whatsapp-chat" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {!activeConversation ? (
            <div className="whatsapp-empty" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-4)', textAlign: 'center', padding: '60px', background: '#f0f2f5' }}>
              <div style={{ fontSize: '5rem', marginBottom: '1.5rem' }}>💬</div>
              <h2 style={{ fontSize: '28px', marginBottom: '12px', color: 'var(--text)' }}>Staff Group Chat</h2>
              <p style={{ color: 'var(--text-3)', fontSize: '16px', maxWidth: '400px', lineHeight: 1.6 }}>
                Select the Staff Group to see messages from everyone in the team.
              </p>
            </div>
          ) : isGroupChat ? (
            <>
              {/* Group Chat Header */}
              <div className="chat-header" style={chatHeaderStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <button type="button" onClick={handleBackToList} className="chat-mobile-back" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '50%', display: 'none', alignItems: 'center', justifyContent: 'center', color: 'var(--text)' }} title="Back">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
                  </button>
                  <div className="chat-header-avatar" style={{ width: '52px', height: '52px', borderRadius: '50%', background: '#e3f2fd', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: '18px' }}>
                    👥
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: '20px' }}>
                      Staff Group
                    </div>
                    <div style={{ fontSize: '14px', color: 'var(--text-3)' }}>
                      {sortedGroupMessages.length} messages — everyone can see and reply
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  {unreadCount > 0 && (
                    <button type="button" className="secondary-action" onClick={markAllRead} style={{ padding: '10px 18px', fontSize: '14px', borderRadius: '8px' }}>
                      Mark all read
                    </button>
                  )}
                </div>
              </div>

              {/* Group Messages */}
              <div className="chat-messages" ref={chatScrollRef} onScroll={handleScroll} style={messagesStyle}>
                {sortedGroupMessages.length === 0 ? (
                  <div style={{ ...emptyStyle, fontSize: '18px' }}>
                    <div style={{ fontSize: '4rem', marginBottom: '1.5rem' }}>👥</div>
                    <p style={{ fontSize: '16px' }}>No messages in the staff group yet.</p>
                    <p style={{ fontSize: '14px' }}>Be the first to send a message!</p>
                  </div>
                ) : (
                  <>
                    {sortedGroupMessages.map((msg) => renderMessage(msg, msg.sender_id === user?.id, msg.sender_id === user?.id ? 'You' : (msg.sender_name || 'Unknown'), true))}
                {sending && (
                  <div className="message-row sent">
                    <div className="message-bubble" style={{ ...sentBubbleStyle, opacity: 0.7 }}>
                      <p style={{ margin: 0, fontSize: '16px', lineHeight: 1.5 }}>Sending...</p>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
                  </>
                )}
              </div>

              {/* Message Input */}
              <div style={{ borderTop: '1px solid var(--border)', background: '#f0f2f5' }}>
                {mediaPreview && (
                  <div style={{ padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <img src={mediaPreview} alt="Preview" style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border)' }} />
                    <span style={{ fontSize: '14px', color: 'var(--text-3)' }}>Image selected</span>
                    <button type="button" onClick={removeMedia} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '14px' }}>Remove</button>
                  </div>
                )}
                <form className="chat-input-form" onSubmit={handleSend} style={{ ...chatInputFormStyle, padding: '12px 24px' }}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleMediaSelect}
                    style={{ display: 'none' }}
                  />
                  <button type="button" onClick={() => fileInputRef.current?.click()} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: '20px', padding: '0 8px' }} title="Attach image">+</button>
                  <input
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Type a message to the staff group"
                    className="chat-input"
                    style={{ ...chatInputStyle, flex: 1 }}
                  />
                  <button type="submit" className="chat-send-btn" disabled={(!message.trim() && !mediaPreview) || sending} style={sendBtnStyle}>
                    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
                      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" fill="currentColor"/>
                    </svg>
                  </button>
                </form>
              </div>
            </>
          ) : (
            <>
              {/* 1-on-1 Chat Header */}
              <div className="chat-header" style={chatHeaderStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <button type="button" onClick={handleBackToList} className="chat-mobile-back" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '50%', display: 'none', alignItems: 'center', justifyContent: 'center', color: 'var(--text)' }} title="Back">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
                  </button>
                  <div className="chat-header-avatar" style={{ width: '52px', height: '52px', borderRadius: '50%', background: '#dfe5e7', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: '18px' }}>
                    {getInitials(activeChat?.userName)}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: '20px' }}>
                      {activeChat?.userName ? `Chat with ${activeChat.userName}` : 'Select a chat'}
                    </div>
                    <div style={{ fontSize: '14px', color: 'var(--text-3)' }}>
                      {loading ? 'Loading...' : `${messages.length} messages`}
                    </div>
                  </div>
                </div>
              </div>

              {/* 1-on-1 Messages */}
              <div className="chat-messages" ref={chatScrollRef} onScroll={handleScroll} style={messagesStyle}>
                  {messages.map((msg) => renderMessage(msg, msg.sender_id === user?.id, msg.sender_id === user?.id ? 'You' : (msg.sender_name || activeChat?.userName || 'Unknown'), false))}
                {sending && (
                  <div className="message-row sent">
                    <div className="message-bubble" style={{ ...sentBubbleStyle, opacity: 0.7 }}>
                      <p style={{ margin: 0, fontSize: '16px', lineHeight: 1.5 }}>Sending...</p>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* 1-on-1 Message Input */}
              <div style={{ borderTop: '1px solid var(--border)', background: '#f0f2f5' }}>
                {mediaPreview && (
                  <div style={{ padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <img src={mediaPreview} alt="Preview" style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border)' }} />
                    <span style={{ fontSize: '14px', color: 'var(--text-3)' }}>Image selected</span>
                    <button type="button" onClick={removeMedia} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '14px' }}>Remove</button>
                  </div>
                )}
                <form className="chat-input-form" onSubmit={handleSend} style={{ ...chatInputFormStyle, padding: '12px 24px' }}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleMediaSelect}
                    style={{ display: 'none' }}
                  />
                  <button type="button" onClick={() => fileInputRef.current?.click()} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: '20px', padding: '0 8px' }} title="Attach image">+</button>
                  <input
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Type a message"
                    className="chat-input"
                    style={{ ...chatInputStyle, flex: 1 }}
                  />
                  <button type="submit" className="chat-send-btn" disabled={(!message.trim() && !mediaPreview) || sending} style={sendBtnStyle}>
                    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
                      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" fill="currentColor"/>
                    </svg>
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Reply / Editing Toast */}
      {replyTo && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--text)',
          color: '#fff',
          padding: '12px 24px',
          borderRadius: '10px',
          boxShadow: 'var(--shadow-lg)',
          fontSize: '14px',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}>
          <span>{editing ? 'Editing message' : `Replying to: ${replyTo.sender_name || 'Unknown'}`}</span>
          <button type="button" onClick={() => { cancelReply(); setEditing(null); setMessage('') }} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '16px' }}>✕</button>
        </div>
      )}

      {/* Message context menu */}
      {menu && canUseMessageActions && (
        <>
          <div onClick={() => setMenu(null)} style={{ position: 'fixed', inset: 0, zIndex: 2000 }} />
          <div style={{
            position: 'fixed',
            top: menu.y ?? '50%',
            left: menu.x ?? '50%',
            transform: menu.x ? 'translate(-50%, 8px)' : 'translate(-50%, -50%)',
            background: '#fff',
            borderRadius: '12px',
            boxShadow: '0 10px 40px rgba(0,0,0,0.25)',
            zIndex: 2001,
            minWidth: '200px',
            overflow: 'hidden',
            border: '1px solid var(--border)',
          }}>
            {[
              { label: '↩️ Reply', action: () => handleReply(menu.msg) },
              { label: '📋 Copy', action: () => handleCopy(menu.msg) },
              { label: '➡️ Forward', action: () => handleForward(menu.msg) },
              ...(menu.msg.sender_id === user?.id ? [
                { label: '✏️ Edit', action: () => handleEdit(menu.msg) },
                { label: '🗑️ Delete', action: () => handleDelete(menu.msg) },
              ] : []),
            ].map((item) => (
              <button key={item.label} type="button" onClick={item.action}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '15px', color: 'var(--text)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f2f5')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Forward picker */}
      {forwardTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 2100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={() => setForwardTarget(null)}>
          <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '420px', maxHeight: '80vh', overflowY: 'auto', padding: '20px' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0, fontSize: '20px' }}>Forward message to</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
              {users.map((u) => (
                <button key={u.id} type="button" onClick={() => confirmForward(u.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', textAlign: 'left' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#dfe5e7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>{getInitials(u.full_name || u.name)}</div>
                  <span style={{ fontWeight: 600 }}>{u.full_name || u.name || 'Unknown'}</span>
                </button>
              ))}
            </div>
            <button type="button" className="secondary-action" onClick={() => setForwardTarget(null)} style={{ marginTop: '16px', width: '100%', padding: '12px', borderRadius: '10px' }}>Cancel</button>
          </div>
        </div>
      )}

      {error && <div className="error-toast" style={{ position: 'fixed', bottom: '24px', right: '24px', background: 'var(--danger)', color: '#fff', padding: '16px 24px', borderRadius: '10px', boxShadow: 'var(--shadow-lg)', fontSize: '15px', zIndex: 1000 }}>{error}</div>}
    </div>
  )
}