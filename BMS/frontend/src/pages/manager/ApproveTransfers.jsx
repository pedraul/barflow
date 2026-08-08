import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import * as api from '../../api/endpoints'

const money = (value) => `${Number(value || 0).toLocaleString()} RWF`

export default function ApproveTransfers() {
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
      await api.approveTransfer(id)
      setMsg(`Transfer to ${name || 'recipient'} approved. Money has been sent.`)
      load()
    } catch (e) {
      setMsg(e.message || 'Approval failed.')
    }
  }

  const reject = async (id, name) => {
    try {
      await api.rejectTransfer(id)
      setMsg(`Transfer to ${name || 'recipient'} rejected. Money was not sent.`)
      load()
    } catch (e) {
      setMsg(e.message || 'Rejection failed.')
    }
  }

  return (
    <div className="page manager-approve">
      <div className="user-page-heading">
        <div><p className="eyebrow">Manager workspace</p><h1>Approve transfers</h1><p>Outgoing transfers awaiting your approval.</p></div>
      </div>
      <section className="user-section">
        {loading ? <p>Loading…</p> : items.length ? (
          <div className="user-table-wrap"><table className="user-table">
             <thead><tr><th>From</th><th>To Phone</th><th>Amount</th><th>Purpose</th><th>Action</th></tr></thead>
            <tbody>{items.map((t, i) => (
              <tr key={t.id || i}><td>{t.name}</td><td>{t.phone}</td><td>{money(t.amount)}</td><td>{t.purpose}</td>
                <td className="user-actions">
                   <button type="button" className="pay-action" onClick={() => approve(t.id, t.phone)}>Approve</button>
                   <button type="button" className="secondary-action" onClick={() => reject(t.id, t.phone)} style={{ marginLeft: '8px' }}>Reject</button>
                </td></tr>
            ))}</tbody>
          </table></div>
        ) : <p>No pending transfers. <Link to="/manager/transfer">Back</Link></p>}
        {msg && <p className="creation-success"><span>✓</span>{msg}</p>}
      </section>
    </div>
  )
}
