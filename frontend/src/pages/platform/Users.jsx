import React, { useEffect, useMemo, useState } from 'react'
import { UserCog, Search, Plus, Pencil, Trash2, KeyRound, Power, X, ShieldCheck } from 'lucide-react'
import { fetchAdmins, createAdmin, updateAdmin, resetAdminPassword, deleteAdmin } from '../../api/endpoints'
import { useToast } from '../../context/ToastContext'
import { usePreferences } from '../../context/PreferencesContext'

const ALL_PERMISSIONS = ['businesses', 'subscriptions', 'payments', 'users', 'reports', 'settings', 'backup']
const ROLES = ['super_admin', 'admin', 'billing']
const ROLE_LABELS = { super_admin: 'Super Admin', admin: 'Admin', billing: 'Billing' }
const PERMISSION_LABELS = {
  businesses: 'Businesses',
  subscriptions: 'Subscriptions',
  payments: 'Payments',
  users: 'Users',
  reports: 'Reports',
  settings: 'Settings',
  backup: 'Backup',
}

export default function Users() {
  const { showSuccess } = useToast()
  const { t } = usePreferences()
  const [admins, setAdmins] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [form, setForm] = useState(null) // null | {create/edit form}
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(null)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    try {
      setAdmins(await fetchAdmins())
    } catch (e) {
      console.error('Failed to load admins:', e)
    } finally {
      setLoading(false)
    }
  }

  const openCreate = () => setForm({ mode: 'create', name: '', email: '', phone: '', password: '', role: 'admin', permissions: ['businesses', 'subscriptions', 'payments', 'reports'] })
  const openEdit = (a) => setForm({ mode: 'edit', id: a.id, name: a.name, email: a.email, phone: a.phone, role: a.role, permissions: a.permissions || [], isActive: a.isActive })

  const save = async () => {
    setSaving(true)
    try {
      if (form.mode === 'create') {
        await createAdmin({ name: form.name, email: form.email, phone: form.phone, password: form.password, role: form.role, permissions: form.permissions })
      } else {
        await updateAdmin(form.id, { name: form.name, email: form.email, phone: form.phone, role: form.role, permissions: form.permissions })
      }
      setForm(null)
      await load()
      showSuccess(t('Changes saved successfully.'))
    } catch (e) {
      alert(e.response?.data?.error || t('Save failed.'))
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (a) => {
    setBusy(`${a.id}-toggle`)
    try {
      await updateAdmin(a.id, { isActive: !a.isActive })
      await load()
      showSuccess(t('Status updated successfully.'))
    } catch (e) {
      alert(e.response?.data?.error || t('Failed.'))
    } finally {
      setBusy(null)
    }
  }

  const resetPw = async (a) => {
    const pw = window.prompt(`${t('New password for')} ${a.name}:`)
    if (!pw) return
    setBusy(`${a.id}-pw`)
    try {
      await resetAdminPassword(a.id, pw)
      showSuccess(t('Password reset successfully.'))
    } catch (e) {
      alert(e.response?.data?.error || t('Reset failed.'))
    } finally {
      setBusy(null)
    }
  }

  const remove = async (a) => {
    if (!window.confirm(`${t('Delete admin')} "${a.name}"?`)) return
    setBusy(`${a.id}-del`)
    try {
      await deleteAdmin(a.id)
      await load()
      showSuccess(t('Deleted successfully.'))
    } catch (e) {
      alert(e.response?.data?.error || t('Delete failed.'))
    } finally {
      setBusy(null)
    }
  }

  const togglePerm = (perm) => setForm((f) => ({ ...f, permissions: f.permissions.includes(perm) ? f.permissions.filter((p) => p !== perm) : [...f.permissions, perm] }))

  const filtered = useMemo(() => admins.filter((a) => !q || [a.name, a.email, a.role].some((v) => (v || '').toLowerCase().includes(q.toLowerCase()))), [admins, q])

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full" /></div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('Users')}</h1>
          <p className="text-sm text-slate-500 mt-1">{admins.length} {t('platform administrators')}</p>
        </div>
        <button onClick={openCreate} className="px-4 py-2 text-sm bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition inline-flex items-center gap-2">
          <Plus size={16} /> {t('Create Admin')}
        </button>
      </div>

      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search admins...')}
          className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <th className="text-left px-3 py-2 font-semibold">{t('Administrator')}</th>
                <th className="text-left px-3 py-2 font-semibold">{t('Role')}</th>
                <th className="text-left px-3 py-2 font-semibold">{t('Permissions')}</th>
                <th className="text-left px-3 py-2 font-semibold">{t('Last Login')}</th>
                <th className="text-left px-3 py-2 font-semibold">{t('Status')}</th>
                <th className="text-right px-3 py-2 font-semibold">{t('Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={6} className="px-3 py-3 text-center text-slate-400">{t('No admins found.')}</td></tr>}
              {filtered.map((a) => (
                <tr key={a.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <div className="font-semibold text-slate-900">{a.name}</div>
                    <div className="text-xs text-slate-400">{a.email}{a.phone ? ` · ${a.phone}` : ''}</div>
                  </td>
                  <td className="px-3 py-2">
                    <span className="px-2 py-0.5 text-[10px] font-semibold bg-purple-50 text-purple-600 border border-purple-200 rounded-full capitalize">{typeof ROLE_LABELS[a.role] === 'string' ? t(ROLE_LABELS[a.role]) : a.role}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-xs text-slate-500">{a.role === 'super_admin' ? t('Full access') : `${(a.permissions || []).length} ${t('module(s)')}`}</span>
                  </td>
                  <td className="px-3 py-2 text-slate-400 text-xs">{a.lastLogin ? new Date(a.lastLogin).toLocaleString() : t('Never')}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full ${a.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{a.isActive ? t('Active') : t('Inactive')}</span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1.5">
                      <button title={t('Edit')} onClick={() => openEdit(a)} className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50"><Pencil size={15} /></button>
                      <button title={t('Reset password')} onClick={() => resetPw(a)} disabled={busy === `${a.id}-pw`} className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 disabled:opacity-40"><KeyRound size={15} /></button>
                      <button title={t(a.isActive ? 'Deactivate' : 'Activate')} onClick={() => toggleActive(a)} disabled={busy === `${a.id}-toggle`} className={`p-1.5 rounded-lg disabled:opacity-40 ${a.isActive ? 'text-slate-600 hover:bg-slate-100' : 'text-emerald-600 hover:bg-emerald-50'}`}><Power size={15} /></button>
                      <button title={t('Delete')} onClick={() => remove(a)} disabled={busy === `${a.id}-del`} className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-40"><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setForm(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white">
              <h2 className="font-bold text-slate-900 flex items-center gap-2"><UserCog size={18} className="text-[#4F46E5]" /> {form.mode === 'create' ? t('Create Admin') : t('Edit Admin')}</h2>
              <button onClick={() => setForm(null)} aria-label={t('Close')} title={t('Close')} className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <Field label="Full Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
              <Field label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
              <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
              {form.mode === 'create' && <Field label="Password" type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} />}
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-700">{t('Role')}</label>
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white capitalize focus:ring-2 focus:ring-indigo-500 outline-none">
                  {ROLES.map((r) => <option key={r} value={r} className="capitalize">{t(ROLE_LABELS[r])}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700 flex items-center gap-1.5"><ShieldCheck size={14} /> {t('Permissions')}</label>
                <div className="grid grid-cols-2 gap-2">
                  {ALL_PERMISSIONS.map((p) => (
                    <label key={p} className="flex items-center gap-2 text-sm text-slate-600 capitalize">
                      <input type="checkbox" checked={form.permissions.includes(p)} onChange={() => togglePerm(p)} disabled={form.role === 'super_admin'} />
                      {t(PERMISSION_LABELS[p])}
                    </label>
                  ))}
                </div>
                {form.role === 'super_admin' && <p className="text-xs text-slate-400">{t('Super admins always have full access.')}</p>}
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
              <button onClick={() => setForm(null)} className="px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50">{t('Cancel')}</button>
              <button onClick={save} disabled={saving} className="px-5 py-2 text-sm bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50">{saving ? t('Saving...') : (form.mode === 'create' ? t('Create') : t('Save'))}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, value, onChange, type = 'text' }) {
  const { t } = usePreferences()
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-slate-700">{t(label)}</label>
      <input type={type} value={value ?? ''} onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
    </div>
  )
}
