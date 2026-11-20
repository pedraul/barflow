import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, Clock, Play, Square, X } from 'lucide-react'
import * as api from '../api/endpoints'
import { useAuth } from '../context/AuthContext'
import { usePreferences } from '../context/PreferencesContext'

export function formatDuration(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0))
  const h = Math.floor(m / 60)
  return h ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`
}

const minutesSince = (iso) => (Date.now() - new Date(iso).getTime()) / 60000

/** Centered modal rendered on <body> so it escapes top-bar stacking contexts. */
function ShiftModal({ onClose, children, labelledBy }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="w-full max-w-md rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}

/**
 * Start / end shift button for floor staff (waiter, kitchen, bar, operator).
 * `compact` hides the label text (used in the mobile top bar).
 */
export default function ShiftControl({ compact = false, floating = false }) {
  const { user } = useAuth()
  const { t } = usePreferences()
  const [shift, setShift] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [, setTick] = useState(0)
  // null | 'confirm' | 'summary' | 'error'
  const [dialog, setDialog] = useState(null)
  const [note, setNote] = useState('')
  const [dialogError, setDialogError] = useState('')
  const [summary, setSummary] = useState(null)
  const noteRef = useRef(null)

  const role = String(user?.role || '').toLowerCase()
  // Shifts are only tracked for floor staff; owners, managers, accountants and admins don't clock in.
  const enabled = Boolean(user) && !['owner', 'manager', 'accountant', 'platform_admin', 'super_admin'].includes(role)

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

  useEffect(() => {
    if (dialog === 'confirm') noteRef.current?.focus()
  }, [dialog])

  const closeDialog = useCallback(() => {
    if (!busy) setDialog(null)
  }, [busy])

  if (!enabled || !loaded) return null

  const handleStart = async () => {
    setBusy(true)
    try {
      setShift(await api.startShift())
    } catch (err) {
      setDialogError(t(err.message))
      setDialog('error')
      refresh()
    } finally {
      setBusy(false)
    }
  }

  const openEnd = () => {
    setNote('')
    setDialogError('')
    setDialog('confirm')
  }

  const confirmEnd = async (e) => {
    e.preventDefault()
    setBusy(true)
    setDialogError('')
    try {
      const ended = await api.endShift(note.trim())
      setShift(null)
      setSummary(ended)
      setDialog('summary')
    } catch (err) {
      setDialogError(t(err.message))
      refresh()
    } finally {
      setBusy(false)
    }
  }

  const wrapperStyle = floating
    ? { position: 'fixed', right: 16, bottom: 16, zIndex: 50, boxShadow: '0 4px 14px rgba(0,0,0,0.15)', borderRadius: 999 }
    : undefined

  const header = (id, title) => (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
      <h2 id={id} className="text-base font-semibold text-slate-900">{title}</h2>
      <button
        type="button"
        onClick={closeDialog}
        disabled={busy}
        aria-label={t('Close')}
        className="-mr-1 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
      >
        <X size={18} />
      </button>
    </div>
  )

  const modals = (
    <>
      {dialog === 'confirm' && (
        <ShiftModal onClose={closeDialog} labelledBy="end-shift-title">
          {header('end-shift-title', t('End your shift?'))}
          <form onSubmit={confirmEnd} className="space-y-4 px-5 py-4">
            <p className="text-sm text-slate-600">
              {t('You have been on shift for')}{' '}
              <span className="font-semibold text-slate-900">{shift ? formatDuration(minutesSince(shift.startedAt)) : ''}</span>.
            </p>
            <div>
              <label htmlFor="shift-handover-note" className="mb-1.5 block text-sm font-medium text-slate-700">
                {t('Handover note')} <span className="font-normal text-slate-400">({t('optional')})</span>
              </label>
              <textarea
                id="shift-handover-note"
                ref={noteRef}
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t('Anything the next shift should know…')}
                className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
            {dialogError && (
              <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">{dialogError}</div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={closeDialog}
                disabled={busy}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                {t('Cancel')}
              </button>
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
              >
                <Square size={13} />
                {busy ? t('Ending...') : t('End shift')}
              </button>
            </div>
          </form>
        </ShiftModal>
      )}

      {dialog === 'summary' && summary && (
        <ShiftModal onClose={closeDialog} labelledBy="shift-summary-title">
          <div className="px-5 pb-2 pt-6 text-center">
            <CheckCircle2 size={40} className="mx-auto text-emerald-500" />
            <h2 id="shift-summary-title" className="mt-3 text-lg font-semibold text-slate-900">{t('Shift ended')}</h2>
            <p className="mt-1 text-sm text-slate-500">{t('Total time')}: {formatDuration(summary.durationMinutes)}</p>
          </div>
          <dl className="mx-5 my-4 divide-y divide-slate-100 rounded-xl border border-slate-100 bg-slate-50 text-sm">
            <div className="flex justify-between px-4 py-2.5">
              <dt className="text-slate-600">{t('Orders taken')}</dt>
              <dd className="font-semibold text-slate-900">{summary.ordersCount ?? 0}</dd>
            </div>
            {Boolean(summary.ordersPrepared) && (
              <div className="flex justify-between px-4 py-2.5">
                <dt className="text-slate-600">{t('Orders prepared')}</dt>
                <dd className="font-semibold text-slate-900">{summary.ordersPrepared}</dd>
              </div>
            )}
            <div className="flex justify-between px-4 py-2.5">
              <dt className="text-slate-600">{t('Actions recorded')}</dt>
              <dd className="font-semibold text-slate-900">{summary.activityCount ?? 0}</dd>
            </div>
          </dl>
          <div className="flex justify-end border-t border-slate-100 px-5 py-4">
            <button
              type="button"
              onClick={closeDialog}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              {t('Done')}
            </button>
          </div>
        </ShiftModal>
      )}

      {dialog === 'error' && (
        <ShiftModal onClose={closeDialog} labelledBy="shift-error-title">
          {header('shift-error-title', t('Something went wrong'))}
          <p className="px-5 py-4 text-sm text-slate-700">{dialogError}</p>
          <div className="flex justify-end border-t border-slate-100 px-5 py-4">
            <button
              type="button"
              onClick={closeDialog}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              {t('OK')}
            </button>
          </div>
        </ShiftModal>
      )}
    </>
  )

  if (!shift) {
    return (
      <div style={wrapperStyle}>
        <button
          type="button"
          onClick={handleStart}
          disabled={busy}
          title={t('Start shift')}
          className="shift-btn-start inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          <Play size={14} fill="currentColor" />
          {!compact && <span className="shift-label">{busy ? t('Starting...') : t('Start shift')}</span>}
        </button>
        {modals}
      </div>
    )
  }

  return (
    <div style={wrapperStyle} className="shift-pill inline-flex items-center gap-1 rounded-full bg-emerald-50 py-1 pl-3 pr-1 text-xs font-semibold text-emerald-800">
      <span className="shift-live-dot" aria-hidden="true" />
      <Clock size={14} className="shift-clock-icon" />
      <span className="shift-timer" title={`${t('On shift since')} ${new Date(shift.startedAt).toLocaleTimeString()}`}>
        {!compact && <span className="shift-label shift-label-prefix">{t('On shift')} · </span>}{formatDuration(minutesSince(shift.startedAt))}
      </span>
      <button
        type="button"
        onClick={openEnd}
        disabled={busy}
        title={t('End shift')}
        className="shift-btn-end ml-1 inline-flex items-center gap-1 rounded-full bg-rose-600 px-2.5 py-1 text-white hover:bg-rose-700 disabled:opacity-60"
      >
        <Square size={11} fill="currentColor" />
        {!compact && (
          <span className="shift-label">
            {busy ? t('Ending...') : <><span className="shift-label-full">{t('End shift')}</span><span className="shift-label-short">{t('End')}</span></>}
          </span>
        )}
      </button>
      {modals}
    </div>
  )
}
