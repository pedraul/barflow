import { usePreferences } from '../../context/PreferencesContext'
import React, { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import * as api from '../../api/endpoints'

export default function Settings() {
  const { t } = usePreferences()
  const { user } = useAuth()
  const [form, setForm] = useState({ current: '', new: '', confirm: '' })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setMessage(null)
    setError(null)

    if (form.new !== form.confirm) {
      setError(t("New password and confirmation do not match."))
      return
    }
    if (form.new.length < 8) {
      setError(t("New password must be at least 8 characters."))
      return
    }

    setSaving(true)
    try {
      await api.changePassword(form.current, form.new)
      setMessage(t("Password updated successfully."))
      setForm({ current: '', new: '', confirm: '' })
    } catch (err) {
      setError(err.message || t("Could not update password."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page bar-settings">
      <div className="user-page-heading">
        <div>
          <p className="eyebrow">{t("Bar workspace")}</p>
          <h1>{t("Settings")}</h1>
          <p>{t("Security settings for your account.")}</p>
        </div>
      </div>

      <section className="user-section">
        <div className="section-card">
          <h2>{t("Change password")}</h2>
          <p className="text-sm">{t("Account:")}{' '}{user?.name || t("Bar")} · {user?.role ? t(user.role) : t("Bar")}</p>
          <form onSubmit={handleSubmit} className="profile-form">
            <label>{t("Current password")}<input
                type="password"
                value={form.current}
                onChange={(e) => setForm({ ...form, current: e.target.value })}
                required
              />
            </label>
            <label>{t("New password")}<input
                type="password"
                value={form.new}
                onChange={(e) => setForm({ ...form, new: e.target.value })}
                required
                minLength={8}
              />
            </label>
            <label>{t("Confirm new password")}<input
                type="password"
                value={form.confirm}
                onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                required
              />
            </label>

            {error && <div className="error-box" style={{ color: '#cc0000' }}>{t(error)}</div>}
            {message && <div className="success-box" style={{ color: '#2d6a4f' }}>{message}</div>}

            <div className="form-actions">
              <button type="submit" className="pay-action" disabled={saving}>
                {saving ? t("Updating...") : t("Update password")}
              </button>
            </div>
          </form>
        </div>
      </section>
    </div>
  )
}
