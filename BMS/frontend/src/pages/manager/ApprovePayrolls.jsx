import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import * as api from '../../api/endpoints'

const money = (value) => `${Number(value || 0).toLocaleString()} RWF`

export default function ApprovePayrolls() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState(null)

  const load = () => {
    api.fetchPendingPayrolls()
      .then((data) => setItems(data || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const approve = async (id, name) => {
    try {
      await api.approvePayroll(id)
      setMsg(`Payroll approved. ${name || 'Worker'} will receive their salary.`)
      load()
    } catch (e) {
      setMsg(e.message || 'Approval failed.')
    }
  }

  const reject = async (id, name) => {
    try {
      await api.rejectPayroll(id)
      setMsg(`Payroll rejected. ${name || 'Worker'} will not be paid.`)
      load()
    } catch (e) {
      setMsg(e.message || 'Rejection failed.')
    }
  }

  return (
    <div className="page manager-approve">
      <div className="user-page-heading">
        <div><p className="eyebrow">Manager workspace</p><h1>Approve payrolls</h1><p>Salary payouts awaiting your approval.</p></div>
      </div>
      <section className="user-section">
        {loading ? <p>Loading…</p> : items.length ? (
           <div className="user-table-wrap"><table className="user-table">
             <thead><tr><th>Worker</th><th>Phone</th><th>Gross</th><th>Net Pay</th><th>Method</th><th>Period</th><th>Action</th></tr></thead>
             <tbody>{items.map((p, i) => (
               <tr key={p.id || i}><td>{p.name}</td><td>{p.phone || '—'}</td><td>{money(p.grossAmount)}</td><td><strong>{money(p.netAmount)}</strong></td><td style={{ textTransform: 'capitalize' }}>{p.method || '—'}</td><td>{p.period || '—'}</td>
                 <td className="user-actions">
                    <button type="button" className="pay-action" onClick={() => approve(p.id, p.name)}>Approve</button>
                    <button type="button" className="secondary-action" onClick={() => reject(p.id, p.name)} style={{ marginLeft: '8px' }}>Reject</button>
                 </td></tr>
             ))}</tbody>
           </table></div>
        ) : <p>No pending payrolls. <Link to="/manager/transfer">Back</Link></p>}
        {msg && <p className="creation-success"><span>✓</span>{msg}</p>}
      </section>
    </div>
  )
}
