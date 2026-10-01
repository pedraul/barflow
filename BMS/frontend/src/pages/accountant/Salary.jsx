import React, { useState, useEffect } from 'react'
import { useUsers } from '../../context/UsersContext'
import { useSalary } from '../../context/SalaryContext'
import { useAuditLog } from '../../context/AuditLogContext'
import { updateUser } from '../../api/endpoints'
import * as api from '../../api/endpoints'

const money = (value) => `${Number(value || 0).toLocaleString()} RWF`

const BRACKETS = [
  { limit: 60000, rate: 0 },
  { limit: 200000, rate: 0.10 },
  { limit: 1000000, rate: 0.15 },
  { limit: Infinity, rate: 0.20 },
]
const INSURANCE = 2000

function calculateTax(gross) {
  const g = Number(gross) || 0
  if (g <= 0) return { gross: 0, tax: 0, insurance: INSURANCE, net: 0 }
  let tax = 0
  let prev = 0
  for (const b of BRACKETS) {
    if (g > prev) {
      const taxable = Math.min(g, b.limit) - prev
      tax += taxable * b.rate
    }
    prev = b.limit
    if (g <= b.limit) break
  }
  const net = Math.max(0, g - Math.round(tax) - INSURANCE)
  return { gross: g, tax: Math.round(tax), insurance: INSURANCE, net }
}

