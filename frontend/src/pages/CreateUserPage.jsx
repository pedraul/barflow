import React from 'react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useUsers } from '../context/UsersContext'
import { useAuditLog } from '../context/AuditLogContext'
import { usePreferences } from '../context/PreferencesContext'

const branches = ['Head Office', 'Kigali Heights', 'Remera Branch']

export default function CreateUserPage({ accessRole, embedded = false }) {
  const navigate = useNavigate()
  const { t } = usePreferences()
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
    <div className="creation-success"><span>✓</span><h2>{t('User created')}</h2><p><strong>{form.name}</strong></p><p>{t('Their account is ready. They can sign in with the email and temporary password you set.')}</p><button type="button" onClick={() => navigate(dashboardPath)}>{t('Return to user management')}</button></div>
  ) : (
    <form className="create-user-form" onSubmit={submitForm}>
      <label>{t('Full name')}<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder={t('e.g. Aline Uwimana')} required /></label>
      <label>{t('Email address')}<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder={t('name@business.rw')} required /></label>
      <label>{t('Phone number')}<input type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder={t('+250 78…')} required /></label>
      <label>{t('Temporary password')}<input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder={t('Set a temporary password')} required minLength="8" /></label>
      <label>{t('Role')}<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>{allowedRoles.map((role) => <option key={role} value={role}>{t(role)}</option>)}</select></label>
      <label>{t('Branch assignment')}<select value={form.branch} onChange={(event) => setForm({ ...form, branch: event.target.value })}>{branches.map((branch) => <option key={branch}>{branch}</option>)}</select></label>
      <label>{t('Salary')}<input type="number" min="0" step="100" value={form.salary} onChange={(event) => setForm({ ...form, salary: event.target.value })} placeholder={t('e.g. 150000')} required /></label>
      <label>{t('Account status')}<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="Active">{t('Active')}</option><option value="Inactive">{t('Inactive')}</option></select></label>
      <div className="create-user-form-actions"><Link className="secondary-action" to={dashboardPath}>{t('Cancel')}</Link><button type="submit">{t('Create user')}</button></div>
    </form>
  )

  return embedded ? (
    <div className="create-user-card">{inner}</div>
  ) : (
    <div className="page create-user-page">
      <div className="create-user-card">
        <Link className="back-link" to={dashboardPath}>← {t('Back to user management')}</Link>
        <p className="eyebrow">{accessRole} {t('workspace')}</p>
        <h1>{t('Create user')}</h1>
        <p>{t('Add a staff account and assign its role, branch, and initial access.')}</p>
        {inner}
      </div>
    </div>
  )
}
