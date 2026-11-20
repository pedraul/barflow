import { useEffect, useState } from 'react'
import { fetchMyGrants } from '../api/endpoints'
import { useAuth } from '../context/AuthContext'

// One shared store for every layout/page, so grants are fetched once per
// refresh — and refreshed while the app is open, so access the owner grants
// or revokes shows up without the worker having to log out and back in.
const REFRESH_MS = 30000

const store = {
  userId: null,
  grants: new Set(),
  loaded: false,
  inflight: null,
  listeners: new Set(),
  timer: null,
}

function emit() {
  store.listeners.forEach((listener) => listener())
}

function sameSet(a, b) {
  if (a.size !== b.size) return false
  for (const value of a) if (!b.has(value)) return false
  return true
}

function refresh() {
  if (!store.userId) return Promise.resolve()
  if (store.inflight) return store.inflight
  const userId = store.userId
  store.inflight = fetchMyGrants()
    .then((data) => {
      if (store.userId !== userId) return
      const next = new Set(data?.permissions || [])
      const changed = !store.loaded || !sameSet(next, store.grants)
      store.grants = next
      store.loaded = true
      if (changed) emit()
    })
    .catch(() => {
      // Keep the last known grants on network errors.
      if (store.userId === userId && !store.loaded) {
        store.loaded = true
        emit()
      }
    })
    .finally(() => { store.inflight = null })
  return store.inflight
}

function onWake() {
  if (document.visibilityState === 'visible') refresh()
}

function start() {
  if (store.timer) return
  store.timer = window.setInterval(refresh, REFRESH_MS)
  window.addEventListener('focus', onWake)
  document.addEventListener('visibilitychange', onWake)
}

function stop() {
  window.clearInterval(store.timer)
  store.timer = null
  window.removeEventListener('focus', onWake)
  document.removeEventListener('visibilitychange', onWake)
}

function setUser(userId) {
  if (store.userId === userId) return
  store.userId = userId
  store.grants = new Set()
  store.loaded = false
  store.inflight = null
}

/** Forget cached grants (e.g. on logout) and refetch on next use. */
export function invalidateMyGrants() {
  store.loaded = false
  refresh()
}

/** Returns the current user's owner-granted permissions, kept up to date. */
export default function useMyGrants() {
  const { user } = useAuth()
  const [, setVersion] = useState(0)

  useEffect(() => {
    if (!user?.id) return undefined
    setUser(user.id)
    const listener = () => setVersion((v) => v + 1)
    store.listeners.add(listener)
    start()
    if (!store.loaded) refresh()
    else listener()
    return () => {
      store.listeners.delete(listener)
      if (store.listeners.size === 0) stop()
    }
  }, [user?.id])

  const active = Boolean(user?.id) && store.userId === user.id
  const grants = active ? store.grants : new Set()
  return { grants, loaded: active && store.loaded, has: (key) => grants.has(key) }
}
