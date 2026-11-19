import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { fetchStaffPermissions, updateStaffPermissions } from '../../api/endpoints'
import { usePreferences } from '../../context/PreferencesContext'

/** Owner grants / revokes per-worker access. Each toggle saves immediately. */
export default function StaffAccess() {
  const { t } = usePreferences()
  const [catalog, setCatalog] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [savingKey, setSavingKey] = useState(null)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    try {
      const data = await fetchStaffPermissions()
      setCatalog(data.catalog || [])
      setUsers(data.users || [])
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const toggle = async (u, key) => {
    const next = u.permissions.includes(key) ? u.permissions.filter((p) => p !== key) : [...u.permissions, key]
    setSavingKey(`${u.id}:${key}`)
    try {
      const result = await updateStaffPermissions(u.id, next)
      setUsers((list) => list.map((x) => (x.id === u.id ? { ...x, permissions: result.permissions } : x)))
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingKey(null)
    }
  }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? users.filter((u) => `${u.name} ${u.role} ${u.branch}`.toLowerCase().includes(q)) : users
  }, [users, search])

  return (
    <div className="page staff-access-page">
      <div className="user-page-heading">
        <div>
          <p className="eyebrow">{t('Owner workspace')}</p>
          <h1>{t('Staff access')}</h1>
          <p>{t('Grant or revoke what each worker is allowed to do. Changes save immediately and are recorded in the audit log.')}</p>
        </div>
      </div>

      {error && <div className="subscription-lock" style={{ padding: 12 }}>{t('Error:')} {t(error)}</div>}

      <div className="mb-4 grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        {catalog.map((p) => (
          <div key={p.key} className="rounded-xl bg-white p-3 text-sm shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center gap-1.5 font-semibold text-slate-900"><ShieldCheck size={14} /> {t(p.label)}</div>
            <div className="mt-1 text-xs text-slate-500">{t(p.description)}</div>
          </div>
        ))}
      </div>
      <p className="mb-4 text-xs text-slate-500">
        {t('Granted staff act only within their own branch, cannot manage Manager accounts or themselves, and cannot change anyone’s branch.')}
      </p>

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('Search staff')}
        className="mb-3 w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">{t('Worker')}</th>
              <th className="px-3 py-2">{t('Role')}</th>
              <th className="px-3 py-2">{t('Branch')}</th>
              {catalog.map((p) => <th key={p.key} className="px-3 py-2 text-center">{t(p.label)}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={3 + catalog.length} className="px-3 py-8 text-center text-slate-500">{t('Loading...')}</td></tr>
            ) : visible.length === 0 ? (
              <tr><td colSpan={3 + catalog.length} className="px-3 py-8 text-center text-slate-500">{t('No staff found.')}</td></tr>
            ) : visible.map((u) => (
              <tr key={u.id}>
                <td className="px-3 py-2 font-semibold text-slate-900">{u.name}</td>
                <td className="px-3 py-2 capitalize">{t(u.role)}</td>
                <td className="px-3 py-2">{u.branch || '—'}</td>
                {catalog.map((p) => {
                  const k = `${u.id}:${p.key}`
                  return (
                    <td key={p.key} className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        aria-label={`${p.label} — ${u.name}`}
                        className="h-4 w-4 cursor-pointer"
                        checked={u.permissions.includes(p.key)}
                        disabled={savingKey === k}
                        onChange={() => toggle(u, p.key)}
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
