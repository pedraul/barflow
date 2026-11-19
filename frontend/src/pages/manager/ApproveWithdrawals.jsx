import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import * as api from '../../api/endpoints'
import { usePreferences } from '../../context/PreferencesContext'

const money = (value) => `${Number(value || 0).toLocaleString()} RWF`

export default function ApproveWithdrawals() {
  const { t } = usePreferences()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState(null)

  const load = () => {
    api.fetchPendingWithdrawals()
      .then((data) => setItems(data || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const approve = async (id) => {
    try {
      const result = await api.approveWithdrawal(id)
      setMsg(result.status === 'completed'
        ? t('Withdrawal confirmed by the provider.')
        : result.status === 'processing'
          ? t('Withdrawal was submitted and is awaiting provider confirmation.')
          : result.message || `Withdrawal was not completed (${result.status}).`)
      load()
    } catch (e) {
      setMsg(e.message || t('Approval failed.'))
    }
  }

  const checkStatus = async (id) => {
    try {
      const result = await api.checkWithdrawalPayoutStatus(id)
      setMsg(result.status === 'completed'
        ? t('Withdrawal confirmed by the provider.')
        : result.status === 'failed'
          ? t('Withdrawal failed at the provider.')
          : `${t('Withdrawal is still processing')} (${result.providerStatus || t('no update')}).`)
      load()
    } catch (e) {
      setMsg(e.message || t('Could not check withdrawal status.'))
    }
  }

  const reject = async (id) => {
    try {
      await api.rejectWithdrawal(id)
      setMsg(t('Withdrawal rejected. Money was not sent.'))
      load()
    } catch (e) {
      setMsg(e.message || t('Rejection failed.'))
    }
  }

  return (
    <div className="page manager-approve">
      <div className="user-page-heading">
        <div><p className="eyebrow">{t('Manager workspace')}</p><h1>{t('Approve withdrawals')}</h1><p>{t('Withdrawal requests awaiting your approval.')}</p></div>
      </div>
      <section className="user-section">
        {loading ? <p>{t('Loading…')}</p> : items.length ? (
          <div className="user-table-wrap"><table className="user-table">
            <thead><tr><th>{t('Phone')}</th><th>{t('Provider')}</th><th>{t('Amount')}</th><th>{t('Purpose')}</th><th>{t('Initiated By')}</th><th>{t('Status / Action')}</th></tr></thead>
            <tbody>{items.map((w, i) => (
              <tr key={w.id || i}><td>{w.phoneNumber || '—'}</td><td>{w.method === 'mtn_momo' ? 'MTN MoMo' : 'Airtel Money'}</td><td>{money(w.amount)}</td><td>{w.purpose || ''}</td><td>{w.initiatedBy || '—'}</td>
                <td className="user-actions">
                  {w.status === 'processing' ? (
                    <button type="button" className="pay-action" onClick={() => checkStatus(w.id)}>{t('Check status')}</button>
                  ) : (
                    <>
                      <button type="button" className="pay-action" onClick={() => approve(w.id)}>{t('Approve & send')}</button>
                      <button type="button" className="secondary-action" onClick={() => reject(w.id)} style={{ marginLeft: '8px' }}>{t('Reject')}</button>
                    </>
                  )}
                  <small>
                    {w.status === 'processing' ? `Provider: ${w.providerStatus || 'pending'}` : ''}
                    {w.payoutReference ? ` | Ref: ${w.payoutReference}` : ''}
                  </small>
                </td></tr>
            ))}</tbody>
          </table></div>
        ) : <p>{t('No pending withdrawals.')} <Link to="/manager/transfer">{t('Back')}</Link></p>}
        {msg && <p className="creation-success"><span>✓</span>{msg}</p>}
      </section>
    </div>
  )
}
