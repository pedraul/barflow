import React, { useState } from 'react'
import { useUsers } from '../../context/UsersContext'
import { useOwner } from '../../context/OwnerContext'
import { usePreferences } from '../../context/PreferencesContext'

export default function PasswordManagement() {
  const { t } = usePreferences()
  const { users } = useUsers()
  const { resetUserPassword } = useOwner()
  const [target, setTarget] = useState(null)
  const [pwd, setPwd] = useState('')
  const [msg, setMsg] = useState(null)
  const [err, setErr] = useState(null)

  const reset = async () => {
    setMsg(null)
    setErr(null)
    if (!pwd || pwd.length < 6) {
      setErr(t('Password must be at least 6 characters.'))
      return
    }
    try {
      await resetUserPassword(target.id, pwd)
      setMsg(`${t('Password updated for')} ${target.name}.`)
      setTarget(null)
      setPwd('')
    } catch (e) {
      setErr(e.message || t('Could not reset password.'))
    }
  }

  return (
    <div className="page manager-password">
      <div className="user-page-heading">
        <div>
          <p className="eyebrow">{t('Manager workspace')}</p>
          <h1>{t('Password management')}</h1>
          <p>{t('Reset a staff member’s password.')}</p>
        </div>
      </div>

      <section className="user-section">
        <div className="user-table-wrap">
          <table className="user-table">
            <thead><tr><th>{t('Name')}</th><th>{t('Role')}</th><th>{t('Phone')}</th><th>{t('Action')}</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.role}</td>
                  <td>{u.phone || '—'}</td>
                  <td className="user-actions">
                    <button type="button" className="secondary-action" onClick={() => { setTarget(u); setPwd('') }}>{t('Reset password')}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {target && (
        <div className="modal-backdrop">
          <form className="confirm-dialog edit-user-dialog" onSubmit={(e) => e.preventDefault()}>
            <h2>{t('Reset password —')} {target.name}</h2>
            <label>{t('New password')}
              <input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} required />
            </label>
            <div className="creation-success">{msg}</div>
            {err && <div style={{ color: '#cc0000' }}>{err}</div>}
            <div className="create-user-form-actions">
              <button type="button" className="secondary-action" onClick={() => setTarget(null)}>{t('Cancel')}</button>
              <button type="button" className="pay-action" onClick={reset}>{t('Update password')}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
