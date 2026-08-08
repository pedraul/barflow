import React from 'react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useUsers } from '../context/UsersContext'
import { useAuditLog } from '../context/AuditLogContext'

const branches = ['Head Office', 'Kigali Heights', 'Remera Branch']

export default function CreateUserPage({ accessRole, embedded = false }) {
  const navigate = useNavigate()
  const { addUser } = useUsers()
  const { log } = useAuditLog()
  const allowedRoles = accessRole === 'Owner'
    ? ['Owner', 'Manager', 'Accountant', 'Cashier', 'Waiter']
    : ['Manager', 'Accountant', 'Cashier', 'Waiter']
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', role: 'Waiter', branch: branches[0], salary: '', status: 'Active' })
  const [saved, setSaved] = useState(false)
  const dashboardPath = accessRole === 'Owner' ? '/owner/users' : '/manager/staff'

  const submitForm = (event) => {
    event.preventDefault()
    addUser({
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      password: form.password,
      role: form.role,
      branch: form.branch,
      salary: Number(form.salary) || 0,
      status: form.status,
      lastLogin: 'Never',
    })
    log({ actor: form.name.trim(), action: `User account created with role ${form.role}`, type: 'user' })
    setSaved(true)
  }

  const inner = saved ? (
    <div className="creation-success"><span>✓</span><h2>User created</h2><p>{form.name}'s account is ready. They can sign in with the email and temporary password you set.</p><button type="button" onClick={() => navigate(dashboardPath)}>Return to user management</button></div>
  ) : (
    <form className="create-user-form" onSubmit={submitForm}>
      <label>Full name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Aline Uwimana" required /></label>
      <label>Email address<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="name@business.rw" required /></label>
      <label>Phone number<input type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="+250 78…" required /></label>
      <label>Temporary password<input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="Set a temporary password" required minLength="8" /></label>
      <label>Role<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>{allowedRoles.map((role) => <option key={role}>{role}</option>)}</select></label>
      <label>Branch assignment<select value={form.branch} onChange={(event) => setForm({ ...form, branch: event.target.value })}>{branches.map((branch) => <option key={branch}>{branch}</option>)}</select></label>
      <label>Salary<input type="number" min="0" step="100" value={form.salary} onChange={(event) => setForm({ ...form, salary: event.target.value })} placeholder="e.g. 150000" required /></label>
      <label>Account status<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option>Active</option><option>Inactive</option></select></label>
      <div className="create-user-form-actions"><Link className="secondary-action" to={dashboardPath}>Cancel</Link><button type="submit">Create user</button></div>
    </form>
  )

  return embedded ? (
    <div className="create-user-card">{inner}</div>
  ) : (
    <div className="page create-user-page">
      <div className="create-user-card">
        <Link className="back-link" to={dashboardPath}>← Back to user management</Link>
        <p className="eyebrow">{accessRole} workspace</p>
        <h1>Create user</h1>
        <p>Add a staff account and assign its role, branch, and initial access.</p>
        {inner}
      </div>
    </div>
  )
}
