import React, { createContext, useContext, useState, useEffect } from 'react'
import * as api from '../api/endpoints'
import { useAuth } from './AuthContext'

const SubscriptionContext = createContext(null)

export function SubscriptionProvider({ children }) {
  const { user } = useAuth()
  const [status, setStatus] = useState('active')
  const [realStatus, setRealStatus] = useState(null)
  const [businessVerified, setBusinessVerified] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!user) {
      setRealStatus(null)
      setBusinessVerified(false)
      setLoaded(false)
      setError(null)
      return undefined
    }
    let active = true
    setLoaded(false)
    api.fetchSubscription()
      .then((data) => {
        if (active) {
          setRealStatus(data.status || 'active')
          setBusinessVerified(data.businessVerified === true)
          setError(null)
        }
      })
      .catch((err) => { if (active) { setError(err.message) } })
      .finally(() => { if (active) setLoaded(true) })
    return () => { active = false }
  }, [user])

  const updateStatus = async (nextStatus) => {
    const data = await api.updateSubscription(nextStatus)
    setRealStatus(data.status)
    return data.status
  }

  return (
    <SubscriptionContext.Provider
      value={{
        status,
        realStatus,
        businessVerified,
        updateStatus,
        loaded,
        error,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  )
}

export function useSubscription() {
  const context = useContext(SubscriptionContext)
  if (!context) {
    throw new Error(
      'useSubscription must be used within SubscriptionProvider'
    )
  }
  return context
}
