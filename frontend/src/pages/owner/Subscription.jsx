import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOwner } from '../../context/OwnerContext'
import { AlertTriangle, Download, ArrowLeft, CalendarDays, CheckCircle2, ShieldCheck } from 'lucide-react'

const PLANS = [
  { id: 'monthly', label: 'Monthly', months: 1, hint: 'Full features, billed every month' },
  { id: 'quarterly', label: 'Quarterly', months: 3, hint: 'Full features, billed every 3 months' },
  { id: 'annually', label: 'Annually', months: 12, hint: 'Full features, billed every 12 months' },
]

const PAYMENT_METHODS = [
  { id: 'momo', label: 'MoMo (MTN Mobile Money)', hint: 'A USSD prompt is sent to your phone to confirm payment' },
  { id: 'airtel', label: 'Airtel Money', hint: 'A USSD prompt is sent to your phone to confirm payment' },
]

const CURRENCY = 'RWF'
const formatCurr = (v) =>
  new Intl.NumberFormat('en-RW', { style: 'currency', currency: CURRENCY, minimumFractionDigits: 0 }).format(v || 0)

export default function Subscription() {
  const navigate = useNavigate()
  const {
    fetchSubscription, fetchAvailableSubscriptionPlans, selectSubscriptionPlan,
    fetchReceipt, renewSubscription, loading,
  } = useOwner()

  const [sub, setSub] = useState(null)
  const [availablePlans, setAvailablePlans] = useState([])
  const [step, setStep] = useState(0)
  const [message, setMessage] = useState('')

  const [selectedPlan, setSelectedPlan] = useState(null)
  const [paymentMethod, setPaymentMethod] = useState('momo')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [pending, setPending] = useState(null)
  const [receipt, setReceipt] = useState(null)

  const load = useCallback(async () => {
    try {
      const data = await fetchSubscription()
      setSub(data)
    } catch (e) { console.error(e) }
    try {
      const plans = await fetchAvailableSubscriptionPlans()
      setAvailablePlans(plans)
      setSelectedPlan((current) => current || plans[0] || null)
    } catch (e) { console.error(e) }
  }, [fetchSubscription, fetchAvailableSubscriptionPlans])

  useEffect(() => {
    load()
    const refresh = window.setInterval(load, 30000)
    window.addEventListener('focus', load)
    return () => {
      window.clearInterval(refresh)
      window.removeEventListener('focus', load)
    }
  }, [load])

  const amountFor = () => {
    if (!selectedPlan) return 0
    const monthly = Number(selectedPlan.priceMonthly || 0)
    const cycle = String(selectedPlan.billingCycle || 'monthly').toLowerCase()
    if (cycle === 'quarterly') {
      const discount = Number(selectedPlan.discountQuarterly ?? 8)
      return Math.round(monthly * 3 * (1 - discount / 100))
    }
    if (cycle === 'annually' || cycle === 'yearly') {
      const discount = Number(selectedPlan.discountAnnually ?? 14)
      const yearly = Number(selectedPlan.priceYearly) || Math.round(monthly * 12 * (1 - discount / 100))
      return Number(yearly)
    }
    return monthly
  }

  const handleSelectPlan = async () => {
    setMessage('')
    try {
      if (!phoneNumber) {
        return setMessage('❌ Phone number is required to receive the USSD prompt.')
      }
      if (!selectedPlan) {
        return setMessage('❌ Select a subscription plan first.')
      }
      const cycle = String(selectedPlan.billingCycle || 'monthly').toLowerCase()
      await selectSubscriptionPlan({
        plan: selectedPlan.name.toLowerCase(),
        planId: selectedPlan.id,
        paymentMethod,
        phoneNumber,
        billingCycle: cycle,
      })
      setMessage('✅ Payment request submitted. Please complete the payment on your phone. You will be redirected to login.')
      setStep(1)
      setTimeout(() => navigate('/login', { replace: true }), 3000)
    } catch (e) { setMessage('❌ ' + e.message) }
  }

  const handleRenew = async (plan) => {
    setMessage('')
    try {
      const cycle = String(plan.billingCycle || 'monthly').toLowerCase()
      await renewSubscription({
        plan: plan.name.toLowerCase(),
        planId: plan.id,
        billingCycle: cycle,
      })
      setMessage('✅ Renewal request submitted. Please complete the payment. You will be redirected to login.')
      setTimeout(() => navigate('/login', { replace: true }), 3000)
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
          <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">Owner workspace</p>
          <h1 className="text-3xl font-extrabold text-slate-950">{sub?.isActive ? 'Choose Your Subscription Plan' : 'Activate Your Subscription'}</h1>
          <p className="text-base text-slate-600 mt-2">
            {sub?.isActive
              ? 'Select the perfect plan for your business. Upgrade or downgrade anytime.'
              : 'Select a plan and complete payment. A platform administrator will verify your payment and activate your subscription.'}
          </p>
        </div>
      </div>

      {message && notice(message, message.startsWith('❌') ? 'warn' : 'ok')}

      {sub && !sub.isActive && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-6">
          <h2 className="text-amber-800 flex items-center gap-2 font-bold"><AlertTriangle size={18} /> Subscription Not Active</h2>
          <p className="text-slate-600 mt-1 text-sm">Complete the steps below. After you submit payment, wait for the platform administrator to verify and activate your subscription.</p>
        </div>
      )}

      {sub && (
        <div className="bg-slate-900 rounded-lg grid grid-cols-2 md:grid-cols-4 gap-0 p-4">
          <div className="p-4 border-l border-white/15 first:border-l-0">
            <span className="block text-slate-400 text-xs">Current Plan</span>
            <strong className="text-white text-base">{sub.plan || 'Free'}</strong>
          </div>
          <div className="p-4 border-l border-white/15">
            <span className="block text-slate-400 text-xs">Status</span>
            <strong className="text-white text-base">{sub.isActive ? 'Active' : (sub.paymentStatus === 'pending' ? 'Pending Verification' : 'Inactive')}</strong>
          </div>
          <div className="p-4 border-l border-white/15">
            <span className="block text-slate-400 text-xs">Days Remaining</span>
            <strong className="text-white text-base">{sub.daysRemaining ?? 0}</strong>
          </div>
          <div className="p-4 border-l border-white/15">
            <span className="block text-slate-400 text-xs">Next Renewal</span>
            <strong className="text-white text-base">{sub.nextRenewalDate ? new Date(sub.nextRenewalDate).toLocaleDateString() : '—'}</strong>
          </div>
        </div>
      )}

      {sub?.aboutToExpire && sub.isActive && notice('⚠ Your subscription expires soon. Renew now to avoid service interruption.', 'warn')}

      {step === 0 && <div className="rounded-xl border border-blue-100 bg-blue-50 px-6 py-4 flex flex-wrap gap-x-8 gap-y-3 text-sm"><strong>All plans include</strong>{['All Core Features', '24/7 Support', 'Regular Updates', 'Secure & Reliable'].map((item) => <span key={item} className="inline-flex items-center gap-2"><CheckCircle2 size={16} className="text-blue-600" />{item}</span>)}<span className="ml-auto inline-flex items-center gap-2 text-indigo-700"><ShieldCheck size={18} />30-Day Money Back Guarantee</span></div>}

      {/* STEP 0 — Select plan */}
      {step === 0 && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">1 · Choose Subscription Plan</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {availablePlans.map((p, index) => {
              const selected = selectedPlan?.id === p.id
              const color = index === 1 ? 'text-emerald-600' : index === 2 ? 'text-violet-600' : 'text-blue-600'
              const planName = p.name || ''
              const months = planName.toLowerCase() === 'quarterly' ? 3 : planName.toLowerCase() === 'annually' ? 12 : 1
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
                    <span className="text-sm text-slate-500 font-normal">/{planName === 'Monthly' ? 'month' : planName === 'Quarterly' ? 'quarter' : 'year'}</span>
                  </div>
                  <ul className="grid gap-1.5 pl-5 text-sm text-slate-500">
                    <li>✓ {months} month{months > 1 ? 's' : ''} of access</li>
                    <li>✓ Auto-renewal reminders</li>
                    <li>✓ Full system features</li>
                  </ul>
                </div>
              )
            })}
          </div>

          <h2 className="text-lg font-bold text-slate-900 mt-6 mb-4">2 · Payment Method</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {PAYMENT_METHODS.map((m) => {
              const selected = paymentMethod === m.id
              return (
                <label key={m.id} className={`flex items-center gap-3 border rounded-lg p-3 cursor-pointer transition ${selected ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200'}`}>
                  <input type="radio" name="pm" checked={selected} onChange={() => setPaymentMethod(m.id)} />
                  <div>
                    <div className="font-semibold text-slate-900">{m.label}</div>
                    <div className="text-xs text-slate-500">{m.hint}</div>
                  </div>
                </label>
              )
            })}
          </div>

          <div className="mt-4 grid gap-1.5">
            <label className="font-semibold text-sm text-slate-700">Phone Number (to receive USSD)</label>
            <input type="tel" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="+250700000000" className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
          </div>

          <div className="flex justify-end items-center gap-3 mt-4">
            <span className="ml-auto font-semibold text-sm text-slate-700">
              Amount due: <strong className="text-indigo-600">{formatCurr(amountFor())}</strong>
            </span>
            <button className="bg-indigo-600 hover:bg-indigo-800 text-white border border-indigo-600 px-4 py-2 rounded-lg font-semibold text-sm transition disabled:opacity-50" onClick={handleSelectPlan} disabled={loading}>
              Continue to Payment
            </button>
          </div>
        </div>
      )}

      {/* STEP 1 — Pending Verification */}
      {step === 1 && pending && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">3 · Pending Verification</h2>
          <div className="grid gap-2 mt-4">
            {[
              ['Plan', pending.plan],
              ['Amount', formatCurr(pending.amount)],
              ['Method', pending.paymentMethod],
              ['Phone', pending.phoneNumber || '—'],
            ].map(([k, v]) => (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-100 rounded-lg" key={k}>
                <span className="text-slate-500 text-sm">{k}</span>
                <strong className="text-slate-900 text-sm">{v}</strong>
              </div>
            ))}
          </div>

          <div className="mt-4 border border-amber-300 bg-amber-50 rounded-lg p-4">
            <p className="font-semibold text-amber-800">
              Your payment request is awaiting verification by the platform administrator.
            </p>
            <p className="mt-2 text-amber-800 text-sm">
              Please ensure you have completed the payment on your phone. The administrator will review and activate your subscription shortly.
            </p>
          </div>

          <div className="flex justify-end gap-3 mt-4">
            <button className="text-slate-700 bg-white border border-slate-300 px-4 py-2 rounded-lg font-semibold text-sm hover:bg-slate-100 transition" onClick={() => setStep(0)}>Back</button>
            <button className="bg-indigo-600 hover:bg-indigo-800 text-white border border-indigo-600 px-4 py-2 rounded-lg font-semibold text-sm transition disabled:opacity-50" onClick={load} disabled={loading}>
              {loading ? 'Refreshing...' : 'Check Status'}
            </button>
          </div>
        </div>
      )}

      {/* Quick renew / choose plan */}
      {sub && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">{sub.isActive ? 'Renew Subscription' : 'Choose a Plan to Activate'}</h2>
          <p className="mt-0 text-sm text-slate-500">
            {sub.isActive
              ? 'Pick a plan to extend your current subscription.'
              : 'Pick a plan to activate your subscription.'}
          </p>
          <div className="flex flex-wrap gap-2 mt-4">
            {availablePlans.map((p) => (
              <button key={p.id} className="text-slate-700 bg-white border border-slate-300 px-4 py-2 rounded-lg font-semibold text-sm hover:bg-slate-100 transition" onClick={() => handleRenew(p)}>
                {sub.isActive ? 'Renew' : 'Activate'} {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading && <p className="text-center text-slate-400">Loading…</p>}
    </div>
  )
}
