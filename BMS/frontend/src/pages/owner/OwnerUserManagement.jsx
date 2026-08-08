import React from 'react'
import { useMemo, useState } from 'react'
import { useUsers } from '../../context/UsersContext'
import { useAuditLog } from '../../context/AuditLogContext'

const branches = ['Head Office', 'Kigali Heights', 'Remera Branch']
const roles = ['Owner', 'Manager', 'Accountant', 'Cashier', 'Waiter', 'Kitchen', 'Bar']

const capitalize = (value) => (value ? value.charAt(0).toUpperCase() + value.slice(1) : value)

const permissionSummary = [
  { icon: '🔑', role: 'Owner', description: 'Full access, billing, branches, reports, data export, and all staff accounts.' },
  { icon: '⚙️', role: 'Manager', description: 'Branch staff, stock, refunds, adjustments, reports, and shifts.' },
  { icon: '📊', role: 'Accountant', description: 'Financial summaries, reconciliation, tax, and financial exports.' },
  { icon: '💵', role: 'Cashier', description: 'Payments, receipts, refunds with approval, and till reconciliation.' },
  { icon: '🧑‍🍳', role: 'Waiter', description: 'Orders, menu availability, own-order changes, and customer bills.' },
  { icon: '👨‍🍳', role: 'Kitchen', description: 'Prepares food orders, marks them ready, and updates order status.' },
  { icon: '🍺', role: 'Bar', description: 'Prepares drink orders, marks them ready, and updates order status.' },
]

