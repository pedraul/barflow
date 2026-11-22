import React, { useEffect, useMemo, useState } from 'react'
import { fetchPlans, createPlan, updatePlan, deletePlan } from '../../api/endpoints'
import { useToast } from '../../context/ToastContext'
import { usePreferences } from '../../context/PreferencesContext'
import BusinessSubscriptions from '../../components/BusinessSubscriptions'

const money = (v) => `${Math.round(Number(v) || 0).toLocaleString()} RWF`
const apiError = (e, fallback) => e?.response?.data?.error || e?.message || fallback

// Same formula as the server (services/subscriptionPricing.js), for the live preview.
function preview(form) {
  const monthly = Math.max(0, Math.round(Number(form.priceMonthly) || 0))
  const dq = Math.min(90, Math.max(0, Number(form.discountQuarterly) || 0))
  const da = Math.min(90, Math.max(0, Number(form.discountAnnually) || 0))
  return {
    monthly,
    quarterly: Math.round(monthly * 3 * (1 - dq / 100)),
    annually: Math.round(monthly * 12 * (1 - da / 100)),
    dq,
    da,
  }
}

const EMPTY = { name: '', description: '', priceMonthly: '', discountQuarterly: '0', discountAnnually: '0', features: '', isActive: true, sortOrder: '' }

