import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import * as api from '../../api/endpoints'

const money = (value) => `${Number(value || 0).toLocaleString()} RWF`

export default function ApproveWithdrawals() {
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
      await api.approveWithdrawal(id)
      setMsg('Withdrawal approved. Money has been sent.')
      load()
    } catch (e) {
      setMsg(e.message || 'Approval failed.')
    }
  }

  const reject = async (id) => {
    try {
      await api.rejectWithdrawal(id)
      setMsg('Withdrawal rejected. Money was not sent.')
      load()
    } catch (e) {
      setMsg(e.message || 'Rejection failed.')
    }
  }

  return (
    <div className="page manager-approve">
      <div className="user-page-heading">
        <div><p className="eyebrow">Manager workspace</p><h1>Approve withdrawals</h1><p>Withdrawal requests awaiting your approval.</p></div>
      </div>
      <section className="user-section">
        {loading ? <p>Loading…</p> : items.length ? (
          <div className="user-table-wrap"><table className="user-table">
            <thead><tr><th>Phone</th><th>Amount</th><th>Purpose</th><th>Initiated By</th><th>Action</th></tr></thead>
            <tbody>{items.map((w, i) => (
              <tr key={w.id || i}><td>{w.phoneNumber || '—'}</td><td>{money(w.amount)}</td><td>{w.purpose || ''}</td><td>{w.initiatedBy || '—'}</td>
                <td className="user-actions">
                  <button type="button" className="pay-action" onClick={() => approve(w.id)}>Approve</button>
                  <button type="button" className="secondary-action" onClick={() => reject(w.id)} style={{ marginLeft: '8px' }}>Reject</button>
                </td></tr>
            ))}</tbody>
          </table></div>
        ) : <p>No pending withdrawals. <Link to="/manager/transfer">Back</Link></p>}
        {msg && <p className="creation-success"><span>✓</span>{msg}</p>}
      </section>
    </div>
  )
}
