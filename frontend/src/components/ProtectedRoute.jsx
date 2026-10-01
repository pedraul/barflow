import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useSubscription } from '../context/SubscriptionContext'

const EXCLUDED_SUBSCRIPTION_PATHS = [
  '/owner/renew',
  '/subscription-expired',
  '/owner/subscription',
]

export default function ProtectedRoute({ children, allow = [], checkSubscription = false, permission = null }) {
  const { user, permissions } = useAuth()
  const { realStatus, loaded, error } = useSubscription()
  const location = useLocation()

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (allow.length && !allow.map((a) => a.toLowerCase()).includes(user.role.toLowerCase())) {
    return <Navigate to={`/dashboard/${user.role.toLowerCase()}`} replace />
  }

  if (permission) {
    const hasPermission = user.role?.toLowerCase() === 'owner' || !!permissions?.[permission]
    if (!hasPermission) {
      return <Navigate to={`/dashboard/${user.role.toLowerCase()}`} replace />
    }
  }

  if (checkSubscription) {
    const isExcluded = EXCLUDED_SUBSCRIPTION_PATHS.includes(location.pathname)
    if (!isExcluded) {
      if (user.subscriptionExpired === true && user.unpaidAccessGranted !== true) {
        return <Navigate to={user.role.toLowerCase() === 'owner' ? '/owner/subscription' : '/subscription-expired'} replace />
      }
      if (loaded && !error && realStatus !== 'active' && user.unpaidAccessGranted !== true) {
        return <Navigate to={user.role.toLowerCase() === 'owner' ? '/owner/subscription' : '/subscription-expired'} replace />
      }
    }
  }

  return children
}
