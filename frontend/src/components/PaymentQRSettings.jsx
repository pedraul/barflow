import React, { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useOwner } from '../context/OwnerContext'
import { useAuth } from '../context/AuthContext'
import { usePreferences, stripIcons } from '../context/PreferencesContext'
import QRCode from './QRCode'
import { buildPayUrl } from '../config/payUrl'
import {
  PAYMENT_METHOD_TYPE_KEYS, methodType, methodTitle, newPaymentMethod,
} from '../utils/paymentMethodTypes'

const inputClass = 'mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition font-medium'
const labelClass = 'text-xs font-bold text-slate-800 tracking-wide'

/**
 * Owner → System Settings → Payments.
 * The owner lists the ways customers can pay (MoMo number, MoMo Pay code,
 * Airtel, bank…). The printable QR opens a public page listing them.
 */
export default function PaymentQRSettings() {
  const { t } = usePreferences()
  const { user } = useAuth()
  const { fetchPaymentSettings, updatePaymentSettings } = useOwner()
  const [enabled, setEnabled] = useState(false)
  const [merchantName, setMerchantName] = useState('')
  const [methods, setMethods] = useState([])
  const [businessId, setBusinessId] = useState(user?.businessId || null)
  const [savedEnabled, setSavedEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [printing, setPrinting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const s = await fetchPaymentSettings()
      setEnabled(!!s?.qrPaymentEnabled)
      setSavedEnabled(!!s?.qrPaymentEnabled)
      setMerchantName(s?.merchantName || '')
      setMethods(Array.isArray(s?.paymentMethods) ? s.paymentMethods : [])
      if (s?.businessId) setBusinessId(s.businessId)
    } catch (e) {
      setMessage({ error: true, text: e.message })
    } finally {
      setLoading(false)
    }
  }, [fetchPaymentSettings])

  useEffect(() => { load() }, [load])

  const updateMethod = (id, changes) => setMethods((list) => list.map((m) => (m.id === id ? { ...m, ...changes } : m)))
  const removeMethod = (id) => setMethods((list) => list.filter((m) => m.id !== id))
  const addMethod = () => setMethods((list) => [...list, newPaymentMethod(list.length ? 'other' : 'mtn_momo')])

  const usableMethods = methods.filter((m) => m.enabled !== false && (m.number || m.accountName || m.note))

  const save = async () => {
    setMessage(null)
    if (enabled && usableMethods.length === 0) {
      setMessage({ error: true, text: t('Add at least one payment method before enabling QR payments.') })
      return
    }
    setSaving(true)
    try {
      const res = await updatePaymentSettings({ qrPaymentEnabled: enabled, merchantName, paymentMethods: methods })
      if (Array.isArray(res?.paymentMethods)) setMethods(res.paymentMethods)
      setSavedEnabled(enabled)
      setMessage({ error: false, text: t('Payment settings saved.') })
    } catch (e) {
      setMessage({ error: true, text: e?.response?.data?.error || e.message })
    } finally {
      setSaving(false)
    }
  }

  // Print only the QR card (same approach as the table QR codes).
  useEffect(() => {
    if (!printing) return undefined
    const stop = () => {
      document.body.classList.remove('pay-qr-printing')
      setPrinting(false)
    }
    document.body.classList.add('pay-qr-printing')
    window.addEventListener('afterprint', stop)
    const frame = window.requestAnimationFrame(() => {
      try { window.print() } catch { stop() }
    })
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('afterprint', stop)
      document.body.classList.remove('pay-qr-printing')
    }
  }, [printing])

  const payUrl = businessId ? buildPayUrl(businessId) : ''
  const displayName = merchantName || t('Our business')

  if (loading) return <p className="p-8 text-sm text-slate-500">{t('Loading…')}</p>

  return (
    <div className="p-4 sm:p-8 space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-bold text-[#0F172A] tracking-tight">{t('PAYMENT SETTINGS & QR CODES')}</h2>
        <p className="text-xs text-slate-500">{t('Add the ways customers can pay you. Print the QR code: customers scan it, choose a method and see where to pay.')}</p>
      </div>

      {message && (
        <p role={message.error ? 'alert' : 'status'} className={`p-3 rounded-lg text-sm font-medium border ${message.error ? 'bg-red-50 border-red-300 text-red-800' : 'bg-emerald-50 border-emerald-300 text-emerald-800'}`}>
          {stripIcons(message.text)}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => setEnabled((v) => !v)}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${enabled ? 'bg-blue-600' : 'bg-slate-300'}`}
        >
          <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
        <span className="text-sm font-semibold text-slate-700">{t('Enable QR Payments')}</span>
      </div>

      <div>
        <label className={labelClass} htmlFor="pay-merchant-name">{t('Name shown to customers')}</label>
        <input id="pay-merchant-name" type="text" value={merchantName} onChange={(e) => setMerchantName(e.target.value)} placeholder={t('e.g. Fina Bar & Grill')} className={inputClass} />
      </div>

      <section className="space-y-3" aria-label={t('Payment methods')}>
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-slate-800 tracking-wide">{t('PAYMENT METHODS')}</h3>
          <button type="button" onClick={addMethod} disabled={methods.length >= 12} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            {t('Add method')}
          </button>
        </div>

        {methods.length === 0 && (
          <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">{t('No payment methods yet. Add your MoMo number, MoMo Pay code, Airtel Money or bank account.')}</p>
        )}

        {methods.map((m, index) => {
          const meta = methodType(m.type)
          const suggested = meta.suggestDial ? meta.suggestDial(m.number) : ''
          return (
            <article key={m.id} className="rounded-xl border border-slate-200 bg-white p-4 space-y-3" style={{ borderLeft: `5px solid ${meta.accent}` }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="text-sm text-slate-900">{index + 1}. {methodTitle(m, t)}</strong>
                <div className="flex items-center gap-3">
                  <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                    <input type="checkbox" checked={m.enabled !== false} onChange={(e) => updateMethod(m.id, { enabled: e.target.checked })} />
                    {t('Show to customers')}
                  </label>
                  <button type="button" onClick={() => removeMethod(m.id)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50" aria-label={`${t('Remove')} ${methodTitle(m, t)}`}>
                    {t('Remove')}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>{t('Type')}</label>
                  <select value={m.type} onChange={(e) => updateMethod(m.id, { type: e.target.value })} className={inputClass}>
                    {PAYMENT_METHOD_TYPE_KEYS.map((key) => <option key={key} value={key}>{t(methodType(key).label)}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>{t('Display name (optional)')}</label>
                  <input type="text" value={m.label} onChange={(e) => updateMethod(m.id, { label: e.target.value })} placeholder={t(meta.label)} className={inputClass} />
                </div>
                {m.type === 'bank' && (
                  <div>
                    <label className={labelClass}>{t('Bank name')}</label>
                    <input type="text" value={m.bankName} onChange={(e) => updateMethod(m.id, { bankName: e.target.value })} placeholder={t('e.g. Bank of Kigali')} className={inputClass} />
                  </div>
                )}
                <div>
                  <label className={labelClass}>{t('Account name')}</label>
                  <input type="text" value={m.accountName} onChange={(e) => updateMethod(m.id, { accountName: e.target.value })} placeholder={t('Name the customer will see when paying')} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>{t(meta.numberLabel)}</label>
                  <input type="text" value={m.number} onChange={(e) => updateMethod(m.id, { number: e.target.value })} placeholder={t(meta.numberPlaceholder)} className={inputClass} />
                </div>
                {m.type !== 'bank' && (
                  <div>
                    <label className={labelClass}>{t('Dial code (optional)')}</label>
                    <input type="text" value={m.dialCode} onChange={(e) => updateMethod(m.id, { dialCode: e.target.value })} placeholder={suggested || t('e.g. *182*8*1*123456#')} className={inputClass} />
                    {suggested && suggested !== m.dialCode && (
                      <button type="button" onClick={() => updateMethod(m.id, { dialCode: suggested })} className="mt-1 text-xs font-semibold text-blue-700 hover:underline">
                        {t('Use')} {suggested}
                      </button>
                    )}
                  </div>
                )}
                <div className="md:col-span-2">
                  <label className={labelClass}>{t('Instructions for customers (optional)')}</label>
                  <input type="text" value={m.note} onChange={(e) => updateMethod(m.id, { note: e.target.value })} placeholder={t('e.g. Use your table number as the reference')} className={inputClass} />
                </div>
              </div>
            </article>
          )
        })}
      </section>

      <div className="flex justify-end">
        <button type="button" onClick={save} disabled={saving} className="bg-[#0066FF] hover:bg-blue-700 text-white font-bold px-5 py-2.5 rounded-lg text-sm transition shadow-sm disabled:opacity-50">
          {saving ? t('Saving...') : t('Save Payment Settings')}
        </button>
      </div>

      <section className="border-t border-slate-100 pt-6 space-y-4">
        <h3 className="text-sm font-bold text-slate-800 tracking-wide">{t('BUSINESS PAYMENT QR CODE')}</h3>
        {!savedEnabled || !payUrl ? (
          <p className="text-sm text-slate-500">{t('Enable QR payments, add a payment method and save to get your printable QR code.')}</p>
        ) : (
          <div className="flex flex-col items-center gap-4 rounded-xl border border-slate-200 bg-white p-6">
            <p className="text-xs text-slate-500 text-center">{t('Print this QR code and place it on tables, the counter or receipts. Customers scan it to choose how to pay.')}</p>
            <div className="rounded-lg border border-slate-100 bg-white p-3 shadow-sm">
              <QRCode value={payUrl} size={220} ariaLabel={t('Payment QR code')} />
            </div>
            <p className="text-sm font-bold text-slate-900">{displayName}</p>
            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" onClick={() => setPrinting(true)} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
                {t('Print QR Code')}
              </button>
              <a href={payUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                {t('Open payment page')}
              </a>
            </div>
          </div>
        )}
      </section>

      {printing && payUrl && createPortal(
        <div className="pay-qr-print-area">
          <article className="pay-qr-print-card">
            <p className="pay-qr-print-kicker">{t('Scan to pay')}</p>
            <h1>{displayName}</h1>
            <QRCode value={payUrl} size={260} />
            <ul>
              {usableMethods.map((m) => (
                <li key={m.id}>
                  <strong>{methodTitle(m, t)}</strong>
                  {m.number ? `: ${m.number}` : ''}
                  {m.accountName ? ` (${m.accountName})` : ''}
                </li>
              ))}
            </ul>
            <p className="pay-qr-print-hint">{t('Open your phone camera, scan the code and choose how to pay.')}</p>
          </article>
        </div>,
        document.body
      )}
    </div>
  )
}
