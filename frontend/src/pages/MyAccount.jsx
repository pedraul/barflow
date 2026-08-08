import React, { useRef, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { updateAvatar, fetchMyAuditLogs } from '../api/endpoints'
import { useNavigate, useLocation } from 'react-router-dom'

export default function MyAccount() {
  const { user, updateUser } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const activeTab = (() => {
    if (pathname.startsWith('/account/security')) return 'security'
    if (pathname.startsWith('/account/notifications')) return 'notifications'
    if (pathname.startsWith('/account/activity')) return 'activity'
    return 'profile'
  })()
  const [editing, setEditing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [avatarPreview, setAvatarPreview] = useState(null)
  const fileInputRef = useRef(null)

  const [profile, setProfile] = useState({
    fullName: user?.name || 'Aline Uwimana',
    email: user?.email || 'aline@barflow.rw',
    phone: user?.phone || '+250 788 123 456',
    role: user?.role || 'Owner',
    branch: 'Head Office',
    avatar: user?.avatar || null,
    dateJoined: '01 Jan 2024',
    lastLogin: 'Today, 09:14'
  })

  const [passwordForm, setPasswordForm] = useState({
    current: '',
    new: '',
    confirm: ''
  })
  const [notifications, setNotifications] = useState({
    emailReports: true,
    pushAlerts: true,
    smsAlerts: false,
    weeklyDigest: true,
    lowStock: true,
    dailySales: false
  })
  const [twoFactor, setTwoFactor] = useState(false)
  const [activityLog, setActivityLog] = useState([])
  const [activityLoading, setActivityLoading] = useState(false)

  useEffect(() => {
    let active = true
    setActivityLoading(true)
    fetchMyAuditLogs()
      .then((data) => { if (active) setActivityLog(Array.isArray(data) ? data.slice(0, 50) : []) })
      .catch(() => { if (active) setActivityLog([]) })
      .finally(() => { if (active) setActivityLoading(false) })
    return () => { active = false }
  }, [])

  const handleProfileSave = async (e) => {
    e.preventDefault()
    setEditing(false)
    alert('Profile updated successfully')
  }

  const handlePasswordChange = (e) => {
    e.preventDefault()
    if (passwordForm.new !== passwordForm.confirm) {
      alert('Passwords do not match')
      return
    }
    alert('Password changed successfully')
    setPasswordForm({ current: '', new: '', confirm: '' })
  }

  const handleNotificationToggle = (key) => {
    setNotifications(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const handleDeleteAccount = () => {
    if (window.confirm('Are you sure? This action cannot be undone. All data will be permanently deleted.')) {
      alert('Account deletion requested. We will process this within 48 hours.')
    }
  }

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file.')
      return
    }

    const reader = new FileReader()
    reader.onloadend = async () => {
      const base64 = reader.result
      setAvatarPreview(base64)
      setUploading(true)
      try {
        const updated = await updateAvatar(base64)
        setProfile(prev => ({ ...prev, avatar: updated.avatar || base64 }))
        updateUser({ ...user, avatar: updated.avatar || base64 })
        alert('Profile photo updated successfully.')
      } catch (err) {
        alert(err.message || 'Failed to upload photo.')
      } finally {
        setUploading(false)
      }
    }
    reader.readAsDataURL(file)
  }

  const triggerFileInput = () => {
    fileInputRef.current?.click()
  }

  const tabs = [
    { id: 'profile', label: 'Profile' },
    { id: 'security', label: 'Security' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'activity', label: 'Activity Log' },
  ]

  return (
    <div className="page my-account-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">My Account</p>
          <h1>Account settings</h1>
          <p>Manage your profile, security, and preferences</p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="tab-nav">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => navigate(`/account/${tab.id}`)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Profile Tab */}
      {activeTab === 'profile' && (
        <section className="account-section">
          <div className="profile-header">
            <div className="avatar-section">
              <div className="avatar-large">
                {(profile.avatar || avatarPreview) ? (
                  <img src={avatarPreview || profile.avatar} alt="Profile" />
                ) : (
                  <span className="avatar-initials">
                    {profile.fullName.split(' ').map(n => n[0]).join('')}
                  </span>
                )}
              </div>
              <button className="secondary-action" onClick={triggerFileInput} disabled={uploading}>
                {uploading ? 'Uploading...' : 'Change photo'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
            </div>
            <div className="profile-info">
              <h2>{profile.fullName}</h2>
              <p className="role-badge">{profile.role}</p>
              <p className="text-sm">{profile.branch}</p>
              <p className="text-sm">Member since {profile.dateJoined}</p>
              <p className="text-sm">Last login: {profile.lastLogin}</p>
            </div>
          </div>

          {editing ? (
            <form className="profile-form" onSubmit={handleProfileSave}>
              <div className="form-grid">
                <label>Full name
                  <input
                    value={profile.fullName}
                    onChange={e => setProfile({...profile, fullName: e.target.value})}
                    required
                  />
                </label>
                <label>Email
                  <input
                    type="email"
                    value={profile.email}
                    onChange={e => setProfile({...profile, email: e.target.value})}
                    required
                  />
                </label>
                <label>Phone
                  <input
                    type="tel"
                    value={profile.phone}
                    onChange={e => setProfile({...profile, phone: e.target.value})}
                  />
                </label>
                <label>Branch
                  <select
                    value={profile.branch}
                    onChange={e => setProfile({...profile, branch: e.target.value})}
                  >
                    <option>Head Office</option>
                    <option>Kigali Heights</option>
                    <option>Remera Branch</option>
                  </select>
                </label>
              </div>
              <div className="form-actions">
                <button type="button" className="secondary-action" onClick={() => setEditing(false)}>Cancel</button>
                <button type="submit" className="pay-action">Save changes</button>
              </div>
            </form>
          ) : (
            <div className="profile-details">
              <div className="detail-grid">
                <div><strong>Full name</strong><p>{profile.fullName}</p></div>
                <div><strong>Email</strong><p>{profile.email}</p></div>
                <div><strong>Phone</strong><p>{profile.phone}</p></div>
                <div><strong>Role</strong><p>{profile.role}</p></div>
                <div><strong>Branch</strong><p>{profile.branch}</p></div>
              </div>
              <button className="pay-action" onClick={() => setEditing(true)}>Edit profile</button>
            </div>
          )}
        </section>
      )}

      {/* Security Tab */}
      {activeTab === 'security' && (
        <section className="account-section">
          <div className="section-card">
            <h2>Change password</h2>
            <form onSubmit={handlePasswordChange}>
              <label>Current password
                <input
                  type="password"
                  value={passwordForm.current}
                  onChange={e => setPasswordForm({...passwordForm, current: e.target.value})}
                  required
                />
              </label>
              <label>New password
                <input
                  type="password"
                  value={passwordForm.new}
                  onChange={e => setPasswordForm({...passwordForm, new: e.target.value})}
                  required
                  minLength={8}
                />
              </label>
              <label>Confirm new password
                <input
                  type="password"
                  value={passwordForm.confirm}
                  onChange={e => setPasswordForm({...passwordForm, confirm: e.target.value})}
                  required
                />
              </label>
              <button type="submit" className="pay-action">Update password</button>
            </form>
          </div>

          <div className="section-card">
            <h2>Two-factor authentication</h2>
            <p className="text-sm">Add an extra layer of security to your account</p>
            <div className="toggle-row">
              <span>Enable two-factor auth</span>
              <button
                className={`toggle ${twoFactor ? 'active' : ''}`}
                onClick={() => setTwoFactor(!twoFactor)}
              >
                {twoFactor ? 'On' : 'Off'}
              </button>
            </div>
            {twoFactor && (
              <div className="two-factor-setup">
                <p>Scan this QR code with your authenticator app</p>
                <div className="qr-placeholder">[QR Code]</div>
                <p className="text-sm">Or enter this code manually: ABC123DEF456</p>
              </div>
            )}
          </div>

          <div className="section-card danger-zone">
            <h2 className="text-red-600">Danger zone</h2>
            <p className="text-sm">Permanently delete your account and all associated data</p>
            <button
              className="delete-action"
              onClick={handleDeleteAccount}
            >
              Delete account
            </button>
          </div>
        </section>
      )}

      {/* Notifications Tab */}
      {activeTab === 'notifications' && (
        <section className="account-section">
          <div className="section-card">
            <h2>Email notifications</h2>
            <div className="notification-list">
              {[
                { key: 'emailReports', label: 'Daily sales report' },
                { key: 'weeklyDigest', label: 'Weekly performance digest' },
                { key: 'lowStock', label: 'Low stock alerts' },
              ].map(item => (
                <div key={item.key} className="toggle-row">
                  <span>{item.label}</span>
                  <button
                    className={`toggle ${notifications[item.key] ? 'active' : ''}`}
                    onClick={() => handleNotificationToggle(item.key)}
                  >
                    {notifications[item.key] ? 'On' : 'Off'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="section-card">
            <h2>Push notifications</h2>
            <div className="notification-list">
              {[
                { key: 'pushAlerts', label: 'Real-time alerts' },
                { key: 'dailySales', label: 'Sales milestones' },
                { key: 'smsAlerts', label: 'SMS alerts (phone required)' },
              ].map(item => (
                <div key={item.key} className="toggle-row">
                  <span>{item.label}</span>
                  <button
                    className={`toggle ${notifications[item.key] ? 'active' : ''}`}
                    onClick={() => handleNotificationToggle(item.key)}
                  >
                    {notifications[item.key] ? 'On' : 'Off'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Activity Log Tab */}
      {activeTab === 'activity' && (
        <section className="account-section">
          <h2>Recent activity</h2>
          {activityLoading ? (
            <p className="text-sm text-slate-500">Loading activity log…</p>
          ) : activityLog.length === 0 ? (
            <p className="text-sm text-slate-500">No activity recorded yet.</p>
          ) : (
            <div className="activity-timeline">
              {activityLog.map((entry, index) => (
                <div key={entry.id || index} className="activity-item">
                  <div className="activity-dot"></div>
                  <div className="activity-content">
                    <p>{entry.action}</p>
                    <p className="text-sm">{entry.targetModule ? `Module: ${entry.targetModule}` : ''}</p>
                    <p className="text-sm text-slate-500">{entry.time}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