export default function Salary() {
  const { users: contextUsers, updateUser: updateUserCtx, loaded, error: usersError } = useUsers()
  const { recordSalaryPayment, salaryPayments } = useSalary()
  const { log: auditLog } = useAuditLog()
  const [paying, setPaying] = useState(null)
  const [method, setMethod] = useState('mtn')
  const [done, setDone] = useState(null)
  const [error, setError] = useState(null)
  const [sending, setSending] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [editForm, setEditForm] = useState({ bonus: '', promotion: '', phone: '' })
  const [directUsers, setDirectUsers] = useState([])
  const [directLoading, setDirectLoading] = useState(false)
  const [directError, setDirectError] = useState(null)

  useEffect(() => {
    let active = true
    if (!contextUsers || contextUsers.length === 0) {
      console.log('[Salary] contextUsers empty, fetching directly...')
      setDirectLoading(true)
      setDirectError(null)
      api.fetchUsers()
        .then((data) => {
          console.log('[Salary] fetchUsers result:', data)
          if (active) setDirectUsers(data || [])
        })
        .catch((err) => {
          console.error('[Salary] fetchUsers error:', err)
          if (active) setDirectError(err.message)
        })
        .finally(() => { if (active) setDirectLoading(false) })
    } else {
      console.log('[Salary] using contextUsers:', contextUsers.length)
    }
    return () => { active = false }
  }, [contextUsers])

  const users = (contextUsers && contextUsers.length > 0) ? contextUsers : directUsers

  console.log('[Salary] render - users count:', users.length, 'contextUsers:', contextUsers?.length, 'directUsers:', directUsers.length, 'error:', usersError || directError)

  const totalSalary = users.reduce((sum, u) => {
    const base = Number(u.salary) || 0
    const bonus = Number(u.bonus) || 0
    return sum + base + bonus
  }, 0)

  const openEdit = (user) => {
    setEditingUser(user)
    setEditForm({
      bonus: user.bonus || 0,
      promotion: user.promotion || '',
      phone: user.phone || '',
    })
  }

  const saveEdit = async () => {
    if (!editingUser) return
    try {
      await updateUser(editingUser.id, {
        bonus: Number(editForm.bonus) || 0,
        promotion: editForm.promotion,
        phone: editForm.phone,
      })
      await updateUserCtx(editingUser.id, {
        bonus: Number(editForm.bonus) || 0,
        promotion: editForm.promotion,
        phone: editForm.phone,
      })
      setEditingUser(null)
    } catch (e) {
      alert(e.message)
    }
  }

  const completePayment = async () => {
    if (!paying) return
    const bonus = Number(paying.bonus) || 0
    const gross = (Number(paying.salary) || 0) + bonus
    const { tax, insurance, net } = calculateTax(gross)

    setSending(true)
    setError(null)
    try {
      await recordSalaryPayment({
        userId: paying.id,
        name: paying.name,
        phone: paying.phone || '',
        amount: gross,
        method: method === 'airtel' ? 'airtel_money' : 'mtn_momo',
        actor: 'Accountant',
        time: new Date().toLocaleString(),
        bonus,
        promotion: paying.promotion || '',
        payPeriodStart: new Date().toISOString().slice(0, 7),
      })

      auditLog({
        actor: 'Accountant',
        action: `Salary payment request for ${paying.name}: gross ${money(gross)}, tax ${money(tax)}, insurance ${money(insurance)}, net ${money(net)} - pending manager approval`,
        type: 'salary',
      })

      setDone(`Salary payment request sent to manager for approval. ${paying.name} will receive ${money(net)} once approved.`)
      setPaying(null)
    } catch (e) {
      setError(e.message || 'Failed to send salary payment request. Please try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="page accountant-salary">

      <div className="user-page-heading">
        <div>
          <p className="eyebrow">Accountant workspace</p>
          <h1>Salary</h1>
          <p>Workers to be paid. Use “Pay” to send a salary request to the manager for approval. The money is sent to the worker's number only after the manager approves.</p>
        </div>
      </div>

      {(usersError || directError) && (
        <div style={{ background: '#fee2e2', color: '#991b1b', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '14px' }}>
          <strong>Error loading users:</strong> {usersError || directError}
          <br />
          <span style={{ fontSize: '12px', opacity: 0.8 }}>Check browser console and backend logs for details. Make sure the backend is running and you are logged in.</span>
        </div>
      )}

      {!usersError && !directError && users.length === 0 && !directLoading && (
        <div style={{ background: '#fef3c7', color: '#92400e', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '14px' }}>
          <strong>No workers found.</strong> The API returned an empty list.
          <br />
          <span style={{ fontSize: '12px', opacity: 0.8 }}>UsersContext loaded: {loaded ? 'yes' : 'no'} | Context users: {contextUsers?.length || 0} | Direct users: {directUsers.length}</span>
        </div>
      )}

      {directLoading && users.length === 0 && (
        <div style={{ padding: '12px 16px', marginBottom: '16px', fontSize: '14px', color: '#6b7280' }}>
          Loading workers...
        </div>
      )}

      <div className="summary-card" style={{ marginBottom: '20px' }}>
        <strong>{money(totalSalary)}</strong>
        <span>Total monthly payroll (base + bonus)</span>
      </div>

      <section className="user-section">
        <div className="user-table-wrap">
          <table className="user-table">
            <thead>
               <tr>
                 <th>Name</th>
                 <th>Role</th>
                 <th>Base Salary</th>
                 <th>Bonus</th>
                 <th>Promotion</th>
                 <th>Status</th>
                 <th>Last Payment</th>
                 <th>Phone</th>
                 <th>Total</th>
                 <th>Action</th>
               </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const base = Number(user.salary) || 0
                const bonus = Number(user.bonus) || 0
                const total = base + bonus
                return (
                  <tr key={user.id}>
                    <td>{user.name}</td>
                    <td>{user.role}</td>
                    <td>{base ? money(base) : '—'}</td>
                    <td>{bonus ? money(bonus) : '—'}</td>
                    <td>{user.promotion || '—'}</td>
                     <td>
                       <span className={user.status === 'Inactive' ? 'user-inactive' : 'user-active'}>
                         {user.status || 'Active'}
                       </span>
                     </td>
                     <td>
                       {(() => {
                         const last = (salaryPayments || []).findLast((sp) => sp.name === user.name)
                         if (!last) return '—'
                         const isPending = last.status === 'pending'
                         return (
                           <span style={{ fontSize: 13, color: isPending ? '#e63946' : '#059669', fontWeight: 600 }}>
                             {last.status === 'pending' ? 'Pending approval' : 'Approved'}
                           </span>
                         )
                       })()}
                     </td>
                    <td>{user.phone || '—'}</td>
                    <td><strong>{total ? money(total) : '—'}</strong></td>
                    <td className="user-actions" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="secondary-action"
                        onClick={() => openEdit(user)}
                        style={{ padding: '0.35rem 0.7rem', margin: 0 }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="pay-action"
                        disabled={!user.salary}
                        onClick={() => { setPaying(user); setMethod('mtn') }}
                        style={{ padding: '0.35rem 0.7rem', margin: 0 }}
                      >
                        Pay
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Edit Bonus/Promotion/Phone Modal */}
      {editingUser && (
        <div className="modal-backdrop">
          <form className="confirm-dialog edit-user-dialog" onSubmit={(e) => { e.preventDefault(); saveEdit() }}>
            <h2>Edit {editingUser.name}</h2>
            <label>Bonus (RWF)
              <input
                type="number"
                value={editForm.bonus}
                onChange={(e) => setEditForm({ ...editForm, bonus: e.target.value })}
                placeholder="0"
              />
            </label>
            <label>Promotion / Note
              <input
                type="text"
                value={editForm.promotion}
                onChange={(e) => setEditForm({ ...editForm, promotion: e.target.value })}
                placeholder="e.g. Promoted to Senior Waiter"
              />
            </label>
            <label>Phone Number
              <input
                type="tel"
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                placeholder="e.g. 0788123456"
              />
            </label>
            <div className="create-user-form-actions">
              <button type="button" className="secondary-action" onClick={() => setEditingUser(null)}>Cancel</button>
              <button type="submit" className="pay-action">Save</button>
            </div>
          </form>
        </div>
      )}

      {/* Pay Modal */}
      {paying && (() => {
        const bonus = Number(paying.bonus) || 0
        const gross = (Number(paying.salary) || 0) + bonus
        const { tax, insurance, net } = calculateTax(gross)
        return (
          <div className="modal-backdrop">
            <form className="confirm-dialog edit-user-dialog" onSubmit={(e) => e.preventDefault()}>
               <h2>Send salary payment</h2>
               <p>
                 Request to pay <strong>{money(gross)}</strong> to <strong>{paying.name}</strong> ({paying.phone || 'no phone'}) via mobile money.
               </p>
               <p style={{ fontSize: '13px', color: 'var(--text-3)', marginTop: 8 }}>
                 The request will be sent to the manager for approval. Money is only sent after approval.
               </p>
              <div style={{ background: '#f9fafb', padding: 12, borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span>Gross Salary</span><strong>{money(gross)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: '#dc2626' }}>
                  <span>PAYE Tax (Rwanda)</span><strong>-{money(tax)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: '#dc2626' }}>
                  <span>Insurance (RWF 2,000)</span><strong>-{money(insurance)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid #e5e7eb', fontWeight: 700, fontSize: 15 }}>
                  <span>Net Pay</span><strong style={{ color: '#059669' }}>{money(net)}</strong>
                </div>
              </div>
              {(bonus > 0) && (
                <p style={{ fontSize: '13px', color: 'var(--text-3)' }}>
                  Includes bonus: {money(bonus)}
                </p>
              )}
              <div className="payment-methods">
                <span className="payment-method-label">Pay with</span>
                <div className="payment-method-grid">
                  <button type="button" className={`pay-method mtn${method === 'mtn' ? ' active' : ''}`} onClick={() => setMethod('mtn')}>
                    <span>MTN</span><small>Mobile Money</small>
                  </button>
                  <button type="button" className={`pay-method airtel${method === 'airtel' ? ' active' : ''}`} onClick={() => setMethod('airtel')}>
                    <span>Airtel</span><small>Money</small>
                  </button>
                </div>
              </div>
               {!paying.phone && (
                 <p style={{ color: 'var(--warning-text)', fontSize: '13px', marginTop: '8px' }}>
                   No phone number on file. Adding one will help ensure the salary reaches the right account.
                   <button type="button" className="secondary-action" style={{ marginLeft: '8px' }} onClick={() => { setPaying(null); openEdit(paying) }}>Edit</button>
                 </p>
               )}
               {error && (
                 <p style={{ color: 'var(--error-text)', fontSize: '13px', marginTop: '8px' }}>{error}</p>
               )}
               <div className="create-user-form-actions">
                 <button type="button" className="secondary-action" onClick={() => { setPaying(null) }} disabled={sending}>Cancel</button>
                 <button type="button" className="pay-action" onClick={completePayment} disabled={sending}>
                   {sending ? 'Sending...' : 'Request payment'}
                 </button>
               </div>
            </form>
          </div>
        )
      })()}

      {done && <p className="creation-success"><span>✓</span>{done}</p>}
    </div>
  )
}
