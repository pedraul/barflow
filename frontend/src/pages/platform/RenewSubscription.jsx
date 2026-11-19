import React, { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { fetchPlans, fetchSubscriptionStatus, fetchPlatformSettings } from '../../api/endpoints'
import { usePreferences } from '../../context/PreferencesContext'

const BILLING_CYCLE_LABELS = { monthly: 'Monthly', quarterly: 'Quarterly', annually: 'Annually' }

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
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {plans.map((plan) => (
            <div key={plan.id} className="bg-white rounded-xl border-2 border-slate-200 p-6 shadow-sm hover:border-indigo-300 transition">
              <h3 className="font-bold text-lg text-slate-900">{plan.name}</h3>
              <p className="text-sm text-slate-500 mt-1">{plan.description}</p>
              <div className="mt-4">
                <p className="text-2xl font-bold text-slate-900">{plan.priceMonthly.toLocaleString()} RWF</p>
                <p className="text-sm text-slate-400">{t('per month')}</p>
                <p className="text-sm text-slate-500 mt-1">{t('or')} {plan.priceYearly.toLocaleString()} RWF/{t('year')}</p>
              </div>
              <div className="text-sm text-slate-600 mt-3">
                <span className="font-semibold">{plan.maxBranches}</span> {t('branch(es)')} · <span className="font-semibold">{plan.maxUsers}</span> {t('users')}
              </div>
              <ul className="mt-4 space-y-2">
                {(plan.features || []).map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                    <svg className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                to={`/owner/subscription?plan=${plan.id}`}
                className="mt-6 block w-full py-2.5 bg-indigo-600 text-white text-center font-semibold rounded-lg hover:bg-indigo-700 transition"
              >
                {t('Select Plan')}
              </Link>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}