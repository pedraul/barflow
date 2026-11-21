import React, { useEffect, useState } from 'react'
import { useOwner } from '../../context/OwnerContext'
import { usePreferences } from '../../context/PreferencesContext'

export default function Settings({ workspaceLabel = 'Manager workspace', pageTitle = 'System settings', subtitle = 'Backups, recovery, and system configuration.' }) {
  const { t } = usePreferences()
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
      setMsg(t('Settings saved.'))
    } catch (e) {
      setErr(e.message || t('Could not save settings.'))
    }
  }

  const backup = async () => {
    setBacking(true); setMsg(null)
    try {
      await triggerBackup()
      setMsg(t('System backup created (no data was deleted).'))
    } catch (e) {
      setErr(e.message || t('Backup failed.'))
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
        <h2>{t('Full system backup')}</h2>
        <p>{t('Create a complete backup. This never deletes any data.')}</p>
        <button type="button" className="pay-action" onClick={backup} disabled={backing}>
          {backing ? t('Backing up…') : t('Create backup')}
        </button>
      </section>

      <section className="user-section">
        <h2>{t('Recovery')}</h2>
        <p>{t('Restore the system from a previous backup.')}</p>
        <button type="button" className="secondary-action" disabled>{t('Restore from backup (choose a backup first)')}</button>
      </section>

      <section className="user-section">
        <h2>{t('General settings')}</h2>
        <div className="profile-form">
          <label>{t('Business name')}
            <input value={settings.businessName || ''} onChange={(e) => setSettings({ ...settings, businessName: e.target.value })} />
          </label>
          <label>{t('Currency')}
            <input value={settings.currency || ''} onChange={(e) => setSettings({ ...settings, currency: e.target.value })} />
          </label>
          <label>{t('Timezone')}
            <input value={settings.timezone || ''} onChange={(e) => setSettings({ ...settings, timezone: e.target.value })} />
          </label>
          <div className="create-user-form-actions">
            <button type="button" className="pay-action" onClick={save} disabled={loading}>{t('Save settings')}</button>
          </div>
        </div>
      </section>

      {msg && <p className="creation-success">{msg}</p>}
      {err && <p style={{ color: '#cc0000' }}>{err}</p>}
    </div>
  )
}
