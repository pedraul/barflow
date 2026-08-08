import React, { useState } from 'react'
import { useUsers } from '../../context/UsersContext'
import { useOwner } from '../../context/OwnerContext'

export default function PasswordManagement() {
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
      setErr('Password must be at least 6 characters.')
      return
    }
    try {
      await resetUserPassword(target.id, pwd)
      setMsg(`Password updated for ${target.name}.`)
      setTarget(null)
      setPwd('')
    } catch (e) {
      setErr(e.message || 'Could not reset password.')
    }
  }

  return (
    <div className="page manager-password">
      <div className="user-page-heading">
        <div>
          <p className="eyebrow">Manager workspace</p>
          <h1>Password management</h1>
          <p>Reset a staff member’s password.</p>
        </div>
      </div>

      <section className="user-section">
        <div className="user-table-wrap">
          <table className="user-table">
            <thead><tr><th>Name</th><th>Role</th><th>Phone</th><th>Action</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.role}</td>
                  <td>{u.phone || '—'}</td>
                  <td className="user-actions">
                    <button type="button" className="secondary-action" onClick={() => { setTarget(u); setPwd('') }}>Reset password</button>
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
            <h2>Reset password — {target.name}</h2>
            <label>New password
              <input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} required />
            </label>
            <div className="creation-success">{msg}</div>
            {err && <div style={{ color: '#cc0000' }}>{err}</div>}
            <div className="create-user-form-actions">
              <button type="button" className="secondary-action" onClick={() => setTarget(null)}>Cancel</button>
              <button type="button" className="pay-action" onClick={reset}>Update password</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
