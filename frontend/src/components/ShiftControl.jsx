import React, { useCallback, useEffect, useState } from 'react'
import { Clock, Play, Square } from 'lucide-react'
import * as api from '../api/endpoints'
import { useAuth } from '../context/AuthContext'
import { usePreferences } from '../context/PreferencesContext'

export function formatDuration(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0))
  const h = Math.floor(m / 60)
  return h ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`
}

const minutesSince = (iso) => (Date.now() - new Date(iso).getTime()) / 60000

/**
 * Start / end shift button for every staff role except Owner.
 * `compact` hides the label text (used in the mobile top bar).
 */
export default function ShiftControl({ compact = false, floating = false }) {
  const { user } = useAuth()
  const { t } = usePreferences()
  const [shift, setShift] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [, setTick] = useState(0)

  const role = String(user?.role || '').toLowerCase()
  const enabled = Boolean(user) && role !== 'owner' && !['platform_admin', 'super_admin'].includes(role)

  const refresh = useCallback(async () => {
    try {
      setShift(await api.fetchCurrentShift())
    } catch {
      // Leave the last known state; the control is non-critical.
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return undefined
    refresh()
    const poll = setInterval(refresh, 60000)
    const tick = setInterval(() => setTick((n) => n + 1), 30000)
    return () => { clearInterval(poll); clearInterval(tick) }
  }, [enabled, refresh])

  if (!enabled || !loaded) return null

  const handleStart = async () => {
    setBusy(true)
    try {
      setShift(await api.startShift())
    } catch (err) {
      alert(t(err.message))
      refresh()
    } finally {
      setBusy(false)
    }
  }

  const handleEnd = async () => {
    const note = window.prompt(t('End your shift? Add an optional handover note:'), '')
    if (note === null) return
    setBusy(true)
    try {
      const ended = await api.endShift(note)
      setShift(null)
      const lines = [
        `${t('Shift ended')} — ${formatDuration(ended.durationMinutes)}`,
        `${t('Orders taken')}: ${ended.ordersCount}`,
      ]
      if (ended.ordersPrepared) lines.push(`${t('Orders prepared')}: ${ended.ordersPrepared}`)
      lines.push(`${t('Actions recorded')}: ${ended.activityCount}`)
      alert(lines.join('\n'))
    } catch (err) {
      alert(t(err.message))
      refresh()
    } finally {
      setBusy(false)
    }
  }

  const wrapperStyle = floating
    ? { position: 'fixed', right: 16, bottom: 16, zIndex: 50, boxShadow: '0 4px 14px rgba(0,0,0,0.15)', borderRadius: 999 }
    : undefined

  if (!shift) {
    return (
      <div style={wrapperStyle}>
        <button
          type="button"
          onClick={handleStart}
          disabled={busy}
          title={t('Start shift')}
          className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          <Play size={14} />
          {!compact && <span className="shift-label">{busy ? t('Starting...') : t('Start shift')}</span>}
        </button>
      </div>
    )
  }

  return (
    <div style={wrapperStyle} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 py-1 pl-3 pr-1 text-xs font-semibold text-emerald-800">
      <Clock size={14} />
      <span title={`${t('On shift since')} ${new Date(shift.startedAt).toLocaleTimeString()}`}>
        {!compact && <span className="shift-label">{t('On shift')} · </span>}{formatDuration(minutesSince(shift.startedAt))}
      </span>
      <button
        type="button"
        onClick={handleEnd}
        disabled={busy}
        title={t('End shift')}
        className="ml-1 inline-flex items-center gap-1 rounded-full bg-rose-600 px-2.5 py-1 text-white hover:bg-rose-700 disabled:opacity-60"
      >
        <Square size={12} />
        {!compact && <span className="shift-label">{busy ? t('Ending...') : t('End shift')}</span>}
      </button>
    </div>
  )
}
