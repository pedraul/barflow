import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import * as api from '../../api/endpoints'
import { usePreferences } from '../../context/PreferencesContext'

const money = (value) => `${Number(value || 0).toLocaleString()} RWF`

export default function ApprovePayrolls() {
  const { t } = usePreferences()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState(null)
  const [checking, setChecking] = useState(null)

  const load = () => {
    api.fetchPendingPayrolls()
      .then((data) => setItems(data || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const approve = async (id, name) => {
    try {
      const result = await api.approvePayroll(id)
      setMsg(result.status === 'failed'
        ? `${t('Payout failed for')} ${name || t('worker')}: ${result.message || result.providerStatus || t('provider rejected it.')}`
        : result.status === 'pending'
          ? result.message
          : `${t('Payout started for')} ${name || t('worker')} ${t('to')} ${result.phone}. ${t('It will show as paid after the provider confirms it.')}`)
      load()
    } catch (e) {
      setMsg(e.message || t('Approval failed.'))
    }
  }

  const checkStatus = async (id) => {
    setChecking(id)
    try {
      const result = await api.checkPayrollPayoutStatus(id)
      setMsg(result.status === 'Paid'
        ? `${t('Provider confirmed the salary payout to')} ${result.phone}.`
        : result.status === 'failed'
          ? `${t('Provider reported a failed salary payout to')} ${result.phone}.`
          : `${t('Payout is still processing with the provider')} (${result.providerStatus || t('pending')}).`)
      load()
    } catch (e) {
      setMsg(e.message || t('Unable to check payout status.'))
    } finally {
      setChecking(null)
    }
  }

  const reject = async (id, name) => {
    try {
      await api.rejectPayroll(id)
      setMsg(`${t('Payroll rejected.')} ${name || t('Worker')} ${t('will not be paid.')}`)
      load()
    } catch (e) {
      setMsg(e.message || t('Rejection failed.'))
    }
  }

  return (
    <div className="page manager-approve">
      <div className="user-page-heading">
        <div><p className="eyebrow">{t('Manager workspace')}</p><h1>{t('Approve payrolls')}</h1><p>{t('Salary payouts awaiting your approval.')}</p></div>
      </div>
      <section className="user-section">
        {loading ? <p>{t('Loading…')}</p> : items.length ? (
           <div className="user-table-wrap"><table className="user-table">
             <thead><tr><th>{t('Worker')}</th><th>{t('Phone')}</th><th>{t('Gross')}</th><th>{t('Net Pay')}</th><th>{t('Method')}</th><th>{t('Status')}</th><th>{t('Period')}</th><th>{t('Action')}</th></tr></thead>
             <tbody>{items.map((p, i) => (
               <tr key={p.id || i}><td>{p.name}</td><td>{p.phone || '—'}</td><td>{money(p.grossAmount)}</td><td><strong>{money(p.netAmount)}</strong></td><td style={{ textTransform: 'capitalize' }}>{p.method || '—'}</td><td>{p.status}{p.providerStatus ? ` (${p.providerStatus})` : ''}</td><td>{p.period || '—'}</td>
                 <td className="user-actions">
                    {p.status === 'pending' && <>
                      <button type="button" className="pay-action" onClick={() => approve(p.id, p.name)}>{t('Approve & Pay')}</button>
                      <button type="button" className="secondary-action" onClick={() => reject(p.id, p.name)} style={{ marginLeft: '8px' }}>{t('Reject')}</button>
                    </>}
                    {p.status === 'processing' && (
                      <button type="button" className="secondary-action" disabled={checking === p.id} onClick={() => checkStatus(p.id)}>
                        {checking === p.id ? t('Checking…') : t('Check payout')}
                      </button>
                    )}
                    {p.status === 'failed' && <span>{t('Failed — contact provider before retrying')}</span>}
                 </td></tr>
             ))}</tbody>
           </table></div>
        ) : <p>{t('No pending payrolls.')} <Link to="/manager/transfer">{t('Back')}</Link></p>}
        {msg && <p className="creation-success"><span>✓</span>{msg}</p>}
      </section>
    </div>
  )
}
