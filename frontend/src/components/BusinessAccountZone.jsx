import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PauseCircle, PlayCircle, Trash2, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { usePreferences } from '../context/PreferencesContext'
import {
  fetchOwnerBusinessStatus, pauseOwnerBusiness, reactivateOwnerBusiness, deleteOwnerBusiness,
} from '../api/endpoints'

const apiError = (err, fallback) => err?.response?.data?.error || err?.message || fallback

/** Owner-only: business status, pause / reactivate and permanent deletion. */
export default function BusinessAccountZone() {
  const { t } = usePreferences()
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [status, setStatus] = useState(null)
  const [mode, setMode] = useState(null) // 'pause' | 'delete'
  const [password, setPassword] = useState('')
  const [reason, setReason] = useState('')
  const [confirmName, setConfirmName] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)

  const load = () => fetchOwnerBusinessStatus().then(setStatus).catch(() => setStatus(null))
  useEffect(() => { load() }, [])

  const reset = (next = null) => { setMode(next); setPassword(''); setReason(''); setConfirmName(''); setMessage(null) }

  const pause = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await pauseOwnerBusiness(password, reason.trim())
      reset()
      setMessage({ tone: 'success', text: t('Your business is paused. Staff can no longer sign in until you reactivate it.') })
      load()
    } catch (err) {
      setMessage({ tone: 'error', text: apiError(err, t('Could not pause the business.')) })
    } finally {
      setBusy(false)
    }
  }

  const reactivate = async () => {
    setBusy(true)
    try {
      await reactivateOwnerBusiness()
      setMessage({ tone: 'success', text: t('Your business is active again. Staff can sign in.') })
      load()
    } catch (err) {
      setMessage({ tone: 'error', text: apiError(err, t('Could not reactivate the business.')) })
    } finally {
      setBusy(false)
    }
  }

  const remove = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await deleteOwnerBusiness(password, confirmName.trim())
      try { sessionStorage.setItem('barflow.loginNotice', t('Your business and all its data were deleted.')) } catch { /* ignore */ }
      await logout().catch(() => {})
      navigate('/login', { replace: true })
    } catch (err) {
      setMessage({ tone: 'error', text: apiError(err, t('Could not delete the business.')) })
      setBusy(false)
    }
  }

  if (!status) return null
  const paused = status.state === 'deactivated' && status.deactivatedBy === 'owner'
  const inputClass = 'w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10'

  return (
    <section className="border-t border-slate-100 p-8 space-y-5" aria-labelledby="business-account-zone">
      <div className="space-y-1">
        <h2 id="business-account-zone" className="text-lg font-bold text-[#0F172A] tracking-tight">{t('BUSINESS STATUS')}</h2>
        <p className="text-xs text-slate-500">{t('Pause your business for a while, or delete it permanently.')}</p>
      </div>

      <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${paused ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>
        {paused ? <PauseCircle size={20} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={20} className="mt-0.5 shrink-0" />}
        <div>
          <p className="font-semibold">{paused ? t('Paused') : t('Active')}</p>
          <p className="text-xs opacity-80">
            {paused
              ? `${t('Staff cannot sign in. You can still sign in and reactivate it.')}${status.reason ? ` ${t('Reason')}: ${status.reason}` : ''}`
              : t('Your staff can sign in and work normally.')}
          </p>
        </div>
      </div>

      {message && (
        <p role={message.tone === 'error' ? 'alert' : 'status'} className={`rounded-lg px-4 py-2.5 text-sm ${message.tone === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`}>
          {message.text}
        </p>
      )}

      {!mode && (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3">
            <div className="min-w-0 flex-1 basis-64">
              <p className="text-sm font-semibold text-slate-900">{paused ? t('Reactivate business') : t('Pause business')}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {paused
                  ? t('Let your staff sign in again.')
                  : t('For example during renovation or a seasonal closure. Staff cannot sign in; your data is kept.')}
              </p>
            </div>
            {paused ? (
              <button type="button" disabled={busy} onClick={reactivate} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                <PlayCircle size={16} /> {busy ? t('Saving...') : t('Reactivate')}
              </button>
            ) : (
              <button type="button" onClick={() => reset('pause')} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50">
                <PauseCircle size={16} /> {t('Pause')}
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50/40 px-4 py-3">
            <div className="min-w-0 flex-1 basis-64">
              <p className="text-sm font-semibold text-red-700">{t('Delete business')}</p>
              <p className="text-xs text-slate-600 mt-0.5">{t('Permanently removes the business, all branches, staff accounts, orders, payments and reports. This cannot be undone.')}</p>
            </div>
            <button type="button" onClick={() => reset('delete')} className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50">
              <Trash2 size={16} /> {t('Delete')}
            </button>
          </div>
        </div>
      )}

      {mode === 'pause' && (
        <form onSubmit={pause} className="space-y-4 rounded-xl border border-slate-200 p-5 max-w-lg">
          <p className="text-sm font-semibold text-slate-900">{t('Pause business')}</p>
          <label className="block space-y-1.5">
            <span className="text-xs font-bold text-slate-800">{t('Reason (optional)')}</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder={t('e.g. Closed for renovation')} className={inputClass} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-bold text-slate-800">{t('Your password')}</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required className={inputClass} />
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => reset()} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50">{t('Cancel')}</button>
            <button type="submit" disabled={busy || !password} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">{busy ? t('Saving...') : t('Pause business')}</button>
          </div>
        </form>
      )}

      {mode === 'delete' && (
        <form onSubmit={remove} className="space-y-4 rounded-xl border border-red-200 p-5 max-w-lg">
          <p className="flex items-start gap-2 text-sm text-red-800">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            {t('Everything will be deleted: branches, staff accounts, products, orders, payments, salaries, reports and settings. Download any reports you need first.')}
          </p>
          <label className="block space-y-1.5">
            <span className="text-xs font-bold text-slate-800">{t('Type the business name to confirm:')} <span className="font-mono">{status.name}</span></span>
            <input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} autoComplete="off" required className={inputClass} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-bold text-slate-800">{t('Your password')}</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required className={inputClass} />
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => reset()} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50">{t('Cancel')}</button>
            <button type="submit" disabled={busy || !password || confirmName.trim() !== String(status.name).trim()} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">{busy ? t('Deleting...') : t('Delete business permanently')}</button>
          </div>
        </form>
      )}
    </section>
  )
}
