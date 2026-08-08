import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import * as api from '../../api/endpoints'

const money = (value) => `${Number(value || 0).toLocaleString()} RWF`

export default function ApproveRefunds() {
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
      setMsg(`Refund for order ${order || 'N/A'} approved.`)
      load()
    } catch (e) {
      setMsg(e.message || 'Approval failed.')
    }
  }

  const reject = async (id, order) => {
    try {
      await api.rejectRefund(id)
      setMsg(`Refund for order ${order || 'N/A'} rejected.`)
      load()
    } catch (e) {
      setMsg(e.message || 'Rejection failed.')
    }
  }

  return (
    <div className="page manager-approve">
      <div className="user-page-heading">
        <div><p className="eyebrow">Manager workspace</p><h1>Approve refunds</h1><p>Refund requests awaiting your approval.</p></div>
      </div>
      <section className="user-section">
        {loading ? <p>Loading…</p> : items.length ? (
          <div className="user-table-wrap"><table className="user-table">
            <thead><tr><th>Order</th><th>Amount</th><th>Reason</th><th>Action</th></tr></thead>
            <tbody>{items.map((r, i) => (
              <tr key={r.id || i}><td>{r.order}</td><td>{money(r.amount)}</td><td>{r.reason}</td>
                <td className="user-actions">
                   <button type="button" className="pay-action" onClick={() => approve(r.id, r.order)}>Approve</button>
                   <button type="button" className="secondary-action" onClick={() => reject(r.id, r.order)} style={{ marginLeft: '8px' }}>Reject</button>
                </td></tr>
            ))}</tbody>
          </table></div>
        ) : <p>No pending refunds. <Link to="/manager/transfer">Back</Link></p>}
        {msg && <p className="creation-success"><span>✓</span>{msg}</p>}
      </section>
    </div>
  )
}
