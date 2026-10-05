import React, { createContext, useContext, useState, useEffect } from 'react'
import * as api from '../api/endpoints'
import { useAuth } from './AuthContext'

const OrdersContext = createContext(null)

export function OrdersProvider({ children }) {
  const { user } = useAuth()
  const [orders, setOrders] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  const loadOrders = async () => {
    try {
      const data = await api.fetchOrders()
      setOrders(data)
      setError(null)
    } catch (err) {
      setError(err.message)
      setOrders([])
    }
  }

  useEffect(() => {
    if (!user) return
    let active = true
    api.fetchOrders()
      .then((data) => { if (active) { setOrders(data); setError(null) } })
      .catch((err) => { if (active) { setError(err.message); setOrders([]) } })
      .finally(() => { if (active) setLoaded(true) })
    return () => { active = false }
  }, [user])

  const refreshOrders = async () => {
    setRefreshing(true)
    await loadOrders()
    setRefreshing(false)
  }

  const addOrder = async (order) => {
    const created = await api.createOrder(order)
    const full = { ...order, id: created.id }
    setOrders((current) => [full, ...current])
    return full
  }

  // Local-only record (no backend write) used to summarise a waiter's
  // handled orders on the dashboard.
  const trackOrder = (order) => {
    setOrders((current) => [order, ...current.filter((o) => o.id !== order.id)])
  }

  const updateOrder = async (id, changes) => {
    const updated = await api.updateOrderStatus(id, changes.status)
    setOrders((current) =>
      current.map((order) =>
        order.id === id
          ? { ...order, ...changes, status: updated.status }
          : order
      )
    )
    return updated
  }

  const removeOrder = async (id) => {
    await api.deleteOrder(id)
    setOrders((current) => current.filter((order) => order.id !== id))
  }

  return (
      <OrdersContext.Provider
        value={{
          orders,
          addOrder,
          trackOrder,
          updateOrder,
          removeOrder,
          refreshOrders,
          refreshing,
          loaded,
          error
        }}
      >
      {children}
    </OrdersContext.Provider>
  )
}

export function useOrders() {
  const context = useContext(OrdersContext)
  if (!context) {
    throw new Error(
      'useOrders must be used within OrdersProvider'
    )
  }
  return context
}