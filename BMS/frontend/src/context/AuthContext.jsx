import React from 'react'
import { createContext, useContext, useState, useEffect } from 'react'

import { logoutUser } from '../api/endpoints'
import api from '../api/axios'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('auth_user')
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  })
  const [token, setToken] = useState(() => localStorage.getItem('auth_token'))
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
