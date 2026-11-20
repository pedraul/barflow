import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, ShieldCheck } from 'lucide-react'
import { fetchStaffPermissions, updateStaffPermissions } from '../../api/endpoints'
import { usePreferences } from '../../context/PreferencesContext'

/** Accessible on/off switch (a button, so global mobile input rules don't distort it). */
function AccessSwitch({ checked, disabled, label, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`access-switch${checked ? ' is-on' : ''}${disabled ? ' is-busy' : ''}`}
    >
      <span className="access-switch-knob" />
    </button>
  )
}

const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()

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

      <div className="access-catalog">
        {catalog.map((p) => (
          <div key={p.key} className="access-catalog-card">
            <span className="access-catalog-icon"><ShieldCheck size={16} /></span>
            <div className="min-w-0">
              <div className="access-catalog-title">{t(p.label)}</div>
              <div className="access-catalog-desc">{t(p.description)}</div>
            </div>
          </div>
        ))}
      </div>
      <p className="access-note">
        {t('Granted staff act only within their own branch, cannot manage Manager accounts or themselves, and cannot change anyone’s branch.')}
      </p>

      <div className="access-search">
        <Search size={16} aria-hidden="true" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('Search staff')}
          aria-label={t('Search staff')}
        />
      </div>

      {/* Phones: one card per worker, permissions listed with switches */}
      <div className="access-cards">
        {loading ? (
          <div className="access-empty">{t('Loading...')}</div>
        ) : visible.length === 0 ? (
          <div className="access-empty">{t('No staff found.')}</div>
        ) : visible.map((u) => (
          <article key={u.id} className="access-card">
            <header className="access-card-head">
              <span className="access-avatar">{initials(u.name)}</span>
              <div className="min-w-0">
                <div className="access-card-name">{u.name}</div>
                <div className="access-card-sub">{t(u.role)}{u.branch ? ` · ${u.branch}` : ''}</div>
              </div>
              <span className="access-count">{u.permissions.length}/{catalog.length}</span>
            </header>
            <ul className="access-card-list">
              {catalog.map((p) => {
                const k = `${u.id}:${p.key}`
                return (
                  <li key={p.key}>
                    <span>{t(p.label)}</span>
                    <AccessSwitch
                      checked={u.permissions.includes(p.key)}
                      disabled={savingKey === k}
                      label={`${t(p.label)} — ${u.name}`}
                      onChange={() => toggle(u, p.key)}
                    />
                  </li>
                )
              })}
            </ul>
          </article>
        ))}
      </div>

      <div className="access-table-wrap">
        <table className="access-table">
          <thead>
            <tr>
              <th className="access-col-worker">{t('Worker')}</th>
              <th>{t('Role')}</th>
              <th>{t('Branch')}</th>
              {catalog.map((p) => <th key={p.key} className="access-col-perm" title={t(p.description)}>{t(p.label)}</th>)}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={3 + catalog.length} className="access-table-empty">{t('Loading...')}</td></tr>
            ) : visible.length === 0 ? (
              <tr><td colSpan={3 + catalog.length} className="access-table-empty">{t('No staff found.')}</td></tr>
            ) : visible.map((u) => (
              <tr key={u.id}>
                <td className="access-col-worker">
                  <div className="access-worker">
                    <span className="access-avatar">{initials(u.name)}</span>
                    <span className="access-worker-name">{u.name}</span>
                  </div>
                </td>
                <td><span className={`access-role role-${String(u.role || '').toLowerCase()}`}>{t(u.role)}</span></td>
                <td className="access-branch">{u.branch || '—'}</td>
                {catalog.map((p) => {
                  const k = `${u.id}:${p.key}`
                  return (
                    <td key={p.key} className="access-col-perm">
                      <AccessSwitch
                        checked={u.permissions.includes(p.key)}
                        disabled={savingKey === k}
                        label={`${t(p.label)} — ${u.name}`}
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
