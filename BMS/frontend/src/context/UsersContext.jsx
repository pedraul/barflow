import React from 'react'
import { createContext, useContext, useState, useEffect } from 'react'
import * as api from '../api/endpoints'
import { useAuth } from './AuthContext'

const UsersContext = createContext(null)

export function UsersProvider({ children }) {
  const { user } = useAuth()
  const [users, setUsers] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!user) return
    let active = true
    api.fetchUsers()
      .then((data) => { if (active) { setUsers(data); setError(null) } })
      .catch((err) => { if (active) { setError(err.message); setUsers([]) } })
      .finally(() => { if (active) setLoaded(true) })
    return () => { active = false }
  }, [user])

  const addUser = async (user) => {
    const created = await api.createUser(user)
    const full = { ...user, id: created.id }
    setUsers((current) => [full, ...current])
    return full
  }
  const updateUser = async (id, changes) => {
    const updated = await api.updateUser(id, changes)
    setUsers((current) => current.map((user) => (user.id === id ? updated : user)))
    return updated
  }
  const removeUser = async (id) => {
    await api.deleteUser(id)
    setUsers((current) => current.filter((user) => user.id !== id))
  }

  return (
    <UsersContext.Provider value={{ users, addUser, updateUser, removeUser, loaded, error }}>
      {children}
    </UsersContext.Provider>
  )
}

export function useUsers() {
  const context = useContext(UsersContext)
  if (!context) throw new Error('useUsers must be used within UsersProvider')
  return context
}
