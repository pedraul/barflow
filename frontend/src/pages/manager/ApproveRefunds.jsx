import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import * as api from '../../api/endpoints'
import { usePreferences } from '../../context/PreferencesContext'

const money = (value) => `${Number(value || 0).toLocaleString()} RWF`

export default function ApproveRefunds() {
  const { t } = usePreferences()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState(null)

  const load = () => {
    api.fetchPendingRefunds()
      .then((data) => setItems(data || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const approve = async (id, order) => {
    try {
      await api.approveRefund(id)
      setMsg(`${t('Refund for order')} ${order || 'N/A'} ${t('approved.')}`)
      load()
    } catch (e) {
      setMsg(e.message || t('Approval failed.'))
    }
  }

  const reject = async (id, order) => {
    try {
      await api.rejectRefund(id)
      setMsg(`${t('Refund for order')} ${order || 'N/A'} ${t('rejected.')}`)
      load()
    } catch (e) {
      setMsg(e.message || t('Rejection failed.'))
    }
  }

  return (
    <div className="page manager-approve">
      <div className="user-page-heading">
        <div><p className="eyebrow">{t('Manager workspace')}</p><h1>{t('Approve refunds')}</h1><p>{t('Refund requests awaiting your approval.')}</p></div>
      </div>
      <section className="user-section">
        {loading ? <p>{t('Loading…')}</p> : items.length ? (
          <div className="user-table-wrap"><table className="user-table">
            <thead><tr><th>{t('Order')}</th><th>{t('Amount')}</th><th>{t('Reason')}</th><th>{t('Action')}</th></tr></thead>
            <tbody>{items.map((r, i) => (
              <tr key={r.id || i}><td>{r.order}</td><td>{money(r.amount)}</td><td>{r.reason}</td>
                <td className="user-actions">
                   <button type="button" className="pay-action" onClick={() => approve(r.id, r.order)}>{t('Approve')}</button>
                   <button type="button" className="secondary-action" onClick={() => reject(r.id, r.order)} style={{ marginLeft: '8px' }}>{t('Reject')}</button>
                </td></tr>
            ))}</tbody>
          </table></div>
        ) : <p>{t('No pending refunds.')} <Link to="/manager/transfer">{t('Back')}</Link></p>}
        {msg && <p className="creation-success">{msg}</p>}
      </section>
    </div>
  )
}
