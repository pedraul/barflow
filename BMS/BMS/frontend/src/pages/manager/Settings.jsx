import React, { useEffect, useState } from 'react'
import { useOwner } from '../../context/OwnerContext'

export default function Settings({ workspaceLabel = 'Manager workspace', pageTitle = 'System settings', subtitle = 'Backups, recovery, and system configuration.' }) {
  const { fetchSystemSettings, updateSystemSettings, triggerBackup } = useOwner()
  const [settings, setSettings] = useState({ businessName: '', currency: 'RWF', timezone: '' })
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState(null)
  const [err, setErr] = useState(null)
  const [backing, setBacking] = useState(false)

  useEffect(() => {
    fetchSystemSettings()
      .then((data) => setSettings((s) => ({ ...s, ...data })))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [fetchSystemSettings])

  const save = async () => {
    setMsg(null); setErr(null)
    try {
      await updateSystemSettings(settings)
      setMsg('Settings saved.')
    } catch (e) {
      setErr(e.message || 'Could not save settings.')
    }
  }

  const backup = async () => {
    setBacking(true); setMsg(null)
    try {
      await triggerBackup()
      setMsg('System backup created (no data was deleted).')
    } catch (e) {
      setErr(e.message || 'Backup failed.')
    } finally {
      setBacking(false)
    }
  }

  return (
    <div className="page manager-settings">
      <div className="user-page-heading">
        <div>
          <p className="eyebrow">{workspaceLabel}</p>
          <h1>{pageTitle}</h1>
          <p>{subtitle}</p>
        </div>
      </div>

      <section className="user-section">
        <h2>Full system backup</h2>
        <p>Create a complete backup. This never deletes any data.</p>
        <button type="button" className="pay-action" onClick={backup} disabled={backing}>
          {backing ? 'Backing up…' : 'Create backup'}
        </button>
      </section>

      <section className="user-section">
        <h2>Recovery</h2>
        <p>Restore the system from a previous backup.</p>
        <button type="button" className="secondary-action" disabled>Restore from backup (choose a backup first)</button>
      </section>

      <section className="user-section">
        <h2>General settings</h2>
        <div className="profile-form">
          <label>Business name
            <input value={settings.businessName || ''} onChange={(e) => setSettings({ ...settings, businessName: e.target.value })} />
          </label>
          <label>Currency
            <input value={settings.currency || ''} onChange={(e) => setSettings({ ...settings, currency: e.target.value })} />
          </label>
          <label>Timezone
            <input value={settings.timezone || ''} onChange={(e) => setSettings({ ...settings, timezone: e.target.value })} />
          </label>
          <div className="create-user-form-actions">
            <button type="button" className="pay-action" onClick={save} disabled={loading}>Save settings</button>
          </div>
        </div>
      </section>

      {msg && <p className="creation-success"><span>✓</span>{msg}</p>}
      {err && <p style={{ color: '#cc0000' }}>{err}</p>}
    </div>
  )
}
