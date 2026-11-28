import React, { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { fetchPlans, fetchSubscriptionStatus, fetchPlatformSettings } from '../../api/endpoints'
import { usePreferences } from '../../context/PreferencesContext'

const BILLING_CYCLE_LABELS = { monthly: 'Monthly', quarterly: 'Quarterly', annually: 'Annually' }

// Same pricing rules as the backend (/v1/owner/subscription/plans):
// quarterly = 3 months minus the quarterly discount; annually = the plan's
// yearly price, or 12 months minus the annual discount.
function billingOptions(plan) {
  const monthly = Number(plan.priceMonthly) || 0
  const quarterly = Number(plan.priceQuarterly) || Math.round(monthly * 3 * (1 - (Number(plan.discountQuarterly) || 0) / 100))
  const annually = Number(plan.priceAnnually) || Number(plan.priceYearly) || Math.round(monthly * 12 * (1 - (Number(plan.discountAnnually) || 0) / 100))
  return [
    { cycle: 'monthly', label: 'Monthly', periodText: 'billed every month', months: 1, total: monthly },
    { cycle: 'quarterly', label: 'Quarterly', periodText: 'billed every 3 months', months: 3, total: quarterly },
    { cycle: 'annually', label: 'Annually', periodText: 'billed every 12 months', months: 12, total: annually },
  ].map((option) => {
    const full = monthly * option.months
    const savings = Math.max(0, full - option.total)
    return { ...option, savings, savingsPercent: full > 0 ? Math.round((savings / full) * 100) : 0 }
  })
}

export default function RenewSubscription() {
  const { t } = usePreferences()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [plans, setPlans] = useState([])
  const [currentSub, setCurrentSub] = useState(null)
  const [platform, setPlatform] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      navigate('/login')
      return
    }
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [plansData, subscriptionData, platformData] =
        await Promise.all([
          fetchPlans(),
          fetchSubscriptionStatus(),
          fetchPlatformSettings(),
        ]);

      setPlans(plansData);
      setCurrentSub(subscriptionData);
      setPlatform(platformData);

    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-slate-900 text-white">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-400 flex items-center justify-center">
              <span className="text-white font-bold text-sm">B</span>
            </div>
            <span className="font-bold">BarFlow</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-400">{user?.businessName || user?.name}</span>
            <button onClick={handleLogout} className="text-sm text-slate-400 hover:text-white transition">{t('Logout')}</button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Expired Banner */}
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 mb-8">
          <div className="flex items-start gap-4">
            <div>
              <h2 className="text-lg font-bold text-red-800">{t('Subscription Expired')}</h2>
              <p className="text-sm text-red-600 mt-1">
                {t('Your subscription has expired. Please renew to regain access to all features.')}
                {currentSub?.daysRemaining > 0 && ` ${t('Your subscription expired')} ${currentSub.daysRemaining} ${t('days ago.')}`}
              </p>
            </div>
          </div>
        </div>

        {/* Current Plan Info */}
        {currentSub && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm mb-8">
            <h3 className="font-bold text-slate-900 mb-2">{t('Current Plan')}</h3>
            <p className="text-slate-600">
              {currentSub.plan || t('No plan')} · {typeof BILLING_CYCLE_LABELS[currentSub.billingCycle] === 'string'
                ? t(BILLING_CYCLE_LABELS[currentSub.billingCycle])
                : currentSub.billingCycle || t('Monthly')} {t('billing')}
            </p>
            {currentSub.currentPeriodEnd && (
              <p className="text-sm text-slate-500 mt-1">
                {t('Expired')}: {new Date(currentSub.currentPeriodEnd).toLocaleDateString()}
              </p>
            )}
          </div>
        )}

        {/* Available Plans */}
        <h2 className="text-xl font-bold text-slate-900 mb-4">{t('Choose a Plan to Renew')}</h2>
        {plans.filter((plan) => plan.isActive !== false).map((plan) => (
          <section key={plan.id} className="mb-8">
            {plans.filter((p) => p.isActive !== false).length > 1 && (
              <h3 className="mb-3 text-lg font-bold text-slate-900">{plan.name}</h3>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {billingOptions(plan).map((option) => (
                <div
                  key={option.cycle}
                  className={`relative bg-white rounded-xl border-2 p-6 shadow-sm transition hover:border-indigo-300 ${option.cycle === 'quarterly' ? 'border-indigo-400' : 'border-slate-200'}`}
                >
                  {option.savingsPercent > 0 && (
                    <span className="absolute right-4 top-4 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
                      {t('Save')} {option.savingsPercent}%
                    </span>
                  )}
                  <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">{t(option.label)}</p>
                  <h3 className="mt-1 font-bold text-lg text-slate-900">{plan.name}</h3>
                  <p className="text-sm text-slate-500 mt-1">{plan.description}</p>
                  <div className="mt-4">
                    <p className="text-2xl font-bold text-slate-900">{option.total.toLocaleString()} RWF</p>
                    <p className="text-sm text-slate-400">{t(option.periodText)}</p>
                    {option.months > 1 && (
                      <p className="text-sm text-slate-500 mt-1">
                        ≈ {Math.round(option.total / option.months).toLocaleString()} RWF / {t('month')}
                        {option.savings > 0 && <> · {t('you save')} {option.savings.toLocaleString()} RWF</>}
                      </p>
                    )}
                  </div>
                  {(plan.maxBranches != null || plan.maxUsers != null) && (
                    <div className="text-sm text-slate-600 mt-3">
                      <span className="font-semibold">{plan.maxBranches ?? '∞'}</span> {t('branch(es)')} · <span className="font-semibold">{plan.maxUsers ?? '∞'}</span> {t('users')}
                    </div>
                  )}
                  <ul className="mt-4 space-y-2">
                    {(plan.features || []).map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link
                    to={`/owner/subscription?plan=${plan.id}&cycle=${option.cycle}`}
                    className="mt-6 block w-full py-2.5 bg-indigo-600 text-white text-center font-semibold rounded-lg hover:bg-indigo-700 transition"
                  >
                    {t('Select Plan')}
                  </Link>
                </div>
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  )
}