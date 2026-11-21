import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { fetchPayOptions } from '../../api/endpoints'
import { usePreferences } from '../../context/PreferencesContext'
import { methodTitle, methodType, dialHref } from '../../utils/paymentMethodTypes'

/**
 * Public page opened by the business "scan to pay" QR code.
 * The customer picks one of the owner's payment methods and sees where to pay.
 */
export default function PayPage() {
  const { businessId } = useParams()
  const { t } = usePreferences()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [copied, setCopied] = useState('')

  useEffect(() => {
    let active = true
    fetchPayOptions(businessId)
      .then((res) => {
        if (!active) return
        setData(res)
        if (res?.methods?.length === 1) setSelectedId(res.methods[0].id)
      })
      .catch((e) => { if (active) setError(e?.response?.data?.error || e.message || t('Unable to load payment options.')) })
    return () => { active = false }
  }, [businessId])

  useEffect(() => {
    if (data?.merchantName) document.title = `${t('Pay')} · ${data.merchantName}`
  }, [data, t])

  const copy = async (value, key) => {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      const area = document.createElement('textarea')
      area.value = value
      document.body.appendChild(area)
      area.select()
      try { document.execCommand('copy') } catch { /* ignore */ }
      area.remove()
    }
    setCopied(key)
    window.setTimeout(() => setCopied((c) => (c === key ? '' : c)), 1800)
  }

  return (
    <div className="pay-page min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto w-full max-w-md space-y-5">
        <header className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">{t('Scan to pay')}</p>
          <h1 className="mt-1 text-2xl font-extrabold text-slate-900">{data?.merchantName || (error ? t('Payment') : t('Loading…'))}</h1>
          {data && <p className="mt-1 text-sm text-slate-600">{t('Choose how you want to pay.')}</p>}
        </header>

        {error && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-center text-sm font-medium text-red-800">{error}</p>
        )}

        {data && (
          <ul className="space-y-3" aria-label={t('Payment methods')}>
            {data.methods.map((m) => {
              const meta = methodType(m.type)
              const open = selectedId === m.id
              return (
                <li key={m.id} className="overflow-hidden rounded-2xl border bg-white shadow-sm" style={{ borderColor: open ? meta.accent : '#e2e8f0' }}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(open ? null : m.id)}
                    aria-expanded={open}
                    className="flex w-full items-center justify-between gap-3 p-4 text-left"
                    style={{ borderLeft: `6px solid ${meta.accent}`, background: open ? meta.tint : '#fff' }}
                  >
                    <span className="min-w-0">
                      <span className="block text-base font-extrabold text-slate-900">{methodTitle(m, t)}</span>
                      {m.accountName && <span className="block truncate text-sm text-slate-600">{m.accountName}</span>}
                    </span>
                    <span className="shrink-0 rounded-full px-3 py-1 text-xs font-bold" style={{ background: open ? meta.accent : meta.tint, color: open ? '#ffffff' : meta.accent }}>
                      {open ? t('Hide') : t('Pay with this')}
                    </span>
                  </button>

                  {open && (
                    <div className="space-y-3 border-t border-slate-100 p-4">
                      {m.bankName && (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t('Bank')}</p>
                          <p className="text-sm font-bold text-slate-900">{m.bankName}</p>
                        </div>
                      )}
                      {m.accountName && (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t('Account name')}</p>
                          <p className="text-sm font-bold text-slate-900">{m.accountName}</p>
                        </div>
                      )}
                      {m.number && (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t(meta.numberLabel)}</p>
                          <div className="mt-1 flex items-center gap-2">
                            <span className="min-w-0 flex-1 break-all rounded-lg bg-slate-100 px-3 py-2 font-mono text-lg font-bold text-slate-900">{m.number}</span>
                            <button
                              type="button"
                              onClick={() => copy(m.number, `${m.id}-number`)}
                              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              {copied === `${m.id}-number` ? t('Copied') : t('Copy')}
                            </button>
                          </div>
                        </div>
                      )}
                      {m.dialCode && (
                        <a
                          href={dialHref(m.dialCode)}
                          className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-base font-bold text-white"
                          style={{ backgroundColor: meta.accent }}
                        >
                          {t('Dial')} {m.dialCode}
                        </a>
                      )}
                      {m.note && <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{m.note}</p>}
                      <p className="text-xs text-slate-500">{t('After paying, show the confirmation message to staff.')}</p>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        <p className="text-center text-xs text-slate-400">BarFlow</p>
      </div>
    </div>
  )
}
