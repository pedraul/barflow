import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOwner } from '../../context/OwnerContext'
import { AlertTriangle, Download, ArrowLeft } from 'lucide-react'

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

const STEPPER = ['Select Plan', 'Payment & Verify', 'Receipt']

export default function Subscription() {
  const navigate = useNavigate()
  const {
    fetchSubscription, fetchSystemSettings, selectSubscriptionPlan, verifySubscriptionPayment,
    fetchReceipt, renewSubscription, loading,
  } = useOwner()

  const [sub, setSub] = useState(null)
  const [prices, setPrices] = useState({ monthly: 50000, quarterly: 130000, annually: 480000 })
  const [discounts, setDiscounts] = useState({ monthly: 0, quarterly: 8, annually: 14 })
  const [step, setStep] = useState(0)
  const [message, setMessage] = useState('')

  const [plan, setPlan] = useState('monthly')
  const [paymentMethod, setPaymentMethod] = useState('momo')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [pending, setPending] = useState(null)
  const [ussdCode, setUssdCode] = useState('')
  const [receipt, setReceipt] = useState(null)

  const load = useCallback(async () => {
    try {
      const data = await fetchSubscription()
      setSub(data)
    } catch (e) { console.error(e) }
    try {
      const settings = await fetchSystemSettings()
      const s = settings?.settings || {}
      setPrices({
        monthly: Number(s.subscription_monthly_price) || 50000,
        quarterly: Number(s.subscription_quarterly_price) || 130000,
        annually: Number(s.subscription_annually_price) || 480000,
      })
      const q = Number(s.subscription_quarterly_discount)
      const a = Number(s.subscription_annually_discount)
      setDiscounts({
        monthly: 0,
        quarterly: Number.isFinite(q) ? q : 8,
        annually: Number.isFinite(a) ? a : 14,
      })
    } catch (e) { /* keep defaults */ }
  }, [fetchSubscription, fetchSystemSettings])

  useEffect(() => {
    load()
    const refresh = window.setInterval(load, 30000)
    window.addEventListener('focus', load)
    return () => {
      window.clearInterval(refresh)
      window.removeEventListener('focus', load)
    }
  }, [load])

  const amountFor = (p) => {
    const discount = discounts[p] || 0
    return Math.round((prices[p] || 0) * (1 - discount / 100))
  }

  const handleSelectPlan = async () => {
    setMessage('')
    try {
      if (!phoneNumber) {
        return setMessage('❌ Phone number is required to receive the USSD prompt.')
      }
      const res = await selectSubscriptionPlan({ plan, paymentMethod, phoneNumber })
      setPending(res)
      setMessage(`✅ USSD prompt sent to ${phoneNumber}. Choose 1 and enter your PIN to pay ${formatCurr(res.amount)}.`)
      setStep(1)
    } catch (e) { setMessage('❌ ' + (e.message || 'Failed to select plan')) }
  }

  const handleVerify = async () => {
    setMessage('')
    try {
      const code = ussdCode || pending?.ussdCode
      if (!code) return setMessage('❌ Enter the USSD code sent to your phone.')
      const res = await verifySubscriptionPayment(code)
      setMessage(`✅ Payment verified! Receipt ${res.receiptNumber || ''} generated.`)
      await load()
      const r = await fetchReceipt().catch(() => null)
      setReceipt(r)
      setStep(2)
    } catch (e) { setMessage('❌ ' + (e.message || 'Verification failed')) }
  }

  const handleRenew = async (p) => {
    setMessage('')
    try {
      const res = await renewSubscription(p)
      setMessage(`✅ Subscription renewal initiated (${res?.plan || p}). Please check your phone for verification framework.`);
      await load()
      // If payment is automated/instant background resolution, proceed straight to receipt.
      // Otherwise route back to verification panel step index.
      if (res?.paymentStatus === 'verified' || sub?.isActive) {
        const r = await fetchReceipt().catch(() => null)
        setReceipt(r)
        setStep(2)
      } else {
        setPending(res || { plan: p, amount: amountFor(p), paymentMethod, phoneNumber })
        setStep(1)
      }
    } catch (e) { setMessage('❌ ' + (e.message || 'Renewal process failed')) }
  }

  const downloadReceipt = () => {
    const data = receipt || sub
    if (!data) return setMessage('❌ No active receipt parameters available to compile.')

    const lines = [
      'BARFLOW — SUBSCRIPTION RECEIPT',
      '--------------------------------',
      `Receipt No: ${data.receiptNumber || sub?.receiptNumber || 'N/A'}`,
      `Business:   ${data.businessName || 'N/A'}`,
      `Plan:       ${data.plan || sub?.plan || 'N/A'}`,
      `Amount:     ${formatCurr(data.amount ?? sub?.amountPaid ?? 0)}`,
      `Method:     ${data.paymentMethod || sub?.paymentMethod || 'N/A'}`,
      `Phone:      ${data.phoneNumber || sub?.phoneNumber || 'N/A'}`,
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

  const renderStepper = () => (
    <div className="bg-slate-900 rounded-lg p-4 grid grid-cols-3 gap-4 my-6">
      {STEPPER.map((label, i) => (
        <div key={label}>
          <span className="text-sm text-slate-300">{i + 1}. {label}</span>
          <strong className={`block text-lg ${i <= step ? 'text-indigo-300' : 'text-slate-500'}`}>{i <= step ? '●' : '○'}</strong>
        </div>
      ))}
    </div>
  )

  const notice = (text, type) => (
    <div className={`p-3 rounded-lg text-sm font-medium border ${type === 'warn' ? 'bg-amber-50 border-amber-300 text-amber-800' : 'bg-emerald-50 border-emerald-300 text-emerald-800'}`}>{text}</div>
  )

  return (
    <div className="p-6 space-y-6 max-w-[1180px] mx-auto w-full relative">
      <div className="flex justify-between items-start gap-4">
        <div>
          <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">Owner workspace</p>
          <h1 className="text-2xl font-extrabold text-slate-900">Subscription</h1>
          <p className="text-sm text-slate-500">Manage your plan, make payments and view receipts for the whole system.</p>
        </div>
      </div>

      {message && notice(message, message.startsWith('❌') || message.startsWith('⚠') ? 'warn' : 'ok')}

      {sub && !sub.isActive && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-6">
          <h2 className="text-amber-800 flex items-center gap-2 font-bold"><AlertTriangle size={18} /> No active subscription</h2>
          <p className="text-slate-600 mt-1 text-sm">Your system features are currently locked. Choose a plan below and complete payment to restore access.</p>
        </div>
      )}

      {sub && (
        <div className="bg-slate-900 rounded-lg grid grid-cols-2 md:grid-cols-4 gap-0 p-4 shadow-sm">
          <div className="p-4 border-slate-700 md:border-l first:border-l-0">
            <span className="block text-slate-400 text-xs">Current Plan</span>
            <strong className="text-white text-base">{sub.plan || 'Free'}</strong>
          </div>
          <div className="p-4 border-slate-700 border-l">
            <span className="block text-slate-400 text-xs">Status</span>
            <strong className="text-white text-base">{sub.isActive ? 'Active' : (sub.paymentStatus === 'pending' ? 'Pending Payment' : 'Inactive')}</strong>
          </div>
          <div className="p-4 border-slate-700 border-l">
            <span className="block text-slate-400 text-xs">Days Remaining</span>
            <strong className="text-white text-base">{sub.daysRemaining ?? 0}</strong>
          </div>
          <div className="p-4 border-slate-700 border-l">
            <span className="block text-slate-400 text-xs">Next Renewal</span>
            <strong className="text-white text-base">{sub.nextRenewalDate ? new Date(sub.nextRenewalDate).toLocaleDateString() : '—'}</strong>
          </div>
        </div>
      )}

      {sub?.aboutToExpire && sub.isActive && notice('⚠ Your subscription expires soon. Renew now to avoid service interruption.', 'warn')}

      {renderStepper()}

      {/* STEP 0 — Select plan */}
      {step === 0 && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">1 · Choose Subscription Plan</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {PLANS.map((p) => {
              const selected = plan === p.id
              const discount = discounts[p.id] || 0
              const finalAmount = amountFor(p.id)
              return (
                <div key={p.id}
                  className={`border rounded-lg p-4 grid gap-3 cursor-pointer transition focus:outline-none focus:ring-2 focus:ring-indigo-500 ${selected ? 'border-2 border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:shadow'}`}
                  role="radio" 
                  aria-checked={selected}
                  tabIndex={0}
                  onClick={() => setPlan(p.id)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setPlan(p.id)}>
                  <div className="flex justify-between items-center">
                    <h3 className="font-bold text-slate-900 text-base">{p.label}</h3>
                    {discount > 0 && <span className="text-emerald-700 font-bold text-[10px] bg-emerald-50 px-2 py-0.5 rounded-full">Save {discount}%</span>}
                  </div>
                  <div className="text-2xl font-extrabold text-indigo-600">
                    {formatCurr(finalAmount)}
                    <span className="text-sm text-slate-500 font-normal">/{p.label.toLowerCase().replace('ly', '')}</span>
                  </div>
                  {discount > 0 && (
                    <div className="text-xs text-slate-400 line-through -mt-1">{formatCurr(prices[p.id])}</div>
                  )}
                  <ul className="grid gap-1.5 pl-5 text-sm text-slate-500 list-disc">
                    <li>{p.months} month{p.months > 1 ? 's' : ''} of access</li>
                    <li>Auto-renewal reminders</li>
                    <li>Full system features</li>
                  </ul>
                  <p className="text-[11px] text-slate-400 mt-1 italic">{p.hint}</p>
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
                  <input type="radio" name="pm" checked={selected} onChange={() => setPaymentMethod(m.id)} className="text-indigo-600 focus:ring-indigo-500" />
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

          <div className="flex flex-wrap justify-between items-center gap-4 mt-6 pt-4 border-t border-slate-100">
            <span className="font-semibold text-sm text-slate-700">
              Amount due: <strong className="text-indigo-600 text-lg">{formatCurr(amountFor(plan))}</strong>
            </span>
            <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg font-semibold text-sm transition disabled:opacity-50 shadow-sm" onClick={handleSelectPlan} disabled={loading}>
              Continue to Payment
            </button>
          </div>
        </div>
      )}

      {/* STEP 1 — Payment / USSD & Verification */}
      {step === 1 && pending && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">2 · Complete Payment</h2>
          <div className="grid gap-2 mt-4">
            {[
              ['Plan', pending.plan],
              ['Amount', formatCurr(pending.amount)],
              ['Method', pending.paymentMethod],
              ['Phone', pending.phoneNumber || '—'],
            ].map(([k, v]) => (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50 border border-slate-100 rounded-lg" key={k}>
                <span className="text-slate-500 text-sm">{k}</span>
                <strong className="text-slate-900 text-sm sm:text-right">{v}</strong>
              </div>
            ))}
          </div>

          <div className="mt-4 border border-emerald-200 bg-emerald-50 rounded-lg p-4">
            <p className="font-semibold text-emerald-900">
              A USSD prompt has been sent to <strong>{pending.phoneNumber}</strong> via {PAYMENT_METHODS.find((m) => m.id === pending.paymentMethod)?.label || 'mobile money'}.
            </p>
            <ol className="mt-2 pl-5 text-emerald-800 text-sm leading-7 list-decimal">
              <li>A USSD prompt has appeared on <strong>{pending.phoneNumber}</strong></li>
              <li>From the menu, choose <strong>1</strong> (Pay / Make Payment)</li>
              <li>Enter your <strong>PIN</strong> to confirm paying <strong>{formatCurr(pending.amount)}</strong></li>
              <li>You will receive a confirmation once the payment is approved</li>
            </ol>
            <input value={ussdCode} onChange={(e) => setUssdCode(e.target.value)} placeholder="Enter the verification USSD code or reference code shown on your phone" className="w-full mt-3 px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button className="text-slate-700 bg-white border border-slate-300 px-4 py-2 rounded-lg font-semibold text-sm hover:bg-slate-100 transition" onClick={() => setStep(0)}>Back</button>
            <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg font-semibold text-sm transition disabled:opacity-50 shadow-sm" onClick={handleVerify} disabled={loading}>
              {loading ? 'Verifying…' : 'Verify Payment'}
            </button>
          </div>
        </div>
      )}

      {/* STEP 2 — Receipt */}
      {step === 2 && (receipt || sub?.receiptNumber) && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">3 · Receipt</h2>
          <div className="grid grid-cols-2 gap-3 p-4 bg-slate-50 border border-slate-100 rounded-lg">
            <span className="text-slate-500 text-sm">Receipt No</span><strong className="text-slate-900 text-sm text-right">{receipt?.receiptNumber || sub?.receiptNumber || 'N/A'}</strong>
            <span className="text-slate-500 text-sm">Business</span><strong className="text-slate-900 text-sm text-right">{receipt?.businessName || 'N/A'}</strong>
            <span className="text-slate-500 text-sm">Plan</span><strong className="text-slate-900 text-sm text-right">{receipt?.plan || sub?.plan || 'N/A'}</strong>
            <span className="text-slate-500 text-sm">Amount</span><strong className="text-slate-900 text-sm text-right">{formatCurr(receipt?.amount ?? sub?.amountPaid ?? 0)}</strong>
            <span className="text-slate-500 text-sm">Method</span><strong className="text-slate-900 text-sm text-right">{receipt?.paymentMethod || sub?.paymentMethod || '—'}</strong>
            <span className="text-slate-500 text-sm">Phone</span><strong className="text-slate-900 text-sm text-right">{receipt?.phoneNumber || sub?.phoneNumber || '—'}</strong>
            <span className="text-slate-500 text-sm">Start</span><strong className="text-slate-900 text-sm text-right">{receipt?.startDate ? new Date(receipt.startDate).toLocaleString() : (sub?.startDate ? new Date(sub.startDate).toLocaleString() : '—')}</strong>
            <span className="text-slate-500 text-sm">End</span><strong className="text-slate-900 text-sm text-right">{receipt?.endDate ? new Date(receipt.endDate).toLocaleString() : (sub?.periodEnd ? new Date(sub.periodEnd).toLocaleString() : '—')}</strong>
            <span className="text-slate-500 text-sm">Status</span><strong className="text-slate-900 text-sm text-right">{receipt?.paymentStatus || sub?.paymentStatus || 'verified'}</strong>
          </div>
          <div className="flex flex-wrap justify-end gap-3 mt-6">
            <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-semibold text-sm transition inline-flex items-center gap-2 shadow-sm" onClick={downloadReceipt}><Download size={16} /> Download Receipt</button>
            <button className="text-slate-700 bg-white border border-slate-300 px-4 py-2 rounded-lg font-semibold text-sm hover:bg-slate-100 transition inline-flex items-center gap-2" onClick={() => navigate('/settings')}><ArrowLeft size={16} /> View in Settings</button>
          </div>
        </div>
      )}

      {/* Quick renew (when active) */}
      {sub && sub.isActive && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-1">Renew Subscription</h2>
          <p className="text-sm text-slate-500">Pick a plan to extend your current subscription seamlessly.</p>
          <div className="flex flex-wrap gap-2.5 mt-4">
            {PLANS.map((p) => (
              <button key={p.id} disabled={loading} className="text-slate-700 bg-white border border-slate-300 px-4 py-2 rounded-lg font-semibold text-sm hover:bg-slate-50 transition disabled:opacity-50" onClick={() => handleRenew(p.id)}>
                Renew {p.label} · {formatCurr(amountFor(p.id))}{discounts[p.id] > 0 ? ` (-${discounts[p.id]}%)` : ''}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading && (
        <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] flex items-center justify-center pointer-events-none">
          <p className="text-sm font-semibold text-indigo-600 bg-white px-3 py-1.5 rounded-full shadow border border-slate-100">Syncing with server...</p>
        </div>
      )}
    </div>
  )
}
