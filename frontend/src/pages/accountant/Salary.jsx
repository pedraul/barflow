import React, { useState, useEffect } from 'react'
import { useUsers } from '../../context/UsersContext'
import { useSalary } from '../../context/SalaryContext'
import { useAuditLog } from '../../context/AuditLogContext'
import * as api from '../../api/endpoints'
import { usePreferences } from '../../context/PreferencesContext'

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
  const { t } = usePreferences()
  const { users: contextUsers, error: usersError } = useUsers()
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
      setDirectLoading(true)
      setDirectError(null)
      api.fetchUsers()
        .then((data) => { if (active) setDirectUsers(data || []) })
        .catch((err) => { if (active) setDirectError(err.response?.data?.error || err.message) })
        .finally(() => { if (active) setDirectLoading(false) })
    }
    return () => { active = false }
  }, [contextUsers])

  // Payroll changes saved on this page, shown immediately on top of the loaded list.
  const [overrides, setOverrides] = useState({})
  const baseUsers = (contextUsers && contextUsers.length > 0) ? contextUsers : directUsers
  const users = baseUsers.map((u) => (overrides[u.id] ? { ...u, ...overrides[u.id] } : u))
  const [editError, setEditError] = useState(null)
  const [savingEdit, setSavingEdit] = useState(false)

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
    const bonus = Number(editForm.bonus)
    if (!Number.isFinite(bonus) || bonus < 0) {
      setEditError(t('Bonus must be zero or a positive amount.'))
      return
    }
    setSavingEdit(true)
    setEditError(null)
    try {
      const updated = await api.updatePayrollDetails(editingUser.id, {
        bonus,
        promotion: editForm.promotion,
        phone: editForm.phone,
      })
      setOverrides((current) => ({
        ...current,
        [editingUser.id]: { bonus: updated.bonus, promotion: updated.promotion, phone: updated.phone },
      }))
      setDone(`${t('Saved payroll details for')} ${updated.name}: ${t('bonus')} ${money(updated.bonus)}.`)
      setEditingUser(null)
    } catch (e) {
      setEditError(e.response?.data?.error || e.message || t('Failed to save. Please try again.'))
    } finally {
      setSavingEdit(false)
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
        payPeriodStart: `${new Date().toISOString().slice(0, 7)}-01`,
      })

      auditLog({
        actor: 'Accountant',
        action: `Salary payment request for ${paying.name}: gross ${money(gross)}, tax ${money(tax)}, insurance ${money(insurance)}, net ${money(net)} - pending manager approval`,
        type: 'salary',
      })

      // The server clears a paid bonus so it is not paid again next time.
      if (bonus > 0) setOverrides((current) => ({ ...current, [paying.id]: { ...(current[paying.id] || {}), bonus: 0 } }))
      setDone(`${t('Salary payment request sent to manager for approval.')} ${paying.name} ${t('will receive')} ${money(net)} ${t('once approved.')}${bonus > 0 ? ` ${t('Includes bonus:')} ${money(bonus)}.` : ''}`)
      setPaying(null)
    } catch (e) {
      setError(e.response?.data?.error || e.message || t('Failed to send salary payment request. Please try again.'))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="page accountant-salary">

      <div className="user-page-heading">
        <div>
          <p className="eyebrow">{t('Accountant workspace')}</p>
          <h1>{t('Salary')}</h1>
          <p>{t('Workers to be paid. Use “Pay” to send a salary request to the manager for approval. The money is sent to the worker\'s number only after the manager approves.')}</p>
        </div>
      </div>

      {(usersError || directError) && (
        <div style={{ background: '#fee2e2', color: '#991b1b', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '14px' }}>
          <strong>{t('Could not load workers:')}</strong> {usersError || directError}
          <br />
          <span style={{ fontSize: '12px', opacity: 0.8 }}>{t('Refresh the page. If this keeps happening, log out and log in again.')}</span>
        </div>
      )}

      {!usersError && !directError && users.length === 0 && !directLoading && (
        <div style={{ background: '#fef3c7', color: '#92400e', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '14px' }}>
          <strong>{t('No workers found.')}</strong> {t('Workers added by the owner or manager will appear here.')}
        </div>
      )}

      {directLoading && users.length === 0 && (
        <div style={{ padding: '12px 16px', marginBottom: '16px', fontSize: '14px', color: '#6b7280' }}>
          {t('Loading workers...')}
        </div>
      )}

      <div className="summary-card" style={{ marginBottom: '20px' }}>
        <strong>{money(totalSalary)}</strong>
        <span>{t('Total monthly payroll (base + bonus)')}</span>
      </div>

      <section className="user-section">
        <div className="user-table-wrap">
          <table className="user-table">
            <thead>
               <tr>
                 <th>{t('Name')}</th>
                 <th>{t('Role')}</th>
                 <th>{t('Base Salary')}</th>
                 <th>{t('Bonus')}</th>
                 <th>{t('Promotion')}</th>
                 <th>{t('Status')}</th>
                 <th>{t('Last Payment')}</th>
                 <th>{t('Phone')}</th>
                 <th>{t('Total')}</th>
                 <th>{t('Action')}</th>
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
                         {user.status || t('Active')}
                       </span>
                     </td>
                     <td>
                       {(() => {
                         const last = (salaryPayments || []).findLast((sp) => sp.name === user.name)
                         if (!last) return '—'
                         const isPending = last.status === 'pending'
                         return (
                           <span style={{ fontSize: 13, color: isPending ? '#e63946' : '#059669', fontWeight: 600 }}>
                             {last.status === 'pending' ? t('Pending approval') : t('Approved')}
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
                        {t('Edit')}
                      </button>
                      <button
                        type="button"
                        className="pay-action"
                        disabled={!user.salary}
                        onClick={() => { setPaying(user); setMethod('mtn') }}
                        style={{ padding: '0.35rem 0.7rem', margin: 0 }}
                      >
                        {t('Pay')}
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
            <h2>{t('Edit')} {editingUser.name}</h2>
            <label>{t('Bonus (RWF)')}
              <input
                type="number"
                value={editForm.bonus}
                onChange={(e) => setEditForm({ ...editForm, bonus: e.target.value })}
                placeholder={t('0')}
              />
            </label>
            <label>{t('Promotion / Note')}
              <input
                type="text"
                value={editForm.promotion}
                onChange={(e) => setEditForm({ ...editForm, promotion: e.target.value })}
                placeholder={t('e.g. Promoted to Senior Waiter')}
              />
            </label>
            <label>{t('Phone Number')}
              <input
                type="tel"
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                placeholder={t('e.g. 0788123456')}
              />
            </label>
            <p style={{ fontSize: 12, color: 'var(--text-4)', margin: '4px 0 0' }}>
              {t('The bonus is added to the next salary payment and then cleared, so it is only paid once.')}
            </p>
            {editError && <div role="alert" style={{ color: '#b91c1c', fontSize: 13, marginTop: 8 }}>{editError}</div>}
            <div className="create-user-form-actions">
              <button type="button" className="secondary-action" onClick={() => { setEditingUser(null); setEditError(null) }}>{t('Cancel')}</button>
              <button type="submit" className="pay-action" disabled={savingEdit}>{savingEdit ? t('Saving…') : t('Save')}</button>
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
               <h2>{t('Send salary payment')}</h2>
               <p>
                 {t('Request to pay')} <strong>{money(gross)}</strong> {t('to')} <strong>{paying.name}</strong> ({paying.phone || t('no phone')}{t(') via mobile money.')}
               </p>
               <p style={{ fontSize: '13px', color: 'var(--text-3)', marginTop: 8 }}>
                 {t('The request will be sent to the manager for approval. Money is only sent after approval.')}
               </p>
              <div style={{ background: '#f9fafb', padding: 12, borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span>{t('Gross Salary')}</span><strong>{money(gross)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: '#dc2626' }}>
                  <span>{t('PAYE Tax (Rwanda)')}</span><strong>-{money(tax)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: '#dc2626' }}>
                  <span>{t('Insurance (RWF 2,000)')}</span><strong>-{money(insurance)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid #e5e7eb', fontWeight: 700, fontSize: 15 }}>
                  <span>{t('Net Pay')}</span><strong style={{ color: '#059669' }}>{money(net)}</strong>
                </div>
              </div>
              {(bonus > 0) && (
                <p style={{ fontSize: '13px', color: 'var(--text-3)' }}>
                  {t('Includes bonus:')} {money(bonus)}
                </p>
              )}
              <div className="payment-methods">
                <span className="payment-method-label">{t('Pay with')}</span>
                <div className="payment-method-grid">
                  <button type="button" className={`pay-method mtn${method === 'mtn' ? ' active' : ''}`} onClick={() => setMethod('mtn')}>
                    <span>{t('MTN')}</span><small>{t('Mobile Money')}</small>
                  </button>
                  <button type="button" className={`pay-method airtel${method === 'airtel' ? ' active' : ''}`} onClick={() => setMethod('airtel')}>
                    <span>{t('Airtel')}</span><small>{t('Money')}</small>
                  </button>
                </div>
              </div>
               {!paying.phone && (
                 <p style={{ color: 'var(--warning-text)', fontSize: '13px', marginTop: '8px' }}>
                   {t('No phone number on file. Adding one will help ensure the salary reaches the right account.')}
                   <button type="button" className="secondary-action" style={{ marginLeft: '8px' }} onClick={() => { setPaying(null); openEdit(paying) }}>{t('Edit')}</button>
                 </p>
               )}
               {error && (
                 <p style={{ color: 'var(--error-text)', fontSize: '13px', marginTop: '8px' }}>{error}</p>
               )}
               <div className="create-user-form-actions">
                 <button type="button" className="secondary-action" onClick={() => { setPaying(null) }} disabled={sending}>{t('Cancel')}</button>
                 <button type="button" className="pay-action" onClick={completePayment} disabled={sending}>
                   {sending ? t('Sending...') : t('Request payment')}
                 </button>
               </div>
            </form>
          </div>
        )
      })()}

      {done && <p className="creation-success">{done}</p>}
    </div>
  )
}
