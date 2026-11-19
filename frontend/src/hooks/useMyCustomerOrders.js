import { useCallback, useEffect, useState } from 'react'
import { fetchMyCustomerOrders } from '../api/endpoints'
import { getTrackedOrderIds, untrackCustomerOrders } from '../utils/customerOrderTracker'

/**
 * Live status of the unpaid orders this device placed for `businessId`.
 * Paid / cancelled orders are dropped from the device automatically.
 */
export default function useMyCustomerOrders(businessId, { pollMs = 5000 } = {}) {
  const [orders, setOrders] = useState([])
  const [loaded, setLoaded] = useState(false)

  const refresh = useCallback(async () => {
    const ids = getTrackedOrderIds(businessId)
    if (!businessId || !ids.length) {
      setOrders([])
      setLoaded(true)
      return []
    }
    try {
      const { active = [], closed = [] } = await fetchMyCustomerOrders(ids, businessId)
      untrackCustomerOrders(closed)
      setOrders(active)
      return active
    } catch {
      return null // keep last known list on network errors
    } finally {
      setLoaded(true)
    }
  }, [businessId])

  useEffect(() => {
    setLoaded(false)
    refresh()
    if (!pollMs) return undefined
    const interval = window.setInterval(refresh, pollMs)
    return () => window.clearInterval(interval)
  }, [refresh, pollMs])

  return { orders, loaded, refresh }
}
