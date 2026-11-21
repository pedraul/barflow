import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import * as api from '../../api/endpoints'
import { usePreferences } from '../../context/PreferencesContext'

const money = (value) => `${Number(value || 0).toLocaleString()} RWF`

export default function ApproveTransfers() {
  const { t } = usePreferences()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState(null)

  const load = () => {
    api.fetchPendingTransfers()
      .then((data) => setItems(data || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const approve = async (id, name) => {
    try {
      const result = await api.approveTransfer(id)
      setMsg(result.status === 'approved'
        ? `${t('Transfer to')} ${name || t('recipient')} ${t('confirmed by the provider.')}`
        : result.status === 'processing'
          ? `${t('Transfer to')} ${name || t('recipient')} ${t('was submitted and is awaiting provider confirmation.')}`
          : result.message || `${t('Transfer to')} ${name || t('recipient')} ${t('was not completed')} (${result.status}).`)
      load()
    } catch (e) {
      setMsg(e.message || t('Approval failed.'))
    }
  }

  const checkStatus = async (id, name) => {
    try {
      const result = await api.checkTransferPayoutStatus(id)
      setMsg(result.status === 'approved'
        ? `${t('Transfer to')} ${name || t('recipient')} ${t('confirmed by the provider.')}`
        : result.status === 'failed'
          ? `${t('Transfer to')} ${name || t('recipient')} ${t('failed at the provider.')}`
          : `${t('Transfer to')} ${name || t('recipient')} ${t('is still processing')} (${result.providerStatus || t('no update')}).`)
      load()
    } catch (e) {
      setMsg(e.message || t('Could not check transfer status.'))
    }
  }

  const reject = async (id, name) => {
    try {
      await api.rejectTransfer(id)
      setMsg(`${t('Transfer to')} ${name || t('recipient')} ${t('rejected. Money was not sent.')}`)
      load()
    } catch (e) {
      setMsg(e.message || t('Rejection failed.'))
    }
  }

  return (
    <div className="page manager-approve">
      <div className="user-page-heading">
        <div><p className="eyebrow">{t('Manager workspace')}</p><h1>{t('Approve transfers')}</h1><p>{t('Outgoing transfers awaiting your approval.')}</p></div>
      </div>
      <section className="user-section">
        {loading ? <p>{t('Loading…')}</p> : items.length ? (
          <div className="user-table-wrap"><table className="user-table">
             <thead><tr><th>{t('From')}</th><th>{t('To Phone')}</th><th>{t('Provider')}</th><th>{t('Amount')}</th><th>{t('Purpose')}</th><th>{t('Status / Action')}</th></tr></thead>
            <tbody>{items.map((transfer, i) => (
              <tr key={transfer.id || i}><td>{transfer.name}</td><td>{transfer.phone}</td><td>{transfer.method === 'mtn_momo' ? 'MTN MoMo' : 'Airtel Money'}</td><td>{money(transfer.amount)}</td><td>{transfer.purpose}</td>
                <td className="user-actions">
                  {transfer.status === 'processing' ? (
                    <button type="button" className="pay-action" onClick={() => checkStatus(transfer.id, transfer.phone)}>{t('Check status')}</button>
                  ) : (
                    <>
                      <button type="button" className="pay-action" onClick={() => approve(transfer.id, transfer.phone)}>{t('Approve & send')}</button>
                      <button type="button" className="secondary-action" onClick={() => reject(transfer.id, transfer.phone)} style={{ marginLeft: '8px' }}>{t('Reject')}</button>
                    </>
                  )}
                  <small>
                    {transfer.status === 'processing' ? `Provider: ${transfer.providerStatus || 'pending'}` : ''}
                    {transfer.payoutReference ? ` | Ref: ${transfer.payoutReference}` : ''}
                  </small>
                </td></tr>
            ))}</tbody>
          </table></div>
        ) : <p>{t('No pending transfers.')} <Link to="/manager/transfer">{t('Back')}</Link></p>}
        {msg && <p className="creation-success">{msg}</p>}
      </section>
    </div>
  )
}
