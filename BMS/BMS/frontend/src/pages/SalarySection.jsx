import React from 'react'
import { useMemo, useState } from 'react'
import { useUsers } from '../context/UsersContext'
import { useSalary } from '../context/SalaryContext'
import { useAuditLog } from '../context/AuditLogContext'

const money = (value) => `${Number(value || 0).toLocaleString()} RWF`

export default function SalarySection({ readOnly = false, actor = 'Owner' }) {
  const { users } = useUsers()
  const { salaryPayments, recordSalaryPayment } = useSalary()
  const { log: auditLog } = useAuditLog()
  const [paying, setPaying] = useState(null)
  const [method, setMethod] = useState('mtn')

  const totalSalary = useMemo(() => users.reduce((sum, user) => sum + (Number(user.salary) || 0), 0), [users])

  const completePayment = () => {
    recordSalaryPayment({
      name: paying.name,
      phone: paying.phone,
      amount: Number(paying.salary) || 0,
      method,
      actor,
      time: new Date().toLocaleString(),
    })
    auditLog({ actor, action: `Salary payment of ${money(paying.salary)} sent to ${paying.name} via ${method === 'airtel' ? 'Airtel Money' : 'MTN Mobile Money'}`, type: 'salary' })
    setPaying(null)
  }

  return (
    <section className="user-section">
      <h2>Salary</h2>
      <div className="summary-card"><strong>{money(totalSalary)}</strong><span>Total monthly payroll</span></div>
      <div className="user-table-wrap"><table className="user-table"><thead><tr><th>Name</th><th>Role</th><th>Branch</th><th>Phone</th><th>Salary</th>{!readOnly && <th>Actions</th>}</tr></thead><tbody>
        {users.map((user) => (
          <tr key={user.id}>
            <td>{user.name}</td>
            <td>{user.role}</td>
            <td>{user.branch}</td>
            <td>{user.phone || '—'}</td>
            <td>{user.salary ? money(user.salary) : '—'}</td>
            {!readOnly && (
              <td className="user-actions">
                <button type="button" className="pay-action" disabled={!user.salary || !user.phone} onClick={() => { setPaying(user); setMethod('mtn') }}>Pay</button>
              </td>
            )}
          </tr>
        ))}
      </tbody></table></div>

      {!readOnly && paying && (
        <div className="modal-backdrop"><form className="confirm-dialog edit-user-dialog" onSubmit={(event) => event.preventDefault()}>
          <h2>Pay salary</h2>
          <p>Send <strong>{money(paying.salary)}</strong> to <strong>{paying.name}</strong> via mobile money.</p>
          <div className="payment-methods">
            <span className="payment-method-label">Pay with</span>
            <div className="payment-method-grid">
              <button type="button" className={`pay-method mtn${method === 'mtn' ? ' active' : ''}`} onClick={() => setMethod('mtn')}><span>MTN</span><small>Mobile Money</small></button>
              <button type="button" className={`pay-method airtel${method === 'airtel' ? ' active' : ''}`} onClick={() => setMethod('airtel')}><span>Airtel</span><small>Money</small></button>
            </div>
          </div>
          <label className="order-waiter">Customer phone number
            <input type="tel" value={paying.phone || ''} readOnly />
          </label>
          <div className="create-user-form-actions">
            <button type="button" className="secondary-action" onClick={() => { setPaying(null) }}>Cancel</button>
            <button type="button" className="pay-action" onClick={completePayment} disabled={!paying.phone}>Pay Now</button>
          </div>
        </form></div>
      )}

      <h3>Salary payment log</h3>
      <div className="activity-log">
        {salaryPayments.length ? (
          salaryPayments.map((payment) => (
            <p key={payment.id}><strong>{payment.actor}</strong> paid {payment.name}'s salary ({money(payment.amount)}) via {payment.method === 'airtel' ? 'Airtel Money' : 'MTN Mobile Money'} to {payment.phone} <span className="muted">· {payment.time}</span></p>
          ))
        ) : <p>No salary payments recorded yet.</p>}
      </div>
    </section>
  )
}
