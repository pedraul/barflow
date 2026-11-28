import React, { useRef, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useOwner } from '../context/OwnerContext'
import { updateAvatar, fetchMySalaryStatus } from '../api/endpoints'
import { useNavigate, useLocation } from 'react-router-dom'
import MenuQRWidget from '../components/MenuQRWidget'
import { usePreferences } from '../context/PreferencesContext'

export default function MyAccount() {
  const { t } = usePreferences()
  const { user, updateUser } = useAuth()
  const { activeBranchId, branches, fetchBranches, setActiveBranchId } = useOwner()
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
  const [salaryStatus, setSalaryStatus] = useState(null)
  const [salaryLoading, setSalaryLoading] = useState(false)
  const isOwner = String(user?.role || '').toLowerCase() === 'owner'
  const addTablesPath = isOwner ? '/owner/table-qr' : String(user?.role || '').toLowerCase() === 'manager' ? '/operator/qr-codes' : null
  const qrBranchId = isOwner
    ? (activeBranchId && activeBranchId !== 'all' ? activeBranchId : branches.find((branch) => branch.isActive !== false)?.id || '')
    : user?.branchId
  const qrBranchName = branches.find((branch) => String(branch.id) === String(qrBranchId))?.name || user?.branch

  useEffect(() => {
    if (isOwner && !branches.length) {
      fetchBranches().catch((error) => {
        console.error('Failed to load branches for account QR codes:', error)
      })
    }
  }, [isOwner, branches.length, fetchBranches])

  useEffect(() => {
    let active = true
    setSalaryLoading(true)
    fetchMySalaryStatus()
      .then((data) => { if (active) setSalaryStatus(data) })
      .catch(() => { if (active) setSalaryStatus(null) })
      .finally(() => { if (active) setSalaryLoading(false) })
    return () => { active = false }
  }, [])

  const handleProfileSave = async (e) => {
    e.preventDefault()
    setEditing(false)
    alert(t('Profile updated successfully'))
  }

  const handlePasswordChange = (e) => {
    e.preventDefault()
    if (passwordForm.new !== passwordForm.confirm) {
      alert(t('Passwords do not match'))
      return
    }
    alert(t('Password changed successfully'))
    setPasswordForm({ current: '', new: '', confirm: '' })
  }

  const handleNotificationToggle = (key) => {
    setNotifications(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const handleDeleteAccount = () => {
    if (window.confirm(t('Are you sure? This action cannot be undone. All data will be permanently deleted.'))) {
      alert(t('Account deletion requested. We will process this within 48 hours.'))
    }
  }

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      alert(t('Please select an image file.'))
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
        alert(t('Profile photo updated successfully.'))
      } catch (err) {
        alert(err.message || t('Failed to upload photo.'))
      } finally {
        setUploading(false)
      }
    }
    reader.readAsDataURL(file)
  }

  const triggerFileInput = () => {
    fileInputRef.current?.click()
  }

  const formatMonthLabel = (m) => {
    if (!m || !/^\d{4}-\d{2}$/.test(m)) return m || '—'
    const [y, mo] = m.split('-')
    const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    return `${t(names[Number(mo) - 1] || mo)} ${y}`
  }

  const tabs = [
    { id: 'profile', label: t('Profile') },
    { id: 'security', label: t('Security') },
    { id: 'notifications', label: t('Notifications') },
    { id: 'activity', label: t('Salary Status') },
  ]

  return (
    <div className="page my-account-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t('My Account')}</p>
          <h1>{t('Account settings')}</h1>
          <p>{t('Manage your profile, security, and preferences')}</p>
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
                  <img src={avatarPreview || profile.avatar} alt={t('Profile')} />
                ) : (
                  <span className="avatar-initials">
                    {profile.fullName.split(' ').map(n => n[0]).join('')}
                  </span>
                )}
              </div>
              <button className="secondary-action" onClick={triggerFileInput} disabled={uploading}>
                {uploading ? t('Uploading...') : t('Change photo')}
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
              <p className="role-badge">{t(profile.role)}</p>
              <p className="text-sm">{profile.branch}</p>
              <p className="text-sm">{t('Member since')} {profile.dateJoined}</p>
              <p className="text-sm">{t('Last login:')} {profile.lastLogin}</p>
            </div>
          </div>

          {editing ? (
            <form className="profile-form" onSubmit={handleProfileSave}>
              <div className="form-grid">
                <label>{t('Full name')}
                  <input
                    value={profile.fullName}
                    onChange={e => setProfile({...profile, fullName: e.target.value})}
                    required
                  />
                </label>
                <label>{t('Email')}
                  <input
                    type="email"
                    value={profile.email}
                    onChange={e => setProfile({...profile, email: e.target.value})}
                    required
                  />
                </label>
                <label>{t('Phone')}
                  <input
                    type="tel"
                    value={profile.phone}
                    onChange={e => setProfile({...profile, phone: e.target.value})}
                  />
                </label>
                <label>{t('Branch')}
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
                <button type="button" className="secondary-action" onClick={() => setEditing(false)}>{t('Cancel')}</button>
                <button type="submit" className="pay-action">{t('Save changes')}</button>
              </div>
            </form>
          ) : (
            <div className="profile-details">
              <div className="detail-grid">
                <div><strong>{t('Full name')}</strong><p>{profile.fullName}</p></div>
                <div><strong>{t('Email')}</strong><p>{profile.email}</p></div>
                <div><strong>{t('Phone')}</strong><p>{profile.phone}</p></div>
                <div><strong>{t('Role')}</strong><p>{t(profile.role)}</p></div>
                <div><strong>{t('Branch')}</strong><p>{profile.branch}</p></div>
              </div>
              <button className="pay-action" onClick={() => setEditing(true)}>{t('Edit profile')}</button>
            </div>
          )}

          <div className="account-menu-qr">
            <div>
              <h2>{t('Table QR codes')}</h2>
              <p className="text-sm">{t('100 ready-to-use table QR codes, plus any additional table numbers registered to the selected branch.')}</p>
            </div>
            {isOwner && (
              <label className="account-table-qr-branch">
                {t('Branch for these QR codes')}
                <select
                  value={qrBranchId}
                  onChange={(event) => setActiveBranchId(event.target.value)}
                  aria-label={t('Select branch for account QR codes')}
                  disabled={!branches.length}
                >
                  {branches.filter((branch) => branch.isActive !== false).map((branch) => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </select>
              </label>
            )}
            <MenuQRWidget
              embedded
              businessId={user?.businessId}
              businessSlug={user?.businessSlug}
              branchId={qrBranchId}
              branchName={qrBranchName}
              addTablesPath={addTablesPath}
            />
          </div>
        </section>
      )}

      {/* Security Tab */}
      {activeTab === 'security' && (
        <section className="account-section">
          <div className="section-card">
            <h2>{t('Change password')}</h2>
            <form onSubmit={handlePasswordChange}>
              <label>{t('Current password')}
                <input
                  type="password"
                  value={passwordForm.current}
                  onChange={e => setPasswordForm({...passwordForm, current: e.target.value})}
                  required
                />
              </label>
              <label>{t('New password')}
                <input
                  type="password"
                  value={passwordForm.new}
                  onChange={e => setPasswordForm({...passwordForm, new: e.target.value})}
                  required
                  minLength={8}
                />
              </label>
              <label>{t('Confirm new password')}
                <input
                  type="password"
                  value={passwordForm.confirm}
                  onChange={e => setPasswordForm({...passwordForm, confirm: e.target.value})}
                  required
                />
              </label>
              <button type="submit" className="pay-action">{t('Update password')}</button>
            </form>
          </div>

          <div className="section-card">
            <h2>{t('Two-factor authentication')}</h2>
            <p className="text-sm">{t('Add an extra layer of security to your account')}</p>
            <div className="toggle-row">
              <span>{t('Enable two-factor auth')}</span>
              <button
                className={`toggle ${twoFactor ? 'active' : ''}`}
                onClick={() => setTwoFactor(!twoFactor)}
                aria-label={t('Enable two-factor auth')}
              >
                {twoFactor ? t('On') : t('Off')}
              </button>
            </div>
            {twoFactor && (
              <div className="two-factor-setup">
                <p>{t('Scan this QR code with your authenticator app')}</p>
                <div className="qr-placeholder">[{t('QR Code')}]</div>
                <p className="text-sm">{t('Or enter this code manually:')} ABC123DEF456</p>
              </div>
            )}
          </div>

          <div className="section-card danger-zone">
            <h2 className="text-red-600">{t('Danger zone')}</h2>
            <p className="text-sm">{t('Permanently delete your account and all associated data')}</p>
            <button
              className="delete-action"
              onClick={handleDeleteAccount}
            >
              {t('Delete account')}
            </button>
          </div>
        </section>
      )}

      {/* Notifications Tab */}
      {activeTab === 'notifications' && (
        <section className="account-section">
          <div className="section-card">
            <h2>{t('Email notifications')}</h2>
            <div className="notification-list">
              {[
                { key: 'emailReports', label: t('Daily sales report') },
                { key: 'weeklyDigest', label: t('Weekly performance digest') },
                { key: 'lowStock', label: t('Low stock alerts') },
              ].map(item => (
                <div key={item.key} className="toggle-row">
                  <span>{item.label}</span>
                  <button
                    className={`toggle ${notifications[item.key] ? 'active' : ''}`}
                    onClick={() => handleNotificationToggle(item.key)}
                    aria-label={item.label}
                  >
                    {notifications[item.key] ? t('On') : t('Off')}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="section-card">
            <h2>{t('Push notifications')}</h2>
            <div className="notification-list">
              {[
                { key: 'pushAlerts', label: t('Real-time alerts') },
                { key: 'dailySales', label: t('Sales milestones') },
                { key: 'smsAlerts', label: t('SMS alerts (phone required)') },
              ].map(item => (
                <div key={item.key} className="toggle-row">
                  <span>{item.label}</span>
                  <button
                    className={`toggle ${notifications[item.key] ? 'active' : ''}`}
                    onClick={() => handleNotificationToggle(item.key)}
                    aria-label={item.label}
                  >
                    {notifications[item.key] ? t('On') : t('Off')}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Salary Status Tab (all users) */}
      {activeTab === 'activity' && (
        <section className="account-section">
          <h2>{t('Salary Status')}</h2>
          <p className="text-sm text-slate-500">{t('Your salary payment status for the last 12 months.')}</p>

          {salaryLoading ? (
            <p className="text-sm text-slate-500">{t('Loading salary status…')}</p>
          ) : !salaryStatus ? (
            <p className="text-sm text-slate-500">{t('Unable to load salary status.')}</p>
          ) : (
            <>
              <div className="salary-summary-grid">
                <div className="salary-summary-card">
                  <span className="salary-summary-label">{t('Monthly Salary')}</span>
                  <strong>{Number(salaryStatus.salary || 0).toLocaleString()} RWF</strong>
                </div>
                <div className="salary-summary-card">
                  <span className="salary-summary-label">{t('Paid')}</span>
                  <strong className="salary-count-paid">{(salaryStatus.paidMonths || []).length} {t('months')}</strong>
                </div>
                <div className="salary-summary-card">
                  <span className="salary-summary-label">{t('Not Paid')}</span>
                  <strong className="salary-count-unpaid">{(salaryStatus.notPaidMonths || []).length} {t('months')}</strong>
                </div>
                <div className="salary-summary-card">
                  <span className="salary-summary-label">{t('Pending')}</span>
                  <strong className="salary-count-pending">{(salaryStatus.pendingMonths || []).length} {t('months')}</strong>
                </div>
              </div>

              <div className="salary-status-list">
                {(salaryStatus.months || []).map((m) => (
                  <div key={m.month} className={`salary-status-row status-${m.status.toLowerCase().replace(/\s+/g, '-')}`}>
                    <div className="salary-status-month">
                      <strong>{formatMonthLabel(m.month)}</strong>
                      {m.amount > 0 && <span className="salary-status-amount">{Number(m.amount).toLocaleString()} RWF</span>}
                    </div>
                    <span className={`salary-status-pill ${m.status.toLowerCase().replace(/\s+/g, '-')}`}>{m.status}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  )
}
