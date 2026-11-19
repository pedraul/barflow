import React, { useEffect, useState } from 'react'
import { useOwner } from '../../context/OwnerContext'
import { usePreferences } from '../../context/PreferencesContext'

export default function PayrollManagement() {
  const { t } = usePreferences()
  const { fetchSalaries, processPayout, checkPayrollPayout, startPayrollPayout, loading } = useOwner()
  const [payments, setPayments] = useState([])
  const [message, setMessage] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [checking, setChecking] = useState(null)
  const [payPeriod, setPayPeriod] = useState({
    payPeriodStart: new Date().toISOString().slice(0, 10),
    payPeriodEnd: new Date().toISOString().slice(0, 10),
    method: 'mtn_momo',
  })

  useEffect(() => { loadPayments() }, [])

  const loadPayments = async () => {
    try { setPayments(await fetchSalaries()) } catch (e) { console.error(e) }
  }

  const handlePayout = async () => {
    try {
      const result = await processPayout(payPeriod)
      setMessage(`✅ ${result.message}`)
      setShowConfirm(false)
      await loadPayments()
    } catch (e) { setMessage(`❌ ${e.message}`) }
  }

  const handleCheckStatus = async (payment) => {
    setChecking(payment.id)
    try {
      const result = await checkPayrollPayout(payment.id)
      setMessage(result.status === 'Paid'
        ? `✅ ${t('Provider confirmed payment to')} ${result.phone}.`
        : result.status === 'failed'
          ? `❌ ${t('Provider reported payment failure to')} ${result.phone}.`
          : `${t('Payout is still processing')} (${result.providerStatus || t('pending')}).`)
      await loadPayments()
    } catch (e) {
      setMessage(`❌ ${e.message}`)
    } finally {
      setChecking(null)
    }
  }

  const handleSendPayout = async (payment) => {
    setChecking(payment.id)
    try {
      const result = await startPayrollPayout(payment.id)
      setMessage(result.status === 'failed'
        ? `❌ ${t('Payout failed:')} ${result.message || result.providerStatus || t('provider rejected it.')}`
        : result.status === 'pending'
          ? result.message
          : `${t('Payout started to')} ${result.phone}. ${t('Provider confirmation is still required.')}`)
      await loadPayments()
    } catch (e) {
      setMessage(`❌ ${e.message}`)
    } finally {
      setChecking(null)
    }
  }

  const formatCurr = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'RWF', minimumFractionDigits: 0 }).format(v || 0)

  const tdStyle = { padding: '10px 12px', borderBottom: '1px solid #f3f4f6', fontSize: 13 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>{t('Payroll Management')}</h2>
        <button onClick={() => setShowConfirm(true)} style={{
          background: '#10b981', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px',
          cursor: 'pointer', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6,
        }}>
          {t('💰 Run Payroll Payout')}
        </button>
      </div>

      {message && (
        <div style={{
          background: message.startsWith('✅') ? '#d1fae5' : '#fee2e2',
          color: message.startsWith('✅') ? '#065f46' : '#991b1b',
          padding: '10px 14px', borderRadius: 8, fontSize: 13,
        }}>{message}</div>
      )}

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
        <div style={{ background: '#fff', borderRadius: 10, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <span style={{ color: '#6b7280', fontSize: 12, textTransform: 'uppercase' }}>{t('Total Gross')}</span>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#10b981', marginTop: 4 }}>
            {formatCurr(payments.reduce((s, p) => s + (p.grossAmount || 0), 0))}
          </div>
        </div>
        <div style={{ background: '#fff', borderRadius: 10, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <span style={{ color: '#6b7280', fontSize: 12, textTransform: 'uppercase' }}>{t('Total Tax')}</span>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#ef4444', marginTop: 4 }}>
            {formatCurr(payments.reduce((s, p) => s + (p.taxAmount || 0), 0))}
          </div>
        </div>
        <div style={{ background: '#fff', borderRadius: 10, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <span style={{ color: '#6b7280', fontSize: 12, textTransform: 'uppercase' }}>{t('Total Insurance')}</span>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#f59e0b', marginTop: 4 }}>
            {formatCurr(payments.reduce((s, p) => s + (p.insuranceAmount || 0), 0))}
          </div>
        </div>
        <div style={{ background: '#fff', borderRadius: 10, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <span style={{ color: '#6b7280', fontSize: 12, textTransform: 'uppercase' }}>{t('Total Net Payroll')}</span>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#059669', marginTop: 4 }}>
            {formatCurr(payments.reduce((s, p) => s + (p.netAmount || p.amount || 0), 0))}
          </div>
        </div>
      </div>

      {/* Payroll Table */}
      <div style={{ background: '#fff', borderRadius: 12, overflow: 'auto', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <table style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
              {['Employee', 'Email', 'Phone', 'Role', 'Branch', 'Gross', 'Tax', 'Insurance', 'Net Amount', 'Method', 'Status', 'Payment Date', 'Action'].map((h) => (
                <th key={h} style={{ textAlign: 'left', padding: '12px', fontSize: 12, color: '#6b7280', textTransform: 'uppercase' }}>{t(h)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id}>
                <td style={tdStyle}>{p.userName}</td>
                <td style={tdStyle}>{p.email}</td>
                <td style={tdStyle}>{p.phone || '—'}</td>
                <td style={tdStyle}><span style={{ textTransform: 'capitalize' }}>{p.role}</span></td>
                <td style={tdStyle}>{p.branch || '—'}</td>
                <td style={tdStyle}>{formatCurr(p.grossAmount || p.baseSalary)}</td>
                <td style={{ ...tdStyle, color: '#ef4444' }}>{formatCurr(p.taxAmount || 0)}</td>
                <td style={{ ...tdStyle, color: '#f59e0b' }}>{formatCurr(p.insuranceAmount || 0)}</td>
                <td style={{ ...tdStyle, fontWeight: 600, color: '#059669' }}>{formatCurr(p.netAmount || p.amount || 0)}</td>
                <td style={tdStyle}>{p.method || '—'}</td>
                <td style={tdStyle}>
                  <span style={{
                    background: p.status === 'Paid' ? '#d1fae5' : p.status === 'failed' ? '#fee2e2' : '#fef3c7',
                    color: p.status === 'Paid' ? '#065f46' : p.status === 'failed' ? '#991b1b' : '#92400e',
                    padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 500,
                  }}>{p.status}{p.providerStatus ? ` (${p.providerStatus})` : ''}</span>
                </td>
                <td style={{ ...tdStyle, color: '#6b7280', fontSize: 12 }}>
                  {p.paymentDate ? new Date(p.paymentDate).toLocaleDateString() : '—'}
                </td>
                <td style={tdStyle}>
                  {p.status === 'pending' && (
                    <button type="button" disabled={checking === p.id} onClick={() => handleSendPayout(p)}>
                      {checking === p.id ? t('Sending…') : t('Send payout')}
                    </button>
                  )}
                  {p.status === 'processing' && (
                    <button type="button" disabled={checking === p.id} onClick={() => handleCheckStatus(p)}>
                      {checking === p.id ? t('Checking…') : t('Check payout')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
                {!payments.length && <tr><td colSpan={13} style={{ padding: 20, textAlign: 'center', color: '#9ca3af' }}>{t('No payroll records found.')}</td></tr>}
          </tbody>
        </table>
      </div>

      {loading && <div style={{ textAlign: 'center', color: '#9ca3af' }}>{t('Loading...')}</div>}

      {/* Payout Confirmation Modal */}
      {showConfirm && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="responsive-modal" style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }}>
            <h3 style={{ margin: '0 0 8px' }}>{t('Confirm Payroll Payout')}</h3>
            <p style={{ color: '#6b7280', fontSize: 13, margin: '0 0 16px' }}>
              {t('This sends the net payroll amount to every active employee\'s saved phone number. Rwanda PAYE tax and 2,000 RWF insurance will be deducted first. Provider confirmation may take time.')}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: '#6b7280' }}>{t('Mobile money provider')}</label>
              <select value={payPeriod.method}
                onChange={(e) => setPayPeriod({ ...payPeriod, method: e.target.value })}
                style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, width: '100%', boxSizing: 'border-box' }}>
                <option value="mtn_momo">{t('MTN MoMo')}</option>
                <option value="airtel_money">{t('Airtel Money')}</option>
              </select>
              <label style={{ fontSize: 12, color: '#6b7280' }}>{t('Pay Period Start')}</label>
              <input type="date" value={payPeriod.payPeriodStart}
                onChange={(e) => setPayPeriod({ ...payPeriod, payPeriodStart: e.target.value })}
                style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, width: '100%', boxSizing: 'border-box' }} />
              <label style={{ fontSize: 12, color: '#6b7280' }}>{t('Pay Period End')}</label>
              <input type="date" value={payPeriod.payPeriodEnd}
                onChange={(e) => setPayPeriod({ ...payPeriod, payPeriodEnd: e.target.value })}
                style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, width: '100%', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowConfirm(false)} style={{ background: '#e5e7eb', border: 'none', borderRadius: 6, padding: '8px 16px', cursor: 'pointer' }}>{t('Cancel')}</button>
              <button onClick={handlePayout} style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontWeight: 500 }}>
                {t('Confirm Payout')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}