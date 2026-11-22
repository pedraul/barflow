import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useOwner } from '../context/OwnerContext'
import { usePreferences } from '../context/PreferencesContext'

const money = (v) => `${Math.round(Number(v) || 0).toLocaleString()} RWF`
const CYCLE = { monthly: 'Monthly', quarterly: 'Quarterly', annually: 'Annually', yearly: 'Annually' }

/** Owner Settings → Subscription: the current subscription and the plans the platform offers. */
export default function OwnerPlanSummary() {
  const { t } = usePreferences()
  const { fetchSubscription, fetchAvailableSubscriptionPlans } = useOwner()
  const [sub, setSub] = useState(null)
  const [plans, setPlans] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    fetchSubscription().then(setSub).catch(() => {})
    fetchAvailableSubscriptionPlans()
      .then((data) => setPlans(Array.isArray(data) ? data : []))
      .catch((e) => setError(e?.response?.data?.error || t('Could not load the plans.')))
  }, [fetchSubscription, fetchAvailableSubscriptionPlans, t])

  const end = sub?.periodEnd || sub?.currentPeriodEnd || sub?.nextRenewalDate
  const status = sub?.isActive ? t('Active') : sub?.unpaidAccessGranted ? t('Access granted by the platform') : t('Not active')

  return (
    <div className="p-8 space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-bold text-[#0F172A] tracking-tight">{t('SUBSCRIPTION')}</h2>
        <p className="text-xs text-slate-500">{t('Plans and prices are set by the platform administrator. Pay or renew from the Subscription page.')}</p>
      </div>

      <div className="rounded-xl border border-slate-200 p-5 grid grid-cols-1 sm:grid-cols-4 gap-4 text-sm">
        <div><p className="text-xs text-slate-500">{t('Status')}</p><p className="font-semibold text-slate-900">{status}</p></div>
        <div><p className="text-xs text-slate-500">{t('Plan')}</p><p className="font-semibold text-slate-900">{sub?.plan || '—'}</p></div>
        <div><p className="text-xs text-slate-500">{t('Billing')}</p><p className="font-semibold text-slate-900">{t(CYCLE[sub?.billingCycle] || '—')}</p></div>
        <div><p className="text-xs text-slate-500">{t('Ends on')}</p><p className="font-semibold text-slate-900">{end ? new Date(end).toLocaleDateString() : '—'}</p></div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr>
              <th className="text-left p-3">{t('Plan')}</th>
              <th className="text-right p-3">{t('Monthly')}</th>
              <th className="text-right p-3">{t('Quarterly')}</th>
              <th className="text-right p-3">{t('Annually')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {plans.map((p) => (
              <tr key={p.id}>
                <td className="p-3">
                  <p className="font-semibold text-slate-900">{p.name}</p>
                  {p.description && <p className="text-xs text-slate-500">{p.description}</p>}
                </td>
                <td className="p-3 text-right">{money(p.priceMonthly)}</td>
                <td className="p-3 text-right">{money(p.priceQuarterly)}{p.discountQuarterly > 0 && <span className="block text-[11px] text-emerald-700">−{p.discountQuarterly}%</span>}</td>
                <td className="p-3 text-right">{money(p.priceAnnually)}{p.discountAnnually > 0 && <span className="block text-[11px] text-emerald-700">−{p.discountAnnually}%</span>}</td>
              </tr>
            ))}
            {!plans.length && !error && <tr><td colSpan={4} className="p-4 text-center text-slate-400">{t('No plans available.')}</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end">
        <Link to="/owner/subscription" className="inline-flex items-center gap-2 bg-[#0066FF] hover:bg-blue-700 text-white font-bold px-5 py-2.5 rounded-lg text-sm transition shadow-sm">
          {sub?.isActive ? t('Renew or change plan') : t('Subscribe now')}
        </Link>
      </div>
    </div>
  )
}
