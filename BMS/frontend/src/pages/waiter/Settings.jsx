import React, { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import * as api from '../../api/endpoints'

export default function Settings() {
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
      setError('New password and confirmation do not match.')
      return
    }
    if (form.new.length < 8) {
      setError('New password must be at least 8 characters.')
      return
    }

    setSaving(true)
    try {
      await api.changePassword(form.current, form.new)
      setMessage('Password updated successfully.')
      setForm({ current: '', new: '', confirm: '' })
    } catch (err) {
      setError(err.message || 'Could not update password.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page waiter-settings">
      <div className="user-page-heading">
        <div>
          <p className="eyebrow">Waiter workspace</p>
          <h1>Settings</h1>
          <p>Security settings for your account.</p>
        </div>
      </div>

      <section className="user-section">
        <div className="section-card">
          <h2>Change password</h2>
          <p className="text-sm">Account: {user?.name || 'Waiter'} · {user?.role || 'Waiter'}</p>
          <form onSubmit={handleSubmit} className="profile-form">
            <label>
              Current password
              <input
                type="password"
                value={form.current}
                onChange={(e) => setForm({ ...form, current: e.target.value })}
                required
              />
            </label>
            <label>
              New password
              <input
                type="password"
                value={form.new}
                onChange={(e) => setForm({ ...form, new: e.target.value })}
                required
                minLength={8}
              />
            </label>
            <label>
              Confirm new password
              <input
                type="password"
                value={form.confirm}
                onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                required
              />
            </label>

            {error && <div className="error-box" style={{ color: '#cc0000' }}>{error}</div>}
            {message && <div className="success-box" style={{ color: '#2d6a4f' }}>{message}</div>}

            <div className="form-actions">
              <button type="submit" className="pay-action" disabled={saving}>
                {saving ? 'Updating...' : 'Update password'}
              </button>
            </div>
          </form>
        </div>
      </section>
    </div>
  )
}
