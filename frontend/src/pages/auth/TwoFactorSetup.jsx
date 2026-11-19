import React, { useEffect, useState } from 'react'
import * as api from '../../api/endpoints'
import { usePreferences } from '../../context/PreferencesContext'

export default function TwoFactorSetup() {
  const { t } = usePreferences()
  const [settings, setSettings] = useState({ isEnabled: false, method: 'email', scope: 'platform' })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const load = async () => {
    try {
      const data = await api.getTwoFactorSettings()
      setSettings({ isEnabled: data.isEnabled || false, method: data.method || 'email', scope: data.scope || 'platform' })
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setMessage('')
    try {
      const payload = {
        isEnabled: settings.isEnabled,
        method: settings.method,
        scope: settings.scope,
        businessId: settings.scope === 'business' ? settings.businessId : null,
      }
      const data = await api.updateTwoFactorSettings(payload)
      setSettings((prev) => ({ ...prev, ...data }))
      setMessage(t('Two-factor authentication settings saved.'))
    } catch (err) {
      setMessage(err.message || t('Failed to save settings.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page">
      <div className="user-page-heading">
        <div>
          <h1>{t('Two-Factor Authentication')}</h1>
          <p>{t('Enable 2FA to add an extra layer of security.')}</p>
        </div>
      </div>
      {message && <div className={settings.isEnabled ? 'success-box' : 'error-box'}>{message}</div>}
      <section className="user-section">
        <form onSubmit={handleSave}>
          <label>
            {t('Scope')}
            <select
              value={settings.scope}
              onChange={(e) => setSettings({ ...settings, scope: e.target.value })}
            >
              <option value="platform">{t('Platform (all businesses)')}</option>
              <option value="business">{t('This Business Only')}</option>
            </select>
          </label>
          <label>
            {t('Enable 2FA')}
            <input
              type="checkbox"
              checked={settings.isEnabled}
              onChange={(e) => setSettings({ ...settings, isEnabled: e.target.checked })}
            />
          </label>
          {settings.isEnabled && (
            <label>
              {t('Method')}
              <select
                value={settings.method}
                onChange={(e) => setSettings({ ...settings, method: e.target.value })}
              >
                <option value="email">{t('Email')}</option>
                <option value="sms">{t('SMS')}</option>
                <option value="authenticator">{t('Authenticator App')}</option>
              </select>
            </label>
          )}
          <button type="submit" className="pay-action" disabled={saving}>
            {saving ? t('Saving...') : t('Save Settings')}
          </button>
        </form>
      </section>
    </div>
  )
}