export default function OwnerUserManagement() {
  const { users, addUser, updateUser, removeUser } = useUsers()
  const { log: auditLog } = useAuditLog()

  const [subTab, setSubTab] = useState('registry')
  const [selectedIds, setSelectedIds] = useState([])
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState({ role: 'All', branch: 'All', status: 'All' })
  const [editing, setEditing] = useState(null)
  const [activity, setActivity] = useState([
    'Today, 08:30 AM — Owner created the initial staff accounts.',
    'Today, 08:12 AM — Owner signed in from Head Office.',
  ])

  const visibleUsers = useMemo(
    () =>
      users.filter((user) => {
        const text = `${user.name} ${user.email}`.toLowerCase().includes(query.toLowerCase())
        const roleMatch = filters.role === 'All' || capitalize(user.role) === filters.role
        const branchMatch = filters.branch === 'All' || user.branch === filters.branch
        const statusMatch = filters.status === 'All' || user.status === filters.status
        return text && roleMatch && branchMatch && statusMatch
      }),
    [users, query, filters]
  )

  const allVisibleSelected = visibleUsers.length > 0 && visibleUsers.every((user) => selectedIds.includes(user.id))
  const logActivity = (message) => setActivity((current) => [message, ...current].slice(0, 6))

  const toggleSelected = (id) =>
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  const toggleSelectAll = (event) =>
    setSelectedIds(event.target.checked ? visibleUsers.map((user) => user.id) : [])

  const setStatus = (user, status) => {
    updateUser(user.id, { status })
    auditLog({ actor: 'Owner', action: `${status === 'Active' ? 'Activated' : 'Deactivated'} ${user.name}'s account`, type: 'user' })
    logActivity(`Today — Owner ${status === 'Active' ? 'activated' : 'deactivated'} ${user.name}'s account.`)
  }
  const bulkUpdate = (status) => {
    if (!selectedIds.length) return
    selectedIds.forEach((id) => {
      const user = users.find((item) => item.id === id)
      if (user) updateUser(user.id, { status })
    })
    auditLog({ actor: 'Owner', action: `Bulk ${status.toLowerCase()} ${selectedIds.length} account(s)`, type: 'user' })
    logActivity(`Today — Owner ${status.toLowerCase()} ${selectedIds.length} selected account(s).`)
    setSelectedIds([])
  }
  const deleteUser = (user) => {
    if (!window.confirm(`Delete ${user.name}'s account?`)) return
    removeUser(user.id)
    auditLog({ actor: 'Owner', action: `Deleted ${user.name}'s account`, type: 'user' })
    setSelectedIds((current) => current.filter((id) => id !== user.id))
    logActivity(`Today — Owner deleted ${user.name}'s account.`)
  }
  const saveEdit = (event) => {
    event.preventDefault()
    updateUser(editing.id, editing)
    auditLog({ actor: 'Owner', action: `Updated ${editing.name}'s account`, type: 'user' })
    logActivity(`Today — Owner updated ${editing.name}'s account.`)
    setEditing(null)
  }

  const [createForm, setCreateForm] = useState({
    name: '', email: '', phone: '', password: '', role: 'Waiter', branch: '', salary: '', status: 'Active',
  })
  const [created, setCreated] = useState(false)
  const submitCreate = (event) => {
    event.preventDefault()
    addUser({
      name: createForm.name.trim(),
      email: createForm.email.trim(),
      phone: createForm.phone.trim(),
      password: createForm.password,
      role: createForm.role,
      branch: createForm.branch,
      salary: Number(createForm.salary) || 0,
      status: createForm.status,
      lastLogin: 'Never',
    })
    auditLog({ actor: 'Owner', action: `User account created for ${createForm.name.trim()} (${createForm.role})`, type: 'user' })
    logActivity(`Today — Owner created ${createForm.name.trim()}'s account.`)
    setCreated(true)
  }
  const resetCreate = () => {
    setCreateForm({ name: '', email: '', phone: '', password: '', role: 'Waiter', branch: '', salary: '', status: 'Active' })
    setCreated(false)
  }

  return (
    <div className="owner-command-deck">
      <section className="command-card">
        <p className="eyebrow">Owner workspace</p>
        <h1>BarFlow Command Deck</h1>
        <p className="command-subtitle">
          Run every part of your business from one place. Allocate permissions, provision branch staff, and audit logs.
        </p>
        <div className="command-actions">
          <button type="button" className="pay-action" onClick={() => setSubTab('registry')}>
            User Management
          </button>
          <button type="button" className="secondary-action" onClick={() => { setCreated(false); setSubTab('create') }}>
            + Create Staff Account
          </button>
        </div>
      </section>

      <nav className="obw-subnav" aria-label="Users sections">
        <button type="button" className={`obw-subtab ${subTab === 'registry' ? 'active' : ''}`} onClick={() => setSubTab('registry')}>Staff Registry</button>
        <button type="button" className={`obw-subtab ${subTab === 'create' ? 'active' : ''}`} onClick={() => setSubTab('create')}>+ Create Staff Account</button>
      </nav>

      {subTab === 'create' && (
        <div className="create-user-card">
          <p className="eyebrow">Owner workspace</p>
          <h2>Create user</h2>
          <p>Add a staff account and assign its role, branch, and salary.</p>
          {created ? (
            <div className="creation-success"><span>✓</span><h2>User created</h2><p>{createForm.name}'s account is ready. They can sign in with the email and temporary password you set.</p><button type="button" onClick={resetCreate}>Add another</button></div>
          ) : (
            <form className="create-user-form" onSubmit={submitCreate}>
              <label>Full name<input value={createForm.name} onChange={(event) => setCreateForm({ ...createForm, name: event.target.value })} placeholder="e.g. Aline Uwimana" required /></label>
              <label>Email address<input type="email" value={createForm.email} onChange={(event) => setCreateForm({ ...createForm, email: event.target.value })} placeholder="name@business.rw" required /></label>
              <label>Phone number<input type="tel" value={createForm.phone} onChange={(event) => setCreateForm({ ...createForm, phone: event.target.value })} placeholder="+250 78…" required /></label>
              <label>Temporary password<input type="password" value={createForm.password} onChange={(event) => setCreateForm({ ...createForm, password: event.target.value })} placeholder="Set a temporary password" required minLength="8" /></label>
              <label>Role<select value={createForm.role} onChange={(event) => setCreateForm({ ...createForm, role: event.target.value })}>{roles.map((role) => <option key={role}>{role}</option>)}</select></label>
              <label>Branch assignment<input value={createForm.branch} onChange={(event) => setCreateForm({ ...createForm, branch: event.target.value })} placeholder="Type branch name" required /></label>
              <label>Salary<input type="number" min="0" step="100" value={createForm.salary} onChange={(event) => setCreateForm({ ...createForm, salary: event.target.value })} placeholder="e.g. 150000" required /></label>
              <label>Account status<select value={createForm.status} onChange={(event) => setCreateForm({ ...createForm, status: event.target.value })}><option>Active</option><option>Inactive</option></select></label>
              <div className="create-user-form-actions"><button type="submit">Create user</button></div>
            </form>
          )}
        </div>
      )}

      {subTab === 'registry' && (
      <div className="command-columns">
        <section className="command-card registry-card">
          <div className="registry-head">
            <div>
              <h2>Active Staff Registry</h2>
              <p>Filter, select, toggle, and view access credentials.</p>
            </div>
            <div className="bulk-actions">
              <button type="button" className="secondary-action" onClick={() => bulkUpdate('Active')} disabled={!selectedIds.length}>
                Activate Selected
              </button>
              <button type="button" className="secondary-action" onClick={() => bulkUpdate('Inactive')} disabled={!selectedIds.length}>
                Deactivate Selected
              </button>
            </div>
          </div>

          <div className="user-toolbar">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name or email"
              aria-label="Search users"
            />
            <select value={filters.role} onChange={(event) => setFilters({ ...filters, role: event.target.value })} aria-label="Filter by role">
              <option>All Roles</option>
              {roles.map((role) => (
                <option key={role}>{role}</option>
              ))}
            </select>
            <select value={filters.branch} onChange={(event) => setFilters({ ...filters, branch: event.target.value })} aria-label="Filter by branch">
              <option>All Branches</option>
              {branches.map((branch) => (
                <option key={branch}>{branch}</option>
              ))}
            </select>
            <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })} aria-label="Filter by status">
              <option>All</option>
              <option>Active</option>
              <option>Inactive</option>
            </select>
          </div>

          <div className="user-table-wrap">
            <table className="user-table registry-table">
              <thead>
                <tr>
                  <th className="col-check">
                    <input
                      type="checkbox"
                      aria-label="Select all visible users"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th>Name &amp; Details</th>
                  <th>Role</th>
                  <th>Branch</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {visibleUsers.map((user) => (
                  <tr key={user.id}>
                    <td className="col-check">
                      <input type="checkbox" checked={selectedIds.includes(user.id)} onChange={() => toggleSelected(user.id)} aria-label={`Select ${user.name}`} />
                    </td>
                    <td>
                      <div className="user-cell">
                        <span className="user-name">{user.name}</span>
                        <span className="user-email">{user.email}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`role-pill role-${user.role}`}>{capitalize(user.role)}</span>
                    </td>
                    <td>{user.branch}</td>
                    <td>
                      <button
                        type="button"
                        className={`status-toggle ${user.status === 'Active' ? 'is-active' : 'is-inactive'}`}
                        onClick={() => setStatus(user, user.status === 'Active' ? 'Inactive' : 'Active')}
                        aria-label={`Toggle ${user.name} status`}
                      >
                        <span className="status-dot" />
                        {user.status}
                      </button>
                    </td>
                  </tr>
                ))}
                {!visibleUsers.length && (
                  <tr>
                    <td colSpan={5} className="registry-empty">
                      No staff accounts match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="registry-footer">
            <span>
              {selectedIds.length} selected · {visibleUsers.length} shown of {users.length} staff
            </span>
            <button type="button" className="linkish" onClick={() => setEditing(null)} disabled>
              Bulk edit
            </button>
          </div>
        </section>

        <aside className="command-aside">
          <section className="command-card">
            <h2>Role Permissions Summary</h2>
            <ul className="permission-list">
              {permissionSummary.map((item) => (
                <li key={item.role}>
                  <span className="permission-icon" aria-hidden="true">{item.icon}</span>
                  <div>
                    <strong>{item.role}</strong>
                    <span>{item.description}</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="command-card activity-card">
            <h2>Account Activity</h2>
            <ul className="activity-feed">
              {activity.map((item, index) => {
                const [time, ...rest] = item.split(' — ')
                return (
                  <li key={`${item}-${index}`}>
                    <span className="activity-time">{time}</span>
                    <span className="activity-text">{rest.join(' — ')}</span>
                  </li>
                )
              })}
            </ul>
          </section>
        </aside>
      </div>
      )}

      {editing && (
        <div className="modal-backdrop">
          <form className="confirm-dialog edit-user-dialog" onSubmit={saveEdit}>
            <h2>Edit user</h2>
            <label>
              Name
              <input value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} required />
            </label>
            <label>
              Role
              <select value={capitalize(editing.role)} onChange={(event) => setEditing({ ...editing, role: event.target.value })}>
                {roles.map((role) => (
                  <option key={role}>{role}</option>
                ))}
              </select>
            </label>
            <label>
              Branch
              <select value={editing.branch} onChange={(event) => setEditing({ ...editing, branch: event.target.value })}>
                {branches.map((branch) => (
                  <option key={branch}>{branch}</option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select value={editing.status} onChange={(event) => setEditing({ ...editing, status: event.target.value })}>
                <option>Active</option>
                <option>Inactive</option>
              </select>
            </label>
            <label>
              Reset password
              <input type="password" placeholder="Enter new password" />
            </label>
            <div>
              <button type="button" className="secondary-action" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button type="submit" className="pay-action">
                Save changes
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
