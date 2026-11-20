import React, { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useOwner } from '../../context/OwnerContext'
import { AlertTriangle, CheckCircle2, Download, ShieldCheck } from 'lucide-react'
import { usePreferences } from '../../context/PreferencesContext'

const PAYMENT_METHODS = [
  { id: 'mtn_momo', label: 'MTN MoMo', hint: 'Approve the payment prompt on your phone' },
  { id: 'airtel_money', label: 'Airtel Money', hint: 'Approve the payment prompt on your phone' },
]

const CURRENCY = 'RWF'
const formatCurr = (v) =>
  new Intl.NumberFormat('en-RW', { style: 'currency', currency: CURRENCY, minimumFractionDigits: 0 }).format(v || 0)

export default function Subscription() {
  const { t } = usePreferences()
  const {
    fetchSubscription, fetchAvailableSubscriptionPlans, selectSubscriptionPlan,
    checkSubscriptionPayment, fetchReceipt, loading,
  } = useOwner()

  const [sub, setSub] = useState(null)
  const [availablePlans, setAvailablePlans] = useState([])
  const [step, setStep] = useState(0)
  const [message, setMessage] = useState('')

  // The renew page links here with ?plan=<id>&cycle=monthly|quarterly|annually
  const [searchParams] = useSearchParams()
  const requestedPlanId = searchParams.get('plan')
  const requestedCycle = searchParams.get('cycle')
  const [selectedPlan, setSelectedPlan] = useState(null)
  const [billingCycle, setBillingCycle] = useState(() => (
    ['monthly', 'quarterly', 'annually'].includes(requestedCycle) ? requestedCycle : 'monthly'
  ))
  const [paymentMethod, setPaymentMethod] = useState('mtn_momo')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [pending, setPending] = useState(null)
  const [receipt, setReceipt] = useState(null)

  const load = useCallback(async () => {
    try {
      const data = await fetchSubscription()
      setSub(data)
      if (data.pendingPaymentId) {
        setPending((current) => current?.paymentId === data.pendingPaymentId
          ? current
          : {
              paymentId: data.pendingPaymentId,
              reference: data.pendingPaymentReference,
              plan: data.pendingPaymentPlan,
              amount: data.pendingPaymentAmount,
              paymentMethod: data.pendingPaymentMethod,
              phoneNumber: data.pendingPaymentPhone,
              status: 'pending',
            })
        setStep((current) => current === 2 ? current : 1)
      }
    } catch (e) { console.error(e) }
    try {
      const plans = await fetchAvailableSubscriptionPlans()
      setAvailablePlans(plans)
      setSelectedPlan((current) => current
        || plans.find((plan) => String(plan.id) === String(requestedPlanId))
        || plans[0]
        || null)
    } catch (e) { console.error(e) }
  }, [fetchSubscription, fetchAvailableSubscriptionPlans, requestedPlanId])

  const checkPayment = useCallback(async () => {
    if (!pending?.paymentId || pending.status !== 'pending') return
    try {
      const result = await checkSubscriptionPayment(pending.paymentId)
      if (result.status === 'completed') {
        setPending((current) => ({ ...current, ...result, status: 'completed' }))
        setMessage(`${t('✅ Payment confirmed automatically. Receipt')} ${result.receiptNumber || ''} ${t('generated.')}`)
        setStep(2)
        const paymentReceipt = await fetchReceipt()
        setReceipt(paymentReceipt)
        await load()
      } else if (result.status === 'failed') {
        setPending((current) => ({ ...current, status: 'failed' }))
        setMessage(t('❌ The provider declined or could not complete this payment. Start a new payment to try again.'))
      }
    } catch (e) {
      setMessage('❌ ' + (e.message || t('Unable to check provider payment status.')))
    }
  }, [pending, checkSubscriptionPayment, fetchReceipt, load])

  useEffect(() => {
    if (!pending?.paymentId || pending.status !== 'pending') return undefined
    const timer = window.setInterval(checkPayment, 5000)
    checkPayment()
    return () => window.clearInterval(timer)
  }, [pending?.paymentId, pending?.status, checkPayment])

  useEffect(() => {
    load()
    const refresh = window.setInterval(load, 30000)
    window.addEventListener('focus', load)
    return () => {
      window.clearInterval(refresh)
      window.removeEventListener('focus', load)
    }
  }, [load])

  const amountFor = (plan = selectedPlan, cycle = billingCycle) => {
    if (!plan) return 0
    const monthly = Number(plan.priceMonthly || 0)
    if (cycle === 'quarterly') {
      const discount = Number(plan.discountQuarterly ?? 8)
      return Number(plan.priceQuarterly) || Math.round(monthly * 3 * (1 - discount / 100))
    }
    if (cycle === 'annually' || cycle === 'yearly') {
      const discount = Number(plan.discountAnnually ?? 14)
      const yearly = Number(plan.priceAnnually) || Number(plan.priceYearly) || Math.round(monthly * 12 * (1 - discount / 100))
      return Number(yearly)
    }
    return monthly
  }

  const handleSelectPlan = async () => {
    setMessage('')
    try {
      if (!phoneNumber) {
        return setMessage(t('❌ Phone number is required to receive the payment request.'))
      }
      if (!selectedPlan) {
        return setMessage(t('❌ Select a subscription plan first.'))
      }
      const result = await selectSubscriptionPlan({
        plan: selectedPlan.name.toLowerCase(),
        planId: selectedPlan.id,
        paymentMethod,
        phoneNumber,
        billingCycle,
      })
      setPending(result)
      setMessage(result.message || t('Payment request sent. Approve it on your phone; access activates after provider confirmation.'))
      setStep(1)
    } catch (e) { setMessage('❌ ' + e.message) }
  }

  const handleRenew = async (plan) => {
    setMessage('')
    try {
      if (!phoneNumber) return setMessage(t('❌ Phone number is required to receive the payment request.'))
      const result = await selectSubscriptionPlan({
        plan: plan.name.toLowerCase(),
        planId: plan.id,
        billingCycle,
        paymentMethod,
        phoneNumber,
      })
      setPending(result)
      setMessage(result.message || t('Renewal payment request sent. Approve it on your phone; your renewal activates after confirmation.'))
      setStep(1)
    } catch (e) { setMessage('❌ ' + e.message) }
  }

  const downloadReceipt = () => {
    const data = receipt || sub
    const lines = [
      'BARFLOW — SUBSCRIPTION RECEIPT',
      '--------------------------------',
      `Receipt No: ${data.receiptNumber || sub?.receiptNumber || 'ADMIN-VERIFIED'}`,
      `Business:   ${data.businessName || 'N/A'}`,
      `Plan:       ${data.plan || sub?.plan || 'N/A'}`,
      `Amount:     ${formatCurr(data.amount ?? sub?.amountPaid ?? 0)}`,
      `Method:     ${data.paymentMethod || sub?.paymentMethod || 'N/A'}`,
      `Phone:      ${data.phoneNumber || sub?.phoneNumber || '—'}`,
      `Start:      ${data.startDate ? new Date(data.startDate).toLocaleString() : (sub?.startDate ? new Date(sub.startDate).toLocaleString() : 'N/A')}`,
      `End:        ${data.endDate ? new Date(data.endDate).toLocaleString() : (sub?.periodEnd ? new Date(sub.periodEnd).toLocaleString() : 'N/A')}`,
      `Status:     ${data.paymentStatus || sub?.paymentStatus || 'verified'}`,
      '--------------------------------',
      `Generated:  ${new Date().toLocaleString()}`,
    ].join('\n')
    const blob = new Blob([lines], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `receipt_${data.receiptNumber || sub?.receiptNumber || 'subscription'}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }


  const statusLabel = sub
    ? (sub.isActive
        ? t('Active')
        : sub.unpaidAccessGranted
          ? t('Admin access granted')
          : sub.paymentStatus === 'pending' ? t('Awaiting payment') : t('Inactive'))
    : ''
  const statusTone = sub?.isActive ? 'ok' : sub?.unpaidAccessGranted ? 'info' : 'warn'

  // Share of the current period still remaining, for the progress bar.
  const periodProgress = (() => {
    const start = sub?.startDate ? new Date(sub.startDate).getTime() : null
    const end = (sub?.periodEnd || sub?.nextRenewalDate) ? new Date(sub.periodEnd || sub.nextRenewalDate).getTime() : null
    if (!start || !end || end <= start) return null
    const left = Math.min(1, Math.max(0, (end - Date.now()) / (end - start)))
    return Math.round(left * 100)
  })()

  const stepIndex = step === 0 ? 0 : step === 1 ? 1 : 2
  const steps = [t('Choose plan'), t('Approve payment'), t('Done')]

  const cycles = [
    { cycle: 'monthly', title: 'Monthly', period: 'per month', months: 1, features: ['Full platform features', 'All core business tools', 'Monthly renewal'] },
    { cycle: 'quarterly', title: 'Quarterly', period: 'for 3 months', months: 3, features: ['Everything in Monthly', 'Three-month billing period', 'Reduced overall cost'] },
    { cycle: 'annually', title: 'Annual', period: 'per year', months: 12, features: ['Everything in Quarterly', 'Twelve-month billing period', 'Best long-term value'] },
  ]

  const isError = message.startsWith('❌')

  return (
    <div className="sub-page">
      {/* Header */}
      <header className="sub-header">
        <div className="min-w-0">
          <p className="sub-eyebrow">{t('Owner workspace')}</p>
          <h1 className="sub-title">{sub?.isActive ? t('Subscription & billing') : t('Activate your subscription')}</h1>
          <p className="sub-lead">
            {sub?.isActive
              ? t('Manage your plan, renew early, and download receipts.')
              : t('Select a plan and approve the mobile-money payment request. Access activates automatically after the provider confirms payment.')}
          </p>
        </div>
      </header>

      {message && (
        <div role={isError ? 'alert' : 'status'} className={`sub-alert ${isError ? 'is-error' : 'is-ok'}`}>
          {isError ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
          <span>{message.replace(/^[❌✅]\s*/u, '')}</span>
        </div>
      )}

      {/* Current subscription */}
      {sub && (
        <section className="sub-current" aria-label={t('Current subscription')}>
          <div className="sub-current-main">
            <div className="sub-current-icon"><ShieldCheck size={22} /></div>
            <div className="min-w-0">
              <span className="sub-current-label">{t('Current plan')}</span>
              <div className="sub-current-plan">
                {sub.plan || t('Free')}
                <span className={`sub-status is-${statusTone}`}>{statusLabel}</span>
              </div>
            </div>
          </div>
          <dl className="sub-current-stats">
            <div>
              <dt>{t('Days remaining')}</dt>
              <dd>{sub.daysRemaining ?? 0}</dd>
            </div>
            <div>
              <dt>{t('Next renewal')}</dt>
              <dd>{sub.nextRenewalDate ? new Date(sub.nextRenewalDate).toLocaleDateString() : '—'}</dd>
            </div>
          </dl>
          {periodProgress != null && (
            <div className="sub-progress" aria-hidden="true">
              <span style={{ width: `${periodProgress}%` }} className={periodProgress < 20 ? 'is-low' : ''} />
            </div>
          )}
        </section>
      )}

      {sub && !sub.isActive && (
        <div className="sub-alert is-warn">
          <AlertTriangle size={18} />
          <span>
            {sub.unpaidAccessGranted
              ? t('A platform administrator has granted access without payment. This is separate from a paid subscription.')
              : t('Your subscription is not active. Complete payment below — it activates automatically once the provider confirms.')}
          </span>
        </div>
      )}
      {sub?.aboutToExpire && sub.isActive && (
        <div className="sub-alert is-warn">
          <AlertTriangle size={18} />
          <span>{t('Your subscription expires soon. Renew now to avoid service interruption.')}</span>
        </div>
      )}

      {/* Stepper */}
      <ol className="sub-stepper" aria-label={t('Progress')}>
        {steps.map((label, i) => (
          <li key={label} className={i < stepIndex ? 'is-done' : i === stepIndex ? 'is-current' : ''} aria-current={i === stepIndex ? 'step' : undefined}>
            <span className="sub-step-dot">{i < stepIndex ? <CheckCircle2 size={14} /> : i + 1}</span>
            <span className="sub-step-label">{label}</span>
          </li>
        ))}
      </ol>

      {/* STEP 0 — choose plan, billing and payment */}
      {step === 0 && (
        <>
          {availablePlans.length > 1 && (
            <section className="sub-card">
              <h2 className="sub-card-title"><span className="sub-num">1</span>{t('Choose a plan')}</h2>
              <div className="sub-tier-grid">
                {availablePlans.map((plan) => {
                  const selected = String(selectedPlan?.id) === String(plan.id)
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => setSelectedPlan(plan)}
                      aria-pressed={selected}
                      className={`sub-tier${selected ? ' is-selected' : ''}`}
                    >
                      <span className="sub-tier-name">{plan.name}</span>
                      <span className="sub-tier-price">{formatCurr(plan.priceMonthly)}<small>{t('/month')}</small></span>
                      <CheckCircle2 size={18} className="sub-tier-check" aria-hidden="true" />
                    </button>
                  )
                })}
              </div>
            </section>
          )}

          <section className="sub-card">
            <h2 className="sub-card-title">
              <span className="sub-num">{availablePlans.length > 1 ? 2 : 1}</span>{t('Billing period')}
            </h2>
            <div className="sub-cycle-grid" role="radiogroup" aria-label={t('Billing period')}>
              {cycles.map(({ cycle, title, period, months, features }) => {
                const plan = selectedPlan || availablePlans[0]
                const total = amountFor(plan, cycle)
                const full = Number(plan?.priceMonthly || 0) * months
                const savePercent = full > 0 ? Math.round(((full - total) / full) * 100) : 0
                const active = billingCycle === cycle
                const popular = cycle === 'quarterly'
                return (
                  <label key={cycle} className={`sub-cycle${active ? ' is-selected' : ''}${popular ? ' is-popular' : ''}`}>
                    <input type="radio" name="billingCycle" value={cycle} checked={active} onChange={() => setBillingCycle(cycle)} className="sr-only" />
                    {popular && <span className="sub-cycle-ribbon">{t('Most popular')}</span>}
                    <div className="sub-cycle-head">
                      <span className="sub-cycle-title">{t(title)}</span>
                      <span className="sub-radio" aria-hidden="true" />
                    </div>
                    <div className="sub-cycle-price">{formatCurr(total)}</div>
                    <div className="sub-cycle-period">
                      {t(period)}
                      {months > 1 && <> · ≈ {formatCurr(Math.round(total / months))}{t('/month')}</>}
                    </div>
                    {savePercent > 0 && <span className="sub-save">{t('Save')} {savePercent}%</span>}
                    <ul className="sub-cycle-features">
                      {[...features, 'Automatic renewal reminders'].map((feature) => (
                        <li key={feature}><CheckCircle2 size={15} aria-hidden="true" />{t(feature)}</li>
                      ))}
                    </ul>
                  </label>
                )
              })}
            </div>
            <div className="sub-includes">
              {['All Core Features', '24/7 Support', 'Regular Updates', 'Secure & Reliable'].map((item) => (
                <span key={item}><CheckCircle2 size={14} aria-hidden="true" />{t(item)}</span>
              ))}
            </div>
          </section>

          <section className="sub-card">
            <h2 className="sub-card-title">
              <span className="sub-num">{availablePlans.length > 1 ? 3 : 2}</span>{t('Payment')}
            </h2>
            <div className="sub-method-grid" role="radiogroup" aria-label={t('Choose payment method')}>
              {PAYMENT_METHODS.map((m) => {
                const selected = paymentMethod === m.id
                return (
                  <label key={m.id} className={`sub-method${selected ? ' is-selected' : ''}`}>
                    <input type="radio" name="pm" checked={selected} onChange={() => setPaymentMethod(m.id)} className="sr-only" />
                    <span aria-hidden="true" className={`sub-method-mark ${m.id === 'mtn_momo' ? 'is-mtn' : 'is-airtel'}`}>
                      {m.id === 'mtn_momo' ? 'MTN' : 'airtel'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="sub-method-name">{t(m.label)}</span>
                      <span className="sub-method-hint">{t(m.hint)}</span>
                    </span>
                    <span className="sub-radio" aria-hidden="true" />
                  </label>
                )
              })}
            </div>

            <label className="sub-field">
              <span>{t('Mobile-money phone number')}</span>
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder={t('+250700000000')}
              />
            </label>
          </section>

          <div className="sub-checkout">
            <div className="sub-checkout-total">
              <span>{t('Amount due')}</span>
              <strong>{formatCurr(amountFor())}</strong>
              <small>
                {(selectedPlan?.name ? `${selectedPlan.name} · ` : '')}
                {billingCycle === 'quarterly' ? t('for 3 months') : billingCycle === 'annually' ? t('for 12 months') : t('for 1 month')}
              </small>
            </div>
            <button type="button" className="sub-btn-primary" onClick={handleSelectPlan} disabled={loading}>
              {loading ? t('Sending request…') : t('Continue to payment')}
            </button>
          </div>
        </>
      )}

      {/* STEP 1 — waiting for provider confirmation */}
      {step === 1 && pending && (
        <section className={`sub-card sub-pending is-${pending.status}`}>
          <div className="sub-pending-head">
            {pending.status === 'pending' && <span className="sub-spinner" aria-hidden="true" />}
            {pending.status === 'completed' && <CheckCircle2 size={28} className="text-emerald-600" />}
            {pending.status === 'failed' && <AlertTriangle size={28} className="text-rose-600" />}
            <div>
              <h2 className="sub-card-title m-0">
                {pending.status === 'failed'
                  ? t('Payment not confirmed')
                  : pending.status === 'completed' ? t('Payment confirmed') : t('Waiting for your approval')}
              </h2>
              <p className="sub-muted">
                {pending.status === 'failed'
                  ? t('The provider did not confirm this payment. No subscription was activated.')
                  : pending.status === 'completed'
                    ? t('Payment confirmed. Your subscription is active.')
                    : `${t('Approve the payment prompt on')} ${pending.phoneNumber}. ${t('This page checks the status automatically.')}`}
              </p>
            </div>
          </div>

          <dl className="sub-details">
            {[
              ['Plan', pending.plan],
              ['Amount', formatCurr(pending.amount)],
              ['Provider', PAYMENT_METHODS.find((m) => m.id === pending.paymentMethod)?.label || pending.paymentMethod],
              ['Phone', pending.phoneNumber || '—'],
              ['Reference', pending.reference || '—'],
            ].map(([k, v]) => (
              <div key={k}><dt>{t(k)}</dt><dd>{v}</dd></div>
            ))}
          </dl>

          <div className="sub-actions">
            {pending.status !== 'pending' && (
              <button type="button" className="sub-btn-secondary" onClick={() => { setPending(null); setStep(0); setMessage('') }}>
                {t('Choose another plan')}
              </button>
            )}
            {pending.status === 'pending' && (
              <button type="button" className="sub-btn-primary" onClick={checkPayment}>
                {t('Check status now')}
              </button>
            )}
          </div>
        </section>
      )}

      {/* STEP 2 — receipt */}
      {step === 2 && receipt && (
        <section className="sub-card sub-receipt">
          <div className="sub-receipt-head">
            <CheckCircle2 size={40} className="text-emerald-500" />
            <h2>{t('Subscription payment confirmed')}</h2>
            <p className="sub-muted">{t('Your provider-confirmed payment activated access for this subscription period.')}</p>
          </div>
          <dl className="sub-details">
            {[
              ['Receipt', receipt.receiptNumber],
              ['Plan', receipt.plan],
              ['Amount paid', formatCurr(receipt.amount)],
              ['Payment method', receipt.paymentMethod],
              ['Access until', receipt.endDate ? new Date(receipt.endDate).toLocaleDateString() : '—'],
            ].map(([label, value]) => (
              <div key={label}><dt>{t(label)}</dt><dd>{value || '—'}</dd></div>
            ))}
          </dl>
          <div className="sub-actions">
            <button type="button" className="sub-btn-secondary" onClick={() => { setStep(0); setPending(null); setMessage('') }}>
              {t('Back to plans')}
            </button>
            <button type="button" className="sub-btn-primary" onClick={downloadReceipt}>
              <Download size={16} /> {t('Download receipt')}
            </button>
          </div>
        </section>
      )}

      {/* Quick renew with the chosen billing period */}
      {sub && step === 0 && availablePlans.length > 0 && (
        <section className="sub-card sub-quick">
          <div className="min-w-0">
            <h2 className="sub-card-title m-0">{sub.isActive ? t('Quick renew') : t('Quick activate')}</h2>
            <p className="sub-muted">
              {t('Uses the billing period, payment method and phone number selected above.')}
            </p>
          </div>
          <div className="sub-quick-buttons">
            {availablePlans.map((p) => (
              <button key={p.id} type="button" className="sub-btn-secondary" onClick={() => handleRenew(p)} disabled={loading}>
                {sub.isActive ? t('Renew') : t('Activate')} {p.name}
              </button>
            ))}
          </div>
        </section>
      )}

      {loading && !sub && <p className="sub-muted text-center">{t('Loading…')}</p>}
    </div>
  )
}