export default function SubscriptionPlans() {
  const { showSuccess } = useToast()
  const { t } = usePreferences()
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)

  useEffect(() => { load(true) }, [])

  const load = async (initial = false) => {
    if (initial) setLoading(true)
    try {
      setPlans(await fetchPlans())
    } catch (e) {
      setError(apiError(e, t('Could not load plans.')))
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setForm(EMPTY)
    setEditing(null)
    setShowForm(false)
    setError('')
  }

  const handleEdit = (plan) => {
    setForm({
      name: plan.name,
      description: plan.description || '',
      priceMonthly: String(plan.priceMonthly || ''),
      discountQuarterly: String(plan.discountQuarterly ?? 0),
      discountAnnually: String(plan.discountAnnually ?? 0),
      features: (plan.features || []).join('\n'),
      isActive: plan.isActive !== false,
      sortOrder: String(plan.sortOrder ?? ''),
    })
    setEditing(plan)
    setShowForm(true)
    setError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const p = useMemo(() => preview(form), [form])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        priceMonthly: Number(form.priceMonthly),
        discountQuarterly: Number(form.discountQuarterly) || 0,
        discountAnnually: Number(form.discountAnnually) || 0,
        features: form.features.split('\n').map((f) => f.trim()).filter(Boolean),
        isActive: form.isActive,
        ...(form.sortOrder !== '' ? { sortOrder: Number(form.sortOrder) } : {}),
      }
      if (editing) await updatePlan(editing.id, payload)
      else await createPlan(payload)
      resetForm()
      await load(false)
      showSuccess(editing ? t('Plan updated. New purchases and renewals use the new prices.') : t('Plan created.'))
    } catch (err) {
      setError(apiError(err, t('Failed to save plan.')))
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (plan) => {
    setBusyId(plan.id)
    try {
      await updatePlan(plan.id, { isActive: !plan.isActive })
      await load(false)
      showSuccess(plan.isActive ? t('Plan hidden from businesses.') : t('Plan is offered to businesses again.'))
    } catch (err) {
      setError(apiError(err, t('Could not update the plan.')))
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (plan) => {
    const used = plan.totalSubscriptions > 0
    const question = used
      ? `${plan.name}: ${t('businesses have subscribed to this plan, so it will be deactivated (hidden) instead of deleted. Continue?')}`
      : `${t('Delete the plan')} "${plan.name}"? ${t('This cannot be undone.')}`
    if (!window.confirm(question)) return
    setBusyId(plan.id)
    try {
      const result = await deletePlan(plan.id)
      await load(false)
      showSuccess(result.deleted ? t('Plan deleted.') : (result.message || t('Plan deactivated.')))
    } catch (err) {
      setError(apiError(err, t('Could not delete the plan.')))
    } finally {
      setBusyId(null)
    }
  }

  if (loading && plans.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  const input = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('Subscription Plans')}</h1>
          <p className="text-sm text-slate-500 mt-1">{t('Businesses see exactly these plans and prices when they register, subscribe or renew.')}</p>
        </div>
        <button
          onClick={() => { showForm ? resetForm() : (setForm(EMPTY), setShowForm(true)) }}
          className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-medium"
        >
          {showForm ? t('Cancel') : t('Add Plan')}
        </button>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>}

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-5">
          <h2 className="font-bold text-slate-900">{editing ? `${t('Edit Plan')}: ${editing.name}` : t('New Plan')}</h2>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block">
                <span className="block text-sm font-semibold text-slate-700 mb-1">{t('Plan Name')}</span>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} placeholder={t('e.g. Basic, Pro, Enterprise')} required minLength={2} maxLength={60} />
              </label>
              <label className="block">
                <span className="block text-sm font-semibold text-slate-700 mb-1">{t('Description')}</span>
                <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={input} maxLength={300} placeholder={t('Who this plan is for')} />
              </label>
              <label className="block">
                <span className="block text-sm font-semibold text-slate-700 mb-1">{t('Monthly price (RWF)')}</span>
                <input type="number" min="1" step="1" value={form.priceMonthly} onChange={(e) => setForm({ ...form, priceMonthly: e.target.value })} className={`${input} font-semibold`} placeholder="20000" required />
              </label>
              <label className="block">
                <span className="block text-sm font-semibold text-slate-700 mb-1">{t('Display order')}</span>
                <input type="number" step="1" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} className={input} placeholder={t('1 = shown first')} />
              </label>
              <label className="block">
                <span className="block text-sm font-semibold text-slate-700 mb-1">{t('Quarterly discount (%)')}</span>
                <input type="number" min="0" max="90" step="0.5" value={form.discountQuarterly} onChange={(e) => setForm({ ...form, discountQuarterly: e.target.value })} className={input} />
              </label>
              <label className="block">
                <span className="block text-sm font-semibold text-slate-700 mb-1">{t('Annual discount (%)')}</span>
                <input type="number" min="0" max="90" step="0.5" value={form.discountAnnually} onChange={(e) => setForm({ ...form, discountAnnually: e.target.value })} className={input} />
              </label>
              <label className="block sm:col-span-2">
                <span className="block text-sm font-semibold text-slate-700 mb-1">{t('Features (one per line)')}</span>
                <textarea value={form.features} onChange={(e) => setForm({ ...form, features: e.target.value })} className={input} rows={5} placeholder={t('Up to 5 branches\nQR menu & orders\nPayroll')} />
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 sm:col-span-2">
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                {t('Offered to businesses (active)')}
              </label>
            </div>

            <aside className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 text-sm h-fit">
              <p className="font-bold text-indigo-950">{t('What owners will pay')}</p>
              <p className="text-xs text-indigo-900/70 mb-3">{t('Shown on registration, the subscription page and renewal, and charged exactly.')}</p>
              {[
                [t('Monthly'), p.monthly, t('for 1 month'), 0],
                [t('Quarterly'), p.quarterly, t('for 3 months'), p.dq],
                [t('Annually'), p.annually, t('for 12 months'), p.da],
              ].map(([label, amount, period, pct]) => (
                <div key={label} className="flex items-baseline justify-between border-t border-indigo-100 py-2 first:border-t-0">
                  <span className="text-slate-700">{label} <span className="text-xs text-slate-500">{period}</span></span>
                  <span className="text-right">
                    <strong className="text-slate-900">{money(amount)}</strong>
                    {pct > 0 && <span className="block text-[11px] font-semibold text-emerald-700">{t('save')} {pct}%</span>}
                  </span>
                </div>
              ))}
              {editing && <p className="mt-2 text-xs text-slate-500">{t('Businesses already subscribed keep the price they paid until they renew.')}</p>}
            </aside>
          </div>

          <button type="submit" disabled={saving} className="px-6 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition">
            {saving ? t('Saving...') : editing ? t('Update Plan') : t('Create Plan')}
          </button>
        </form>
      )}

      {!plans.length && !showForm && (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">{t('No plans yet. Businesses cannot register until you add one.')}</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {plans.map((plan) => (
          <div key={plan.id} className={`bg-white rounded-xl border p-6 shadow-sm flex flex-col justify-between ${plan.isActive ? 'border-slate-200' : 'border-dashed border-slate-300 opacity-80'}`}>
            <div>
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0">
                  <h3 className="font-bold text-lg text-slate-900">{plan.name}</h3>
                  {plan.description && <p className="text-sm text-slate-500 mt-1">{plan.description}</p>}
                </div>
                <span className={`shrink-0 px-2 py-0.5 text-[10px] font-semibold rounded-full ${plan.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                  {plan.isActive ? t('Active') : t('Hidden')}
                </span>
              </div>

              <p className="text-2xl font-bold text-slate-900">{money(plan.priceMonthly)} <span className="text-xs font-normal text-slate-500">{t('/ month')}</span></p>
              <dl className="mt-2 mb-4 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <dt className="text-slate-500">{t('Quarterly')}{plan.discountQuarterly > 0 ? ` (−${plan.discountQuarterly}%)` : ''}</dt>
                  <dd className="font-semibold text-slate-900">{money(plan.priceQuarterly)}</dd>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <dt className="text-slate-500">{t('Annually')}{plan.discountAnnually > 0 ? ` (−${plan.discountAnnually}%)` : ''}</dt>
                  <dd className="font-semibold text-slate-900">{money(plan.priceAnnually)}</dd>
                </div>
              </dl>

              <ul className="space-y-1.5 mb-4">
                {(plan.features || []).map((f, i) => (
                  <li key={i} className="text-sm text-slate-600">• {f}</li>
                ))}
              </ul>
              <p className="text-xs text-slate-500 mb-4">
                {plan.activeSubscriptions || 0} {t('active subscriptions')} · {plan.totalSubscriptions || 0} {t('in total')}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button onClick={() => handleEdit(plan)} className="flex-1 py-2 text-sm font-semibold text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition">{t('Edit')}</button>
              <button onClick={() => toggleActive(plan)} disabled={busyId === plan.id} className="flex-1 py-2 text-sm font-semibold text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">
                {plan.isActive ? t('Hide') : t('Offer again')}
              </button>
              <button onClick={() => handleDelete(plan)} disabled={busyId === plan.id} className="py-2 px-3 text-sm font-semibold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50">{t('Delete')}</button>
            </div>
          </div>
        ))}
      </div>

      <BusinessSubscriptions />
    </div>
  )
}
