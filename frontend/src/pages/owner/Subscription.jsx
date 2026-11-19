import React, { useEffect, useState, useCallback } from 'react'
import { useOwner } from '../../context/OwnerContext'
import { AlertTriangle, Download, ArrowLeft, CalendarDays, CheckCircle2, ShieldCheck } from 'lucide-react'
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

  const [selectedPlan, setSelectedPlan] = useState(null)
  const [billingCycle, setBillingCycle] = useState('monthly')
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
      setSelectedPlan((current) => current || plans[0] || null)
    } catch (e) { console.error(e) }
  }, [fetchSubscription, fetchAvailableSubscriptionPlans])

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

  const notice = (text, type) => (
    <div className={`p-3 rounded-lg text-sm font-medium border ${type === 'warn' ? 'bg-amber-50 border-amber-300 text-amber-800' : 'bg-emerald-50 border-emerald-300 text-emerald-800'}`}>{text}</div>
  )

  return (
    <div className="p-8 space-y-7 max-w-[1280px] mx-auto w-full bg-white min-h-full">
      <div className="flex justify-between items-start gap-4">
        <div>
          <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">{t('Owner workspace')}</p>
          <h1 className="text-3xl font-extrabold text-slate-950">{sub?.isActive ? t('Choose Your Subscription Plan') : t('Activate Your Subscription')}</h1>
          <p className="text-base text-slate-600 mt-2">
            {sub?.isActive
              ? t('Select the perfect plan for your business. Upgrade or downgrade anytime.')
              : t('Select a plan and approve the mobile-money payment request. Access activates automatically after the provider confirms payment.')}
          </p>
        </div>
      </div>

      {message && notice(message, message.startsWith('❌') ? 'warn' : 'ok')}

      {sub && !sub.isActive && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-6">
          <h2 className="text-amber-800 flex items-center gap-2 font-bold"><AlertTriangle size={18} /> {t('Subscription Not Active')}</h2>
          <p className="text-slate-600 mt-1 text-sm">
            {sub.unpaidAccessGranted
              ? t('A platform administrator has granted access without payment. This is separate from a paid subscription.')
              : t('Complete payment below. The provider verifies it automatically and activates your subscription.')}
          </p>
        </div>
      )}

      {sub && (
        <div className="bg-slate-900 rounded-lg grid grid-cols-2 md:grid-cols-4 gap-0 p-4">
          <div className="p-4 border-l border-white/15 first:border-l-0">
            <span className="block text-slate-400 text-xs">{t('Current Plan')}</span>
            <strong className="text-white text-base">{sub.plan || t('Free')}</strong>
          </div>
          <div className="p-4 border-l border-white/15">
            <span className="block text-slate-400 text-xs">{t('Status')}</span>
            <strong className="text-white text-base">{sub.isActive ? t('Active') : (sub.unpaidAccessGranted ? t('Admin access granted') : (sub.paymentStatus === 'pending' ? t('Awaiting payment') : t('Inactive')))}</strong>
          </div>
          <div className="p-4 border-l border-white/15">
            <span className="block text-slate-400 text-xs">{t('Days Remaining')}</span>
            <strong className="text-white text-base">{sub.daysRemaining ?? 0}</strong>
          </div>
          <div className="p-4 border-l border-white/15">
            <span className="block text-slate-400 text-xs">{t('Next Renewal')}</span>
            <strong className="text-white text-base">{sub.nextRenewalDate ? new Date(sub.nextRenewalDate).toLocaleDateString() : '—'}</strong>
          </div>
        </div>
      )}

      {sub?.aboutToExpire && sub.isActive && notice(t('⚠ Your subscription expires soon. Renew now to avoid service interruption.'), 'warn')}

      {step === 0 && <div className="rounded-xl border border-blue-100 bg-blue-50 px-6 py-4 flex flex-wrap gap-x-8 gap-y-3 text-sm"><strong>{t('All plans include')}</strong>{['All Core Features', '24/7 Support', 'Regular Updates', 'Secure & Reliable'].map((item) => <span key={item} className="inline-flex items-center gap-2"><CheckCircle2 size={16} className="text-blue-600" />{t(item)}</span>)}<span className="ml-auto inline-flex items-center gap-2 text-indigo-700"><ShieldCheck size={18} />{t('30-Day Money Back Guarantee')}</span></div>}

      {/* STEP 0 — Select plan */}
      {step === 0 && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">{t('1 · Choose Subscription Plan')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {availablePlans.map((p, index) => {
              const selected = selectedPlan?.id === p.id
              const color = index === 1 ? 'text-emerald-600' : index === 2 ? 'text-violet-600' : 'text-blue-600'
              const planName = p.name || ''
              const months = billingCycle === 'quarterly' ? 3 : billingCycle === 'annually' ? 12 : 1
              return (
                <div key={p.id}
                  className={`border rounded-xl p-6 min-h-[500px] flex flex-col gap-4 cursor-pointer transition shadow-sm ${selected ? 'border-2 border-indigo-500 ring-4 ring-indigo-50' : 'border-slate-200 hover:shadow-md'}`}
                  role="radio"
                  aria-checked={selected}
                  tabIndex={0}
                  onClick={() => setSelectedPlan(p)}
                  onKeyDown={(e) => e.key === 'Enter' && setSelectedPlan(p)}>
                  <div className="flex justify-between items-center">
                    <h3 className={`font-bold text-2xl ${color}`}>{planName}</h3><CalendarDays size={28} className={color} />
                  </div>
                  <div className={`text-2xl font-extrabold ${color}`}>
                    {formatCurr(p.priceMonthly)}
                    <span className="text-sm text-slate-500 font-normal">{t('/month')}</span>
                  </div>
                  <ul className="grid gap-1.5 pl-5 text-sm text-slate-500">
                    <li>✓ {months} {t('month')}{months > 1 ? 's' : ''} {t('of access')}</li>
                    <li>{t('✓ Auto-renewal reminders')}</li>
                    <li>{t('✓ Full system features')}</li>
                  </ul>
                </div>
              )
            })}
          </div>

          <h2 className="text-lg font-bold text-slate-900 mt-6 mb-4">{t('2 · Billing Cycle')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              ['monthly', 'Monthly', 'Billed every month'],
              ['quarterly', 'Quarterly', 'Billed every 3 months'],
              ['annually', 'Annually', 'Billed every 12 months'],
            ].map(([cycle, label, hint]) => (
              <label key={cycle} className={`flex items-start gap-3 border rounded-lg p-3 cursor-pointer transition ${billingCycle === cycle ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200'}`}>
                <input type="radio" name="billingCycle" value={cycle} checked={billingCycle === cycle} onChange={() => setBillingCycle(cycle)} />
                <span>
                  <span className="block font-semibold text-slate-900">{t(label)}</span>
                  <span className="block text-xs text-slate-500">{t(hint)}</span>
                </span>
              </label>
            ))}
          </div>

          <h2 className="text-lg font-bold text-slate-900 mt-6 mb-4">{t('3 · Payment Method')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {PAYMENT_METHODS.map((m) => {
              const selected = paymentMethod === m.id
              return (
                <label key={m.id} className={`flex items-center gap-3 border rounded-lg p-3 cursor-pointer transition ${selected ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200'}`}>
                  <input type="radio" name="pm" checked={selected} onChange={() => setPaymentMethod(m.id)} />
                  <div>
                    <div className="font-semibold text-slate-900">{t(m.label)}</div>
                    <div className="text-xs text-slate-500">{t(m.hint)}</div>
                  </div>
                </label>
              )
            })}
          </div>

          <div className="mt-4 grid gap-1.5">
            <label className="font-semibold text-sm text-slate-700">{t('Mobile-money phone number')}</label>
            <input type="tel" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder={t('+250700000000')} className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
          </div>

          <div className="flex justify-end items-center gap-3 mt-4">
            <span className="ml-auto font-semibold text-sm text-slate-700">
              {t('Amount due:')} <strong className="text-indigo-600">{formatCurr(amountFor())}</strong>
            </span>
            <button className="bg-indigo-600 hover:bg-indigo-800 text-white border border-indigo-600 px-4 py-2 rounded-lg font-semibold text-sm transition disabled:opacity-50" onClick={handleSelectPlan} disabled={loading}>
              {t('Continue to Payment')}
            </button>
          </div>
        </div>
      )}

      {/* STEP 1 — Provider confirmation */}
      {step === 1 && pending && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">{t('3 · Payment status')}</h2>
          <div className="grid gap-2 mt-4">
            {[
              ['Plan', pending.plan],
              ['Amount', formatCurr(pending.amount)],
              ['Provider', PAYMENT_METHODS.find((m) => m.id === pending.paymentMethod)?.label || pending.paymentMethod],
              ['Phone', pending.phoneNumber || '—'],
              ['Reference', pending.reference || '—'],
            ].map(([k, v]) => (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-100 rounded-lg" key={k}>
                <span className="text-slate-500 text-sm">{k}</span>
                <strong className="text-slate-900 text-sm">{v}</strong>
              </div>
            ))}
          </div>

          <div className={`mt-4 border rounded-lg p-4 ${pending.status === 'failed' ? 'border-red-300 bg-red-50' : 'border-blue-200 bg-blue-50'}`}>
            <p className="font-semibold text-slate-900">
              {pending.status === 'failed'
                ? t('The provider did not confirm this payment. No subscription was activated.')
                : pending.status === 'completed'
                  ? t('Payment confirmed. Your subscription is active.')
                  : `Approve the payment prompt on ${pending.phoneNumber}. This page checks payment status automatically.`}
            </p>
          </div>

          <div className="flex justify-end gap-3 mt-4">
            {pending.status !== 'pending' && (
              <button
                className="text-slate-700 bg-white border border-slate-300 px-4 py-2 rounded-lg font-semibold text-sm hover:bg-slate-100 transition"
                onClick={() => { setPending(null); setStep(0); setMessage('') }}
              >
                {t('Choose another plan')}
              </button>
            )}
            <button className="bg-indigo-600 hover:bg-indigo-800 text-white border border-indigo-600 px-4 py-2 rounded-lg font-semibold text-sm transition disabled:opacity-50" onClick={checkPayment} disabled={pending.status !== 'pending'}>
              {pending.status === 'pending' ? t('Check status now') : pending.status === 'completed' ? t('Payment confirmed') : t('Payment failed')}
            </button>
          </div>
        </div>
      )}

      {step === 2 && receipt && (
        <div className="bg-white border border-emerald-200 rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-bold text-emerald-800 mb-4">{t('Subscription payment confirmed')}</h2>
          <p className="text-sm text-slate-600 mb-4">{t('Your provider-confirmed payment activated access for this subscription period.')}</p>
          <div className="grid gap-2">
            {[
              ['Receipt', receipt.receiptNumber],
              ['Plan', receipt.plan],
              ['Amount paid', formatCurr(receipt.amount)],
              ['Payment method', receipt.paymentMethod],
              ['Access until', receipt.endDate ? new Date(receipt.endDate).toLocaleDateString() : '—'],
            ].map(([label, value]) => (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50 rounded-lg" key={label}>
                <span className="text-slate-500 text-sm">{label}</span>
                <strong className="text-slate-900 text-sm">{value || '—'}</strong>
              </div>
            ))}
          </div>
          <button className="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-semibold text-sm" onClick={downloadReceipt}>
            {t('Download receipt')}
          </button>
        </div>
      )}

      {/* Quick renew / choose plan */}
      {sub && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">{sub.isActive ? t('Renew Subscription') : t('Choose a Plan to Activate')}</h2>
          <p className="mt-0 text-sm text-slate-500">
            {sub.isActive
              ? t('Pick a plan to extend your current subscription.')
              : t('Pick a plan to activate your subscription.')}
          </p>
          <div className="flex flex-wrap gap-2 mt-4">
            {availablePlans.map((p) => (
              <button key={p.id} className="text-slate-700 bg-white border border-slate-300 px-4 py-2 rounded-lg font-semibold text-sm hover:bg-slate-100 transition" onClick={() => handleRenew(p)}>
                {sub.isActive ? t('Renew') : t('Activate')} {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading && <p className="text-center text-slate-400">{t('Loading…')}</p>}
    </div>
  )
}
