import { useEffect, useState } from 'react'
import { fetchMyGrants } from '../api/endpoints'
import { useAuth } from '../context/AuthContext'

// Cached per user so every layout/page shares one request.
let cache = { userId: null, promise: null }

export function invalidateMyGrants() {
  cache = { userId: null, promise: null }
}

/** Returns a Set of the current user's owner-granted permissions. */
export default function useMyGrants() {
  const { user } = useAuth()
  const [grants, setGrants] = useState(() => new Set())
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!user?.id) return undefined
    let alive = true
    if (cache.userId !== user.id || !cache.promise) {
      cache = { userId: user.id, promise: fetchMyGrants().catch(() => ({ permissions: [] })) }
    }
    cache.promise.then((data) => {
      if (!alive) return
      setGrants(new Set(data?.permissions || []))
      setLoaded(true)
    })
    return () => { alive = false }
  }, [user?.id])

  return { grants, loaded, has: (key) => grants.has(key) }
}
