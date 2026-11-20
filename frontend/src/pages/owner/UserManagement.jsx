import React, { useEffect, useState } from 'react'
import { useOwner } from '../../context/OwnerContext'
import { Plus, Edit3, Trash2, Power, Key, X } from 'lucide-react'
import { usePreferences } from '../../context/PreferencesContext'

const ROLES = ['manager', 'accountant', 'waiter', 'kitchen', 'bar', 'operator']
const fmt = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'RWF', minimumFractionDigits: 0 }).format(v || 0)

export default function UserManagement() {
  const { t } = usePreferences()
  const { fetchUsers, createUser, updateUser, deleteUser, resetUserPassword, fetchBranches, activeBranchId, setActiveBranchId, loading } = useOwner()
  const [users, setUsers] = useState([])
  const [branches, setBranches] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [form, setForm] = useState({ username: '', fullName: '', email: '', phone: '', password: '', role: 'waiter', branch: '', salary: '', isActive: true, avatar: '' })
  const [resetPwId, setResetPwId] = useState(null)
  const [newPassword, setNewPassword] = useState('')
  const [message, setMessage] = useState('')
  const activeBranches = branches.filter((branch) => branch.isActive)

  useEffect(() => {
    loadUsers()
    fetchBranches().then(setBranches).catch(() => setBranches([]))
  }, [activeBranchId])

  const loadUsers = async () => {
    try { setUsers(await fetchUsers()) } catch (e) { console.error(e) }
  }

  const openCreate = () => {
    setEditingUser(null)
    setForm({ username: '', fullName: '', email: '', phone: '', password: '', role: 'waiter', branch: '', salary: '', isActive: true, avatar: '' })
    setShowModal(true)
  }

  const openEdit = (u) => {
    setEditingUser(u)
    setForm({ username: u.username || '', fullName: u.fullName || u.name, email: u.email, phone: u.phone || '', password: '', role: u.role, branch: u.branchId || '', salary: (u.salary || 0).toString(), isActive: u.isActive !== false, avatar: u.avatar || '' })
    setShowModal(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setMessage('')
    try {
      if (editingUser) {
        const payload = {}
        if (form.username !== (editingUser.username || '')) payload.username = form.username
        if (form.fullName !== (editingUser.fullName || editingUser.name)) payload.fullName = form.fullName
        if (form.email !== editingUser.email) payload.email = form.email
        if (form.phone !== (editingUser.phone || '')) payload.phone = form.phone
        if (form.role !== editingUser.role) payload.role = form.role
        payload.branch = form.branch || null
        payload.salary = parseFloat(form.salary) || 0
        payload.isActive = form.isActive
        await updateUser(editingUser.id, payload)
      } else {
        await createUser({ ...form, salary: parseFloat(form.salary) || 0 })
      }
      setShowModal(false)
      await loadUsers()
      setMessage(editingUser ? t('User updated successfully.') : t('Employee created successfully.'))
    } catch (e) { setMessage(e.message) }
  }

  const handleResetPassword = async (id) => {
    if (!newPassword || newPassword.length < 6) { setMessage(t('Password must be at least 6 characters.')); return }
    try {
      await resetUserPassword(id, newPassword)
      setResetPwId(null); setNewPassword('')
      setMessage(t('Password reset successfully.'))
    } catch (e) { setMessage(e.message) }
  }

  const handleDelete = async (u) => {
    if (!window.confirm(`${t('Remove account for')} ${u.fullName || u.name}? ${t('Accounts with required order or other history will be deactivated instead.')}`)) return
    try {
      const result = await deleteUser(u.id)
      setMessage(result?.message || t('User deleted successfully.'))
      await loadUsers()
    } catch (e) { setMessage(e.message) }
  }

  const toggleStatus = async (u) => {
    try {
      await updateUser(u.id, { isActive: !u.isActive })
      await loadUsers()
      setMessage(u.isActive ? t('User deactivated successfully.') : t('User activated successfully.'))
    } catch (e) { setMessage(e.message) }
  }

  return (
    <div className="staff-registry-page p-6 space-y-6">
      <div className="staff-registry-header flex justify-between items-center">
        <div className="staff-registry-intro">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('Owner workspace')}</p>
          <h1 className="text-2xl font-black text-slate-900">{t('Staff Registry')}</h1>
          <p className="text-sm text-slate-500">{t('Create, edit, activate/deactivate and reset passwords for all staff accounts.')}</p>
        </div>
        <div className="staff-registry-controls flex items-center gap-3">
          <select value={activeBranchId} onChange={(e) => setActiveBranchId(e.target.value)} className="staff-registry-branch border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
            <option value="all">{t('All branches')}</option>
            {branches.filter((branch) => branch.name?.toLowerCase() !== 'main branch').map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
          <button onClick={openCreate} className="staff-registry-create flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition shadow-sm">
            <Plus size={18} /> {t('Register New Employee')}
          </button>
        </div>
      </div>

      {message && <div className="p-4 bg-blue-50 border border-blue-200 text-blue-800 rounded-xl text-sm font-medium">{message}</div>}

      <div className="staff-registry-table-card bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="staff-registry-table-scroll overflow-x-auto">
          <table className="staff-registry-table w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200">
                {['Name', 'Username', 'Email', 'Phone', 'Role', 'Branch', 'Salary', 'Status', 'Actions'].map((h) => (
                  <th key={h} className={`text-left p-2 font-semibold text-slate-500 text-xs uppercase tracking-wider ${h === 'Actions' ? 'sticky right-0 z-20 min-w-[176px] bg-white shadow-[-8px_0_12px_-12px_rgba(15,23,42,0.5)]' : ''}`}>{t(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id} className="group hover:bg-slate-50 transition">
                  <td className="p-2 font-medium text-slate-900">{u.fullName || u.name}</td>
                  <td className="p-2 text-slate-600">{u.username || '—'}</td>
                  <td className="p-2 text-slate-600">{u.email}</td>
                  <td className="p-2 text-slate-600">{u.phone || '—'}</td>
                  <td className="p-2">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-medium role-pill role-${u.role}`}>{u.role}</span>
                  </td>
                  <td className="p-2 text-slate-600">{u.branchName || u.branch || '—'}</td>
                  <td className="p-2 font-medium text-slate-900">{fmt(u.salary)}</td>
                  <td className="p-2">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-medium ${u.isActive !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                      {u.isActive !== false ? t('Active') : t('Inactive')}
                    </span>
                  </td>
                  <td className="staff-registry-actions p-2">
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEdit(u)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition" title={t('Edit')}><Edit3 size={16} /></button>
                      <button onClick={() => handleDelete(u)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition" title={t('Delete')}><Trash2 size={16} /></button>
                      <button onClick={() => toggleStatus(u)} className={`p-1.5 rounded-lg transition ${u.isActive !== false ? 'text-amber-600 hover:bg-amber-50' : 'text-emerald-600 hover:bg-emerald-50'}`} title={u.isActive !== false ? t('Deactivate') : t('Activate')}>
                        <Power size={16} />
                      </button>
                      <button onClick={() => setResetPwId(resetPwId === u.id ? null : u.id)} className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg transition" title={t('Reset password')}><Key size={16} /></button>
                    </div>
                    {resetPwId === u.id && (
                      <div className="flex items-center gap-2 mt-2">
                        <input
                          type="password"
                          placeholder={t('New password (min 6 chars)')}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-500"
                        />
                        <button onClick={() => handleResetPassword(u.id)} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition">{t('Apply')}</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {!users.length && (
                <tr><td colSpan={9} className="p-8 text-center text-slate-400">{t('No staff records found.')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {loading && <p className="text-center text-slate-400">{t('Loading…')}</p>}

      {showModal && (
        <div className="owner-user-modal-backdrop fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="owner-user-modal bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="owner-user-modal-header flex justify-between items-center p-5 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900">{editingUser ? t('Edit Employee') : t('Register New Employee')}</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('Username')}</label>
                <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder={t('e.g. john.doe')} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('Full Name *')}</label>
                <input required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('Email *')}</label>
                <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('Phone Number')}</label>
                <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder={t('e.g. 0788123456')} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500" />
              </div>
              {!editingUser && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('Password *')}</label>
                  <input type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500" />
                </div>
              )}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('Role *')}</label>
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500">
                  {ROLES.map((r) => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t(activeBranches.length ? 'Branch *' : 'Branch')}</label>
                <select required={activeBranches.length > 0} value={form.branch || (activeBranchId !== 'all' ? activeBranchId : activeBranches.length === 1 ? activeBranches[0].id : '')} onChange={(e) => setForm({ ...form, branch: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500">
                  <option value="">{activeBranches.length ? t('Select a branch') : t('Main Branch will be created automatically')}</option>
                  {activeBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('Salary')}</label>
                <input type="number" value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('Active')}</label>
                <select value={form.isActive.toString()} onChange={(e) => setForm({ ...form, isActive: e.target.value === 'true' })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500">
                  <option value="true">{t('Active')}</option>
                  <option value="false">{t('Inactive')}</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border border-slate-200 text-slate-700 rounded-lg font-medium hover:bg-slate-50 transition">{t('Cancel')}</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition">{editingUser ? t('Save Changes') : t('Create Employee')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
