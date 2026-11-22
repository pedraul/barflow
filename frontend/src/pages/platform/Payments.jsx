import React, { useEffect, useMemo, useState } from 'react'
import { fetchPlatformPayments, fetchPaymentStats, refundPayment, settlePayment, confirmPlatformPayment, rejectPlatformPayment } from '../../api/endpoints'
import { useToast } from '../../context/ToastContext'
import { usePreferences } from '../../context/PreferencesContext'

const CURRENCY = 'RWF'
const formatCurr = (v) => new Intl.NumberFormat('en-RW', { style: 'currency', currency: CURRENCY, minimumFractionDigits: 0 }).format(v || 0)
const METHOD_LABEL = { mtn_momo: 'MTN MoMo', airtel_money: 'Airtel Money', bank: 'Bank Transfer', bank_transfer: 'Bank Transfer', cash: 'Cash', pos: 'POS' }
const PAYMENT_STATUS_LABEL = { paid: 'Paid', settled: 'Settled', pending: 'Pending', failed: 'Failed', refunded: 'Refunded' }

export default function Payments() {
  const { showSuccess } = useToast()
  const { t } = usePreferences()
  const [payments, setPayments] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [busy, setBusy] = useState(null)
  const [receipt, setReceipt] = useState(null)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    try {
      const [p, s] = await Promise.all([fetchPlatformPayments(), fetchPaymentStats()])
      setPayments(p)
      setStats(s)
    } catch (e) {
      console.error('Failed to load payments:', e)
    } finally {
      setLoading(false)
    }
  }

  const handleRefund = async (p) => {
    const reason = window.prompt([`${t('Refund')} ${formatCurr(p.amount)} ${t('to')} ${p.business}?`, t('The subscription this payment paid for ends now. Send the money back yourself; this only records the refund.'), t('Optional reason:')].join(String.fromCharCode(10)))
    if (reason === null) return
    setBusy(`${p.id}-refund`)
    try {
      await refundPayment(p.id, reason)
      await load()
      showSuccess(t('Payment updated successfully.'))
    } catch (e) {
      alert(e.response?.data?.error || t('Refund failed.'))
    } finally {
      setBusy(null)
    }
  }

  // Pending payment the provider never confirmed, or a bank transfer you received.
  const handleConfirm = async (p) => {
    const lines = [
      `${t('Confirm that you received')} ${formatCurr(p.amount)} ${t('from')} ${p.business}?`,
      p.payTo ? `${t('Sent to')}: ${p.payTo}` : '',
      p.payerPhone ? `${t('From number')}: ${p.payerPhone}` : '',
      p.payerReference ? `${t('Their transaction ID')}: ${p.payerReference}` : '',
      `${t('Reference')}: ${p.reference}`,
      t('Check your MoMo / bank statement first. Their subscription starts now.'),
    ].filter(Boolean)
    if (!window.confirm(lines.join(String.fromCharCode(10)))) return
    setBusy(`${p.id}-confirm`)
    try {
      const result = await confirmPlatformPayment(p.id)
      await load()
      showSuccess(`${t('Payment confirmed. Receipt')} ${result.receiptNumber || ''}`)
    } catch (e) {
      alert(e.response?.data?.error || t('Could not confirm the payment.'))
    } finally {
      setBusy(null)
    }
  }

  // The money never arrived: close the payment so the business can pay again.
  const handleReject = async (p) => {
    const reason = window.prompt(`${t('Reject the payment of')} ${formatCurr(p.amount)} ${t('from')} ${p.business}?\n${t('Reason (the owner sees it):')}`, t('Payment not received'))
    if (reason === null) return
    setBusy(`${p.id}-reject`)
    try {
      await rejectPlatformPayment(p.id, reason)
      await load()
      showSuccess(t('Payment rejected. The business can start a new payment.'))
    } catch (e) {
      alert(e.response?.data?.error || t('Could not reject the payment.'))
    } finally {
      setBusy(null)
    }
  }

  const handleSettle = async (p) => {
    if (!window.confirm(`${t('Settle payment of')} ${formatCurr(p.amount)} ${t('from')} ${p.business}?`)) return
    setBusy(`${p.id}-settle`)
    try {
      await settlePayment(p.id)
      await load()
      showSuccess(t('Payment updated successfully.'))
    } catch (e) {
      alert(e.response?.data?.error || t('Settle failed.'))
    } finally {
      setBusy(null)
    }
  }

  const filtered = useMemo(() => payments.filter((p) => {
    const matchesQ = !q || [p.business, p.transactionId, p.reference, p.plan, p.payerPhone, p.payerReference, p.payTo].some((v) => (v || '').toLowerCase().includes(q.toLowerCase()))
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'awaiting' ? p.awaitingConfirmation : p.status === statusFilter)
    return matchesQ && matchesStatus
  }), [payments, q, statusFilter])

  const badge = (status) => {
    const map = { paid: 'bg-emerald-100 text-emerald-700', settled: 'bg-blue-100 text-blue-700', pending: 'bg-amber-100 text-amber-700', failed: 'bg-red-100 text-red-700', refunded: 'bg-slate-200 text-slate-600' }
    return <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full capitalize ${map[status] || 'bg-slate-100 text-slate-600'}`}>{typeof PAYMENT_STATUS_LABEL[status] === 'string' ? t(PAYMENT_STATUS_LABEL[status]) : status}</span>
  }

  const exportCsv = () => {
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const header = [t('Payment ID'), t('Business'), t('Plan'), t('Amount'), t('Method'), t('Paid to'), t('From number'), t('Their transaction ID'), t('Reference'), t('Status'), t('Date')].map(cell).join(',') + '\n'
    const rows = filtered.map((p) => [p.id, p.business, p.plan, p.amount, METHOD_LABEL[p.method] ? t(METHOD_LABEL[p.method]) : p.method, p.payTo, p.payerPhone, p.payerReference, p.reference, PAYMENT_STATUS_LABEL[p.status] ? t(PAYMENT_STATUS_LABEL[p.status]) : p.status, p.date ? new Date(p.date).toLocaleString() : ''].map(cell).join(',')).join('\n')
    const blob = new Blob([header + rows], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `payments_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const downloadReceipt = (p) => {
    const lines = [
      'BARFLOW — PAYMENT RECEIPT', '--------------------------------',
      `${t('Payment ID')}:   ${p.id}`, `${t('Business')}:     ${p.business}`, `${t('Plan')}:         ${p.plan} (${p.billingCycle || ''})`,
      `${t('Amount')}:       ${formatCurr(p.amount)}`, `${t('Method')}:       ${typeof METHOD_LABEL[p.method] === 'string' ? t(METHOD_LABEL[p.method]) : p.method}`,
      `${t('Transaction')}:  ${p.transactionId || t('N/A')}`, `${t('Status')}:       ${typeof PAYMENT_STATUS_LABEL[p.status] === 'string' ? t(PAYMENT_STATUS_LABEL[p.status]) : p.status}`,
      `${t('Date')}:         ${p.date ? new Date(p.date).toLocaleString() : t('N/A')}`, '--------------------------------',
      `${t('Generated')}:    ${new Date().toLocaleString()}`,
    ].join('\n')
    const blob = new Blob([lines], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `receipt_${p.transactionId || p.id}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full" /></div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('Payments')}</h1>
          <p className="text-sm text-slate-500 mt-1">{t('Track subscription payments across all businesses')}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCsv} className="px-4 py-2 text-sm bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition inline-flex items-center gap-2">{t('Export')}</button>
          <button onClick={load} className="px-4 py-2 text-sm bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition inline-flex items-center gap-2">{t('Refresh')}</button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard title={t('Total Collected')} value={formatCurr(stats?.collected)} />
        <SummaryCard title={t('Pending')} value={String(stats?.pending ?? 0)} />
        <SummaryCard title={t('Failed')} value={String(stats?.failed ?? 0)} />
        <SummaryCard title={t('Refunded')} value={String(stats?.refunded ?? 0)} />
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search business, transaction, plan...')}
            className="w-full pl-3 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white capitalize focus:ring-2 focus:ring-indigo-500 outline-none">
          <option value="all">{t('All statuses')}</option>
          <option value="awaiting">{t('Awaiting your confirmation')}</option>
          <option value="paid">{t('Paid')}</option>
          <option value="settled">{t('Settled')}</option>
          <option value="pending">{t('Pending')}</option>
          <option value="failed">{t('Failed')}</option>
          <option value="refunded">{t('Refunded')}</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <th className="text-left px-3 py-2 font-semibold">{t('Business')}</th>
                <th className="text-left px-3 py-2 font-semibold">{t('Plan')}</th>
                <th className="text-left px-3 py-2 font-semibold">{t('Amount')}</th>
                <th className="text-left px-3 py-2 font-semibold">{t('Method')}</th>
                <th className="text-left px-3 py-2 font-semibold">{t('Paid to')}</th>
                <th className="text-left px-3 py-2 font-semibold">{t('From / their ID')}</th>
                <th className="text-left px-3 py-2 font-semibold">{t('Reference')}</th>
                <th className="text-left px-3 py-2 font-semibold">{t('Status')}</th>
                <th className="text-left px-3 py-2 font-semibold">{t('Date')}</th>
                <th className="text-right px-3 py-2 font-semibold">{t('Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={10} className="px-3 py-3 text-center text-slate-400">{t('No payments found.')}</td></tr>}
              {filtered.map((p) => (
                <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2 font-semibold text-slate-900">{p.business}</td>
                  <td className="px-3 py-2 text-slate-700">{p.plan}</td>
                  <td className="px-3 py-2 font-medium text-slate-900">{formatCurr(p.amount)}</td>
                  <td className="px-3 py-2 text-slate-700">{t(METHOD_LABEL[p.method] || p.method)}</td>
                  <td className="px-3 py-2 text-slate-700 max-w-[200px]">{p.payTo || '—'}</td>
                  <td className="px-3 py-2 text-slate-600">
                    <div>{p.payerPhone || '—'}</div>
                    {p.payerReference && <div className="font-mono text-[11px] text-slate-500">{p.payerReference}</div>}
                  </td>
                  <td className="px-3 py-2 text-slate-500 font-mono text-xs" title={p.transactionId || ''}>{p.reference || '—'}</td>
                  <td className="px-3 py-2">
                    {badge(p.status)}
                    {p.awaitingConfirmation && <div className="text-[10px] font-semibold text-amber-700 mt-1">{t('Awaiting your confirmation')}</div>}
                    {p.reviewNote && <div className="text-[10px] text-slate-500 mt-1 max-w-[180px]">{p.reviewNote}</div>}
                  </td>
                  <td className="px-3 py-2 text-slate-400">{p.date ? new Date(p.date).toLocaleDateString() : '—'}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1.5">
                      <button title={t('Receipt')} onClick={() => downloadReceipt(p)} className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100">{t('Receipt')}</button>
                      {p.status === 'paid' && (
                        <button title={t('Settle')} onClick={() => handleSettle(p)} disabled={busy === `${p.id}-settle`} className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 disabled:opacity-40">{t('Settle')}</button>
                      )}
                      {p.status === 'pending' && (
                        <button title={t('Confirm payment')} onClick={() => handleConfirm(p)} disabled={busy === `${p.id}-confirm`} className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50 disabled:opacity-40">{t('Confirm')}</button>
                      )}
                      {p.status === 'pending' && (
                        <button title={t('Reject payment')} onClick={() => handleReject(p)} disabled={busy === `${p.id}-reject`} className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-40">{t('Reject')}</button>
                      )}
                      {(p.status === 'paid' || p.status === 'settled') && (
                        <button title={t('Refund')} onClick={() => handleRefund(p)} disabled={busy === `${p.id}-refund`} className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-40">{t('Refund')}</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function SummaryCard({ title, value }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-start justify-between shadow-xs">
      <div className="space-y-1.5">
        <span className="text-[11px] font-bold tracking-wide text-slate-500 uppercase block">{title}</span>
        <p className="text-2xl font-black text-slate-900 tracking-tight">{value}</p>
      </div>
    </div>
  )
}
