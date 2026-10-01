import React from 'react'
import { useMemo, useState } from 'react'
import { useUsers } from '../context/UsersContext'
import { useAuditLog } from '../context/AuditLogContext'

const branches = ['Head Office', 'Kigali Heights', 'Remera Branch']
const roles = ['Owner', 'Manager', 'Accountant', 'Cashier', 'Waiter']

const permissionSummary = {
  Owner: 'Full access, billing, branches, reports, data export, and all staff accounts.',
  Manager: 'Branch staff, stock, refunds, adjustments, reports, and shifts.',
  Accountant: 'Financial summaries, reconciliation, tax, and financial exports.',
  Cashier: 'Payments, receipts, refunds with approval, and till reconciliation.',
  Waiter: 'Orders, menu availability, own-order changes, and customer bills.',
}

export default function UserManagementPage({ accessRole, embedded = false }) {
  const { users, updateUser, removeUser } = useUsers()
  const { log: auditLog } = useAuditLog()

  const [selectedIds, setSelectedIds] = useState([])
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState({ role: 'All', branch: 'All', status: 'All' })
  const [editing, setEditing] = useState(null)
  const [activity, setActivity] = useState(['Owner created the initial staff accounts.'])

  const visibleUsers = useMemo(() => users.filter((user) => {
    const textMatches = `${user.name} ${user.email}`.toLowerCase().includes(query.toLowerCase())
    return textMatches && (filters.role === 'All' || user.role === filters.role) && (filters.branch === 'All' || user.branch === filters.branch) && (filters.status === 'All' || user.status === filters.status)
  }), [users, query, filters])

  const canManage = (user) => accessRole === 'Owner' || user.role !== 'Owner'
  const log = (message) => setActivity((current) => [message, ...current].slice(0, 6))
  const saveEdit = (event) => {
    event.preventDefault()
    updateUser(editing.id, editing)
    log(`${accessRole} updated ${editing.name}'s account.`)
    setEditing(null)
  }
  const deleteUser = (user) => {
    if (!canManage(user) || !window.confirm(`Deactivate ${user.name}'s account? Historical orders and records will be preserved.`)) return
    removeUser(user.id)
    auditLog({ actor: accessRole, action: `Deleted user ${user.name}'s account`, type: 'user' })
    setSelectedIds((current) => current.filter((id) => id !== user.id))
    log(`${accessRole} deleted ${user.name}'s account.`)
  }
  const bulkUpdate = (status) => {
    const allowedIds = selectedIds.filter((id) => canManage(users.find((user) => user.id === id)))
    if (!allowedIds.length) return
    allowedIds.forEach((id) => updateUser(id, { status }))
    log(`${accessRole} ${status.toLowerCase()} ${allowedIds.length} selected account(s).`)
    setSelectedIds([])
  }
  const toggleSelected = (id) => setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])

  const content = (
    <>
      <section className="user-section">
        <div className="user-toolbar">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or email" aria-label="Search users" />
          <select value={filters.role} onChange={(event) => setFilters({ ...filters, role: event.target.value })}><option>All</option>{roles.map((role) => <option key={role}>{role}</option>)}</select>
          <select value={filters.branch} onChange={(event) => setFilters({ ...filters, branch: event.target.value })}><option>All</option>{branches.map((branch) => <option key={branch}>{branch}</option>)}</select>
          <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option>All</option><option>Active</option><option>Inactive</option></select>
          <button type="button" className="secondary-action" onClick={() => bulkUpdate('Active')}>Activate selected</button>
          <button type="button" className="secondary-action" onClick={() => bulkUpdate('Inactive')}>Deactivate selected</button>
        </div>
        <div className="user-table-wrap"><table className="user-table"><thead><tr><th><input type="checkbox" aria-label="Select all visible users" checked={visibleUsers.length > 0 && visibleUsers.every((user) => selectedIds.includes(user.id))} onChange={(event) => setSelectedIds(event.target.checked ? visibleUsers.map((user) => user.id) : [])} /></th><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Branch</th><th>Status</th><th>Last login</th><th>Actions</th></tr></thead><tbody>{visibleUsers.map((user) => <tr key={user.id}><td><input type="checkbox" checked={selectedIds.includes(user.id)} onChange={() => toggleSelected(user.id)} /></td><td>{user.name}</td><td>{user.email}</td><td>{user.phone || '—'}</td><td>{user.role}</td><td>{user.branch}</td><td><span className={user.status === 'Active' ? 'user-active' : 'user-inactive'}>{user.status}</span></td><td>{user.lastLogin}</td><td className="user-actions"><button type="button" onClick={() => setEditing({ ...user })} disabled={!canManage(user)}>Edit</button><button type="button" onClick={() => deleteUser(user)} disabled={!canManage(user)}>Delete</button></td></tr>)}</tbody></table></div>
      </section>

      <div className="user-info-grid">
        <details className="user-section permission-summary"><summary>Role permissions summary</summary>{Object.entries(permissionSummary).map(([role, description]) => <p key={role}><strong>{role}:</strong> {description}</p>)}</details>
        <section className="user-section activity-log"><h2>Account activity</h2>{activity.map((item, index) => <p key={`${item}-${index}`}>{item}</p>)}</section>
      </div>

      {editing && <div className="modal-backdrop"><form className="confirm-dialog edit-user-dialog" onSubmit={saveEdit}><h2>Edit user</h2><label>Name<input value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} required /></label><label>Role<select value={editing.role} onChange={(event) => setEditing({ ...editing, role: event.target.value })}>{roles.map((role) => <option key={role}>{role}</option>)}</select></label><label>Branch<select value={editing.branch} onChange={(event) => setEditing({ ...editing, branch: event.target.value })}>{branches.map((branch) => <option key={branch}>{branch}</option>)}</select></label><label>Status<select value={editing.status} onChange={(event) => setEditing({ ...editing, status: event.target.value })}><option>Active</option><option>Inactive</option></select></label><label>Reset password<input type="password" placeholder="Enter new password" /></label><div><button type="button" className="secondary-action" onClick={() => setEditing(null)}>Cancel</button><button type="submit" className="pay-action">Save changes</button></div></form></div>}
    </>
  )

  return embedded ? content : (
    <div className="page user-management-page">
      <div className="user-page-heading"><div><p className="eyebrow">{accessRole} workspace</p><h1>User management</h1><p>Create, maintain, and monitor staff accounts.</p></div></div>
      {content}
    </div>
  )
}
