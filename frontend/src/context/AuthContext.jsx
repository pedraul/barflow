import React from 'react'
import { createContext, useContext, useState, useEffect } from 'react'

import { logoutUser } from '../api/endpoints'
import api from '../api/axios'
import { clearAccountantBranch } from '../utils/accountantBranch'

const AuthContext = createContext(null)

function getHandoffUser() {
  if (typeof window === 'undefined' || !window.location.hash.startsWith('#auth=')) return null
  try {
    const token = decodeURIComponent(window.location.hash.slice(6))
    const payloadPart = token.split('.')[0]
    const base64Payload = payloadPart.replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(base64Payload.padEnd(base64Payload.length + (4 - base64Payload.length % 4) % 4, '=')))
    window.history.replaceState({}, document.title, window.location.pathname + window.location.search)
    return { token, user: payload }
  } catch {
    return null
  }
}

const handoff = getHandoffUser()

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    if (handoff?.user) return handoff.user
    try {
      const stored = localStorage.getItem('auth_user')
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  })
  const [token, setToken] = useState(() => handoff?.token || localStorage.getItem('auth_token'))
  const [permissions, setPermissions] = useState(() => {
    try {
      const stored = localStorage.getItem('auth_permissions')
      return stored ? JSON.parse(stored) : {}
    } catch {
      return {}
    }
  })

  useEffect(() => {
    if (user) {
      localStorage.setItem('auth_user', JSON.stringify(user))
    } else {
      localStorage.removeItem('auth_user')
    }
  }, [user])

  useEffect(() => {
    if (token) {
      localStorage.setItem('auth_token', token)
    } else {
      localStorage.removeItem('auth_token')
    }
  }, [token])

  useEffect(() => {
    localStorage.setItem('auth_permissions', JSON.stringify(permissions))
  }, [permissions])

  useEffect(() => {
    if (!token) return

    fetchPermissions()

    const refreshPermissions = () => {
      fetchPermissions().catch(() => {})
    }

    window.addEventListener('focus', refreshPermissions)
    const interval = window.setInterval(refreshPermissions, 60000)

    return () => {
      window.removeEventListener('focus', refreshPermissions)
      window.clearInterval(interval)
    }
  }, [token])

  const fetchPermissions = async () => {
    if (!token) return
    try {
      const res = await api.get('/auth/permissions')
      setPermissions(res.data)
    } catch (e) {
      console.error('Failed to fetch permissions:', e)
    }
  }

  const login = ({ token: authToken, user: userProfile }) => {
    clearAccountantBranch()
    const role = String(userProfile?.role || '').toLowerCase()
    if (!['platform_admin', 'super_admin'].includes(role)) {
      const branchId = role === 'owner' ? 'all' : userProfile?.branchId
      if (!branchId) {
        throw new Error('Your account is not assigned to a branch. Contact your business owner.')
      }
      localStorage.setItem('barflow.activeBranchId', branchId)
      window.dispatchEvent(new CustomEvent('barflow-branch-changed', { detail: branchId }))
    }
    localStorage.setItem('auth_token', authToken)
    localStorage.setItem('auth_user', JSON.stringify(userProfile))
    setToken(authToken)
    setUser(userProfile)
  }
  const logout = async () => {
    try {
      await logoutUser()
    } catch (e) {
      console.error('Logout failed:', e)
    } finally {
      setToken(null)
      setUser(null)
      setPermissions({})
      clearAccountantBranch()
    }
  }
  const updateUser = (changes) => {
    setUser((prev) => (prev ? { ...prev, ...changes } : prev))
  }

  return (
    <AuthContext.Provider value={{ user, token, permissions, login, logout, updateUser, fetchPermissions, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
