import React from 'react'
import { createContext, useContext, useState, useEffect } from 'react'
import * as api from '../api/endpoints'
import { useAuth } from './AuthContext'

const AuditLogContext = createContext(null)

export function AuditLogProvider({ children }) {
  const { user } = useAuth()
  const [entries, setEntries] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!user) return
    let active = true
    api.fetchAuditLogs()
      .then((data) => { if (active) { setEntries(data); setError(null) } })
      .catch((err) => { if (active) { setError(err.message); setEntries([]) } })
      .finally(() => { if (active) setLoaded(true) })
    return () => { active = false }
  }, [user])

  const log = async ({ actor, action, type = 'activity' }) => {
    const created = await api.createAuditLog({ actor, action, type })
    setEntries((current) => [{ id: created.id, actor, action, type, time: new Date().toLocaleString() }, ...current])
  }

  return (
    <AuditLogContext.Provider value={{ entries, log, loaded, error }}>
      {children}
    </AuditLogContext.Provider>
  )
}

export function useAuditLog() {
  const context = useContext(AuditLogContext)
  if (!context) throw new Error('useAuditLog must be used within AuditLogProvider')
  return context
}
