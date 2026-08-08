import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import * as api from '../api/endpoints'
import { useAuth } from './AuthContext'

const NotificationContext = createContext(null)

export function NotificationProvider({ children }) {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [conversations, setConversations] = useState([])
  const [activeConversation, setActiveConversation] = useState(null)
  const [messages, setMessages] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)

  const loadNotifications = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.fetchNotifications()
      setNotifications(data || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadGroupMessages = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.fetchGroupMessages()
      setNotifications(data || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadConversations = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.fetchConversations()
      setConversations(data || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadUnreadCount = useCallback(async () => {
    try {
      const count = await api.fetchUnreadNotificationCount()
      setUnreadCount(count)
    } catch {
      // silent
    }
  }, [])

  const loadConversationMessages = useCallback(async (userId) => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.fetchConversationMessages(userId)
      setMessages(data || [])
      setActiveConversation(userId)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  // Poll the active conversation so sent/received messages appear without
  // manually re-opening the chat.
  useEffect(() => {
    if (!activeConversation || activeConversation === 'staff-group') return
    const interval = setInterval(async () => {
      try {
        const data = await api.fetchConversationMessages(activeConversation)
        setMessages(data || [])
      } catch {
        // silent: keep last known messages
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [activeConversation])

  const sendMessage = useCallback(async (message, receiverId, mediaUrl, mediaType) => {
    setSending(true)
    setError(null)
    try {
      const result = await api.sendNotification(message, receiverId, null, mediaUrl, mediaType)
      setMessages((current) => [...current, result])
      await loadConversations()
      await loadUnreadCount()
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setSending(false)
    }
  }, [loadConversations, loadUnreadCount])

  const sendGroupMessage = useCallback(async (message, parentId = null, mediaUrl, mediaType) => {
    setSending(true)
    setError(null)
    try {
      const result = await api.sendNotification(message, null, parentId, mediaUrl, mediaType)
      setNotifications((current) => [...current, result])
      await loadUnreadCount()
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setSending(false)
    }
  }, [loadUnreadCount])

  const sendBroadcast = useCallback(async (message, mediaUrl, mediaType) => {
    setSending(true)
    setError(null)
    try {
      const result = await api.sendNotification(message, null, null, mediaUrl, mediaType)
      setNotifications((current) => [result, ...current])
      await loadUnreadCount()
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setSending(false)
    }
  }, [loadUnreadCount])

  const markAllRead = useCallback(async () => {
    try {
      await api.markAllNotificationsRead()
      setNotifications((current) => current.map((n) => ({ ...n, is_read: true })))
      setUnreadCount(0)
    } catch {
      // silent
    }
  }, [])

  useEffect(() => {
    if (!user) return
    loadGroupMessages()
    loadConversations()
    loadUnreadCount()

    const interval = setInterval(() => {
      loadGroupMessages()
      loadConversations()
      loadUnreadCount()
    }, 5000)
    return () => clearInterval(interval)
  }, [loadGroupMessages, loadConversations, loadUnreadCount, user])

  return (
    <NotificationContext.Provider value={{
      notifications,
      conversations,
      activeConversation,
      messages,
      unreadCount,
      loading,
      sending,
      error,
      loadNotifications,
      loadGroupMessages,
      loadConversations,
      loadConversationMessages,
      sendMessage,
      sendGroupMessage,
      sendBroadcast,
      markAllRead,
      setActiveConversation,
    }}>
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  const context = useContext(NotificationContext)
  if (!context) throw new Error('useNotifications must be used within NotificationProvider')
  return context
}
