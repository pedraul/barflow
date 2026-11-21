import React, { useCallback, useEffect, useState } from 'react'
import * as api from '../../api/endpoints'
import { useAuth } from '../../context/AuthContext'
import { usePreferences } from '../../context/PreferencesContext'
import useMyGrants from '../../hooks/useMyGrants'

// Roles a granted worker may create/manage (Manager and Owner stay with the owner).
const DELEGABLE_ROLES = ['waiter', 'kitchen', 'bar', 'operator', 'accountant']
const EMPTY_FORM = { name: '', email: '', phone: '', role: 'waiter', password: '', salary: '' }

/** Staff management for workers the owner granted access to. Branch-scoped. */
export default function StaffManagementPage() {
  const { t } = usePreferences()
  const { user } = useAuth()
  const { has, loaded } = useMyGrants()
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const canCreate = has('create_employees')
  const canEdit = has('edit_employees')
  const canReset = has('reset_passwords')

  const load = useCallback(async () => {
    try {
      setStaff((await api.fetchUsers()) || [])
      setError(null)
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const flash = (msg) => { setNotice(msg); setTimeout(() => setNotice(null), 5000) }
  const manageable = (u) => u.id !== user?.id && DELEGABLE_ROLES.includes(String(u.role).toLowerCase())

  const handleCreate = async (e) => {
    e.preventDefault()
    if (form.password.length < 6) { setError(t('Password must be at least 6 characters.')); return }
    setSaving(true)
    try {
      await api.createStaffUser({ ...form, salary: Number(form.salary) || 0, status: 'Active' })
      flash(`${t('Created account for')} ${form.name}.`)
      setForm(EMPTY_FORM)
      setError(null)
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async (u) => {
    const pwd = window.prompt(`${t('New password for')} ${u.name} (${t('min 6 characters')}):`, '')
    if (pwd === null) return
    if (pwd.length < 6) { alert(t('Password must be at least 6 characters.')); return }
    try {
      await api.resetStaffPassword(u.id, pwd)
      flash(`${t('Password reset for')} ${u.name}.`)
    } catch (err) {
      alert(t(err.message))
    }
  }

  const handleRole = async (u, role) => {
    try {
      await api.updateStaffUser(u.id, { role })
      flash(`${u.name} ${t('is now')} ${role}.`)
      load()
    } catch (err) {
      alert(t(err.message))
    }
  }

  const handleDeactivate = async (u) => {
    if (!window.confirm(`${t('Deactivate')} ${u.name}? ${t('They will no longer be able to log in.')}`)) return
    try {
      await api.deactivateStaffUser(u.id)
      flash(`${u.name} ${t('was deactivated.')}`)
      load()
    } catch (err) {
      alert(t(err.message))
    }
  }

  if (loaded && !canCreate && !canEdit && !canReset) {
    return (
      <div className="page">
        <div className="py-16 text-center text-slate-500">{t('You do not have staff management access. Ask the owner to grant it.')}</div>
      </div>
    )
  }

  const input = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm'

  return (
    <div className="page staff-management-page">
      <div className="user-page-heading">
        <div>
          <p className="eyebrow">{t('Staff')}</p>
          <h1>{t('Staff management')}</h1>
          <p>{t('Manage staff in your branch with the access the owner has granted you.')}</p>
        </div>
      </div>

      {error && <div className="subscription-lock" style={{ padding: 12 }}>{t('Error:')} {t(error)}</div>}
      {notice && <div className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{notice}</div>}

      {canCreate && (
        <form onSubmit={handleCreate} className="mb-8 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">{t('Create employee')}</h2>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            <label className="text-sm">{t('Full name')}<input required className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label className="text-sm">{t('Email')}<input required type="email" className={input} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
            <label className="text-sm">{t('Phone')}<input className={input} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
            <label className="text-sm">{t('Role')}
              <select className={`${input} capitalize`} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {DELEGABLE_ROLES.map((r) => <option key={r} value={r}>{t(r)}</option>)}
              </select>
            </label>
            <label className="text-sm">{t('Initial password')}<input required type="password" minLength={6} className={input} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
            <label className="text-sm">{t('Salary (RWF)')}<input type="number" min="0" className={input} value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} /></label>
          </div>
          <p className="mt-3 text-xs text-slate-500">{t('The account is created in your branch:')} <strong>{user?.branch || user?.branchName || t('your branch')}</strong></p>
          <button type="submit" disabled={saving} className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
            {saving ? t('Creating...') : t('Create employee')}
          </button>
        </form>
      )}

      <h2 className="mb-2 text-lg font-semibold text-slate-900">{t('Branch staff')}</h2>
      <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">{t('Name')}</th>
              <th className="px-3 py-2">{t('Role')}</th>
              <th className="px-3 py-2">{t('Email')}</th>
              <th className="px-3 py-2">{t('Phone')}</th>
              <th className="px-3 py-2">{t('Actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-500">{t('Loading...')}</td></tr>
            ) : staff.filter((u) => String(u.role).toLowerCase() !== 'owner').map((u) => (
              <tr key={u.id}>
                <td className="px-3 py-2 font-semibold text-slate-900">{u.name}{u.id === user?.id && <span className="ml-1 text-xs text-slate-400">({t('you')})</span>}</td>
                <td className="px-3 py-2 capitalize">
                  {canEdit && manageable(u) ? (
                    <select className="rounded border border-slate-300 px-2 py-1 capitalize" value={String(u.role).toLowerCase()} onChange={(e) => handleRole(u, e.target.value)}>
                      {DELEGABLE_ROLES.map((r) => <option key={r} value={r}>{t(r)}</option>)}
                    </select>
                  ) : t(u.role)}
                </td>
                <td className="px-3 py-2">{u.email}</td>
                <td className="px-3 py-2">{u.phone || '—'}</td>
                <td className="px-3 py-2">
                  {manageable(u) ? (
                    <div className="flex gap-2">
                      {canReset && (
                        <button type="button" onClick={() => handleReset(u)} className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200">
                          {t('Reset password')}
                        </button>
                      )}
                      {canEdit && (
                        <button type="button" onClick={() => handleDeactivate(u)} className="inline-flex items-center gap-1 rounded bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100">
                          {t('Deactivate')}
                        </button>
                      )}
                    </div>
                  ) : <span className="text-xs text-slate-400">{t('Owner only')}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
