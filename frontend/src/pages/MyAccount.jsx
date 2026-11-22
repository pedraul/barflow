import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Camera, User, ShieldCheck, Wallet, QrCode, Mail, Phone, Building2, MapPin,
  CalendarDays, Clock, Eye, EyeOff, LogOut, CheckCircle2, AlertCircle, X, Pencil,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useOwner } from '../context/OwnerContext'
import {
  updateAvatar, fetchMySalaryStatus, fetchMyProfile, updateMyProfile, changeMyPassword, getTwoFactorSettings,
} from '../api/endpoints'
import MenuQRWidget from '../components/MenuQRWidget'
import { usePreferences } from '../context/PreferencesContext'
import '../account.css'

const MAX_AVATAR_BYTES = 2 * 1024 * 1024
const apiError = (err, fallback) => err?.response?.data?.error || err?.message || fallback
const money = (value) => `${Number(value || 0).toLocaleString()} RWF`

function formatDate(value, withTime = false) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString(undefined, withTime
    ? { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: 'numeric', month: 'long', year: 'numeric' })
}

function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean)
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] || '?').slice(0, 2)).toUpperCase()
}

function Notice({ notice, onClose }) {
  if (!notice) return null
  const Icon = notice.tone === 'error' ? AlertCircle : CheckCircle2
  return (
    <div role={notice.tone === 'error' ? 'alert' : 'status'} className={`acct-notice acct-notice--${notice.tone}`}>
      <Icon size={18} aria-hidden="true" />
      <span>{notice.text}</span>
      <button type="button" onClick={onClose} aria-label="Close"><X size={16} /></button>
    </div>
  )
}

function PasswordField({ label, value, onChange, autoComplete, hint }) {
  const [visible, setVisible] = useState(false)
  return (
    <label className="acct-field">
      <span className="acct-label">{label}</span>
      <span className="acct-input-wrap">
        <input type={visible ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} required />
        <button type="button" className="acct-input-btn" onClick={() => setVisible((v) => !v)} aria-label={visible ? 'Hide password' : 'Show password'}>
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </span>
      {hint && <span className="acct-hint">{hint}</span>}
    </label>
  )
}

export default function MyAccount() {
  const { t } = usePreferences()
  const { user, updateUser, logout } = useAuth()
  const { activeBranchId, branches, fetchBranches, setActiveBranchId } = useOwner()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const role = String(user?.role || '').toLowerCase()
  const isOwner = role === 'owner'
  const canSeeTwoFactor = ['owner', 'manager'].includes(role)
  const addTablesPath = isOwner ? '/owner/table-qr' : role === 'manager' ? '/operator/qr-codes' : null

  const activeTab = pathname.startsWith('/account/security') ? 'security'
    : pathname.startsWith('/account/activity') || pathname.startsWith('/account/salary') ? 'salary'
      : pathname.startsWith('/account/qr') ? 'qr'
        : 'profile'

  const [profile, setProfile] = useState(() => ({
    name: user?.name || user?.full_name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    role: user?.role || '',
    branch: user?.branch || '',
    business: user?.businessName || '',
    avatar: user?.avatar || null,
    createdAt: null,
    lastLogin: null,
  }))
  const [profileLoading, setProfileLoading] = useState(true)
  const [notice, setNotice] = useState(null)

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', phone: '' })
  const [saving, setSaving] = useState(false)

  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)

  const [passwordForm, setPasswordForm] = useState({ current: '', next: '', confirm: '' })
  const [changingPassword, setChangingPassword] = useState(false)
  const [twoFactor, setTwoFactor] = useState(null)

  const [salaryStatus, setSalaryStatus] = useState(null)
  const [salaryLoading, setSalaryLoading] = useState(false)

  const show = useCallback((tone, text) => setNotice({ tone, text }), [])

  // Profile from the server (the copy kept at login can be out of date).
  useEffect(() => {
    let active = true
    fetchMyProfile()
      .then((data) => {
        if (!active || !data) return
        setProfile(data)
        updateUser({ name: data.name, email: data.email, phone: data.phone, avatar: data.avatar, branch: data.branch || user?.branch })
      })
      .catch(() => {})
      .finally(() => { if (active) setProfileLoading(false) })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (activeTab !== 'salary' || salaryStatus) return
    let active = true
    setSalaryLoading(true)
    fetchMySalaryStatus()
      .then((data) => { if (active) setSalaryStatus(data) })
      .catch(() => { if (active) setSalaryStatus(false) })
      .finally(() => { if (active) setSalaryLoading(false) })
    return () => { active = false }
  }, [activeTab, salaryStatus])

  useEffect(() => {
    if (activeTab !== 'security' || !canSeeTwoFactor || twoFactor) return
    getTwoFactorSettings(user?.businessId)
      .then((data) => setTwoFactor(data || { isEnabled: false }))
      .catch(() => setTwoFactor({ unavailable: true }))
  }, [activeTab, canSeeTwoFactor, twoFactor, user?.businessId])

  useEffect(() => {
    if (activeTab === 'qr' && isOwner && !branches.length) {
      fetchBranches().catch(() => {})
    }
  }, [activeTab, isOwner, branches.length, fetchBranches])

  useEffect(() => { setNotice(null) }, [activeTab])

  const qrBranchId = isOwner
    ? (activeBranchId && activeBranchId !== 'all' ? activeBranchId : branches.find((b) => b.isActive !== false)?.id || '')
    : user?.branchId
  const qrBranchName = branches.find((b) => String(b.id) === String(qrBranchId))?.name || user?.branch

  const startEdit = () => {
    setForm({ name: profile.name || '', email: profile.email || '', phone: profile.phone || '' })
    setEditing(true)
    setNotice(null)
  }

  const saveProfile = async (e) => {
    e.preventDefault()
    const changes = {}
    if (form.name.trim() !== profile.name) changes.name = form.name.trim()
    if (form.email.trim().toLowerCase() !== String(profile.email).toLowerCase()) changes.email = form.email.trim()
    if (form.phone.trim() !== (profile.phone || '')) changes.phone = form.phone.trim()
    if (!Object.keys(changes).length) { setEditing(false); return }
    setSaving(true)
    try {
      const updated = await updateMyProfile(changes)
      setProfile(updated)
      updateUser({ name: updated.name, email: updated.email, phone: updated.phone })
      setEditing(false)
      show('success', t('Your profile was updated.'))
    } catch (err) {
      show('error', apiError(err, t('Could not save your profile.')))
    } finally {
      setSaving(false)
    }
  }

  const handleAvatar = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) return show('error', t('Choose an image file (JPG, PNG or WebP).'))
    if (file.size > MAX_AVATAR_BYTES) return show('error', t('The photo must be 2 MB or smaller.'))
    const reader = new FileReader()
    reader.onloadend = async () => {
      const dataUrl = reader.result
      const previous = profile.avatar
      setProfile((p) => ({ ...p, avatar: dataUrl }))
      setUploading(true)
      try {
        const updated = await updateAvatar(dataUrl)
        const avatar = updated?.avatar || dataUrl
        setProfile((p) => ({ ...p, avatar }))
        updateUser({ avatar })
        show('success', t('Profile photo updated.'))
      } catch (err) {
        setProfile((p) => ({ ...p, avatar: previous }))
        show('error', apiError(err, t('Could not upload the photo.')))
      } finally {
        setUploading(false)
      }
    }
    reader.readAsDataURL(file)
  }

  const passwordProblems = (() => {
    const p = passwordForm.next
    if (!p) return null
    if (p.length < 8) return t('Use at least 8 characters.')
    if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return t('Use both letters and numbers.')
    return null
  })()
  const passwordsMatch = !passwordForm.confirm || passwordForm.next === passwordForm.confirm

  const submitPassword = async (e) => {
    e.preventDefault()
    if (passwordProblems) return show('error', passwordProblems)
    if (passwordForm.next !== passwordForm.confirm) return show('error', t('The new passwords do not match.'))
    setChangingPassword(true)
    try {
      await changeMyPassword(passwordForm.current, passwordForm.next)
      setPasswordForm({ current: '', next: '', confirm: '' })
      show('success', t('Your password was changed. Use the new password next time you sign in.'))
    } catch (err) {
      show('error', apiError(err, t('Could not change your password.')))
    } finally {
      setChangingPassword(false)
    }
  }

  const signOut = async () => {
    await logout()
    navigate('/login')
  }

  const formatMonthLabel = (m) => {
    if (!m || !/^\d{4}-\d{2}$/.test(m)) return m || '—'
    const [y, mo] = m.split('-')
    const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    return `${t(names[Number(mo) - 1] || mo)} ${y}`
  }

  const tabs = [
    { id: 'profile', path: '/account/profile', label: t('Profile'), icon: User },
    { id: 'security', path: '/account/security', label: t('Security'), icon: ShieldCheck },
    { id: 'salary', path: '/account/salary', label: t('Salary'), icon: Wallet },
    { id: 'qr', path: '/account/qr', label: t('Table QR codes'), icon: QrCode },
  ]
  const roleLabel = profile.role ? t(profile.role.charAt(0).toUpperCase() + profile.role.slice(1)) : ''

  return (
    <div className="acct-page">
      <div className="acct-container">
        <header className="acct-hero">
          <div className="acct-hero-banner" aria-hidden="true" />
          <div className="acct-hero-body">
            <div className="acct-avatar">
              {profile.avatar ? <img src={profile.avatar} alt="" /> : <span>{initials(profile.name || profile.email)}</span>}
              <button type="button" className="acct-avatar-btn" onClick={() => fileInputRef.current?.click()} disabled={uploading} aria-label={t('Change photo')} title={t('Change photo')}>
                <Camera size={16} />
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatar} hidden />
            </div>
            <div className="acct-hero-text">
              <div className="acct-hero-name">
                <h1>{profile.name || t('My account')}</h1>
                {roleLabel && <span className="acct-chip">{roleLabel}</span>}
              </div>
              <p className="acct-hero-email">{profile.email}</p>
              <ul className="acct-hero-meta">
                {profile.branch && <li><MapPin size={14} /> {profile.branch}</li>}
                {profile.business && <li><Building2 size={14} /> {profile.business}</li>}
                {profile.createdAt && <li><CalendarDays size={14} /> {t('Joined')} {formatDate(profile.createdAt)}</li>}
              </ul>
            </div>
            {uploading && <span className="acct-hero-status">{t('Uploading photo…')}</span>}
          </div>
        </header>

        <div className="acct-layout">
          <nav className="acct-nav" aria-label={t('Account sections')}>
            {tabs.map(({ id, path, label, icon: Icon }) => (
              <button key={id} type="button" className={`acct-nav-item${activeTab === id ? ' is-active' : ''}`} aria-current={activeTab === id ? 'page' : undefined} onClick={() => navigate(path)}>
                <Icon size={18} aria-hidden="true" /> <span>{label}</span>
              </button>
            ))}
            <button type="button" className="acct-nav-item acct-nav-signout" onClick={signOut}>
              <LogOut size={18} aria-hidden="true" /> <span>{t('Sign out')}</span>
            </button>
          </nav>

          <main className="acct-content">
            <Notice notice={notice} onClose={() => setNotice(null)} />

            {activeTab === 'profile' && (
              <>
                <section className="acct-card">
                  <div className="acct-card-head">
                    <div>
                      <h2>{t('Personal information')}</h2>
                      <p>{t('Your name and contact details. Your phone number is also used for salary payments.')}</p>
                    </div>
                    {!editing && (
                      <button type="button" className="acct-btn acct-btn--ghost" onClick={startEdit} disabled={profileLoading}>
                        <Pencil size={15} /> {t('Edit')}
                      </button>
                    )}
                  </div>

                  {editing ? (
                    <form className="acct-form" onSubmit={saveProfile}>
                      <div className="acct-form-grid">
                        <label className="acct-field">
                          <span className="acct-label">{t('Full name')}</span>
                          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" required minLength={2} maxLength={120} />
                        </label>
                        <label className="acct-field">
                          <span className="acct-label">{t('Email')}</span>
                          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" required />
                        </label>
                        <label className="acct-field">
                          <span className="acct-label">{t('Phone')}</span>
                          <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} autoComplete="tel" placeholder="0788123456" />
                          <span className="acct-hint">{t('Rwanda mobile number, for example 0788123456.')}</span>
                        </label>
                      </div>
                      <div className="acct-actions">
                        <button type="button" className="acct-btn acct-btn--ghost" onClick={() => setEditing(false)} disabled={saving}>{t('Cancel')}</button>
                        <button type="submit" className="acct-btn acct-btn--primary" disabled={saving}>{saving ? t('Saving…') : t('Save changes')}</button>
                      </div>
                    </form>
                  ) : (
                    <dl className="acct-rows">
                      <div><dt><User size={16} /> {t('Full name')}</dt><dd>{profile.name || '—'}</dd></div>
                      <div><dt><Mail size={16} /> {t('Email')}</dt><dd>{profile.email || '—'}</dd></div>
                      <div><dt><Phone size={16} /> {t('Phone')}</dt><dd>{profile.phone || <span className="acct-muted">{t('Not added')}</span>}</dd></div>
                    </dl>
                  )}
                </section>

                <section className="acct-card">
                  <div className="acct-card-head">
                    <div>
                      <h2>{t('Work details')}</h2>
                      <p>{t('Set by your business owner or manager.')}</p>
                    </div>
                  </div>
                  <dl className="acct-rows">
                    <div><dt><ShieldCheck size={16} /> {t('Role')}</dt><dd>{roleLabel || '—'}</dd></div>
                    <div><dt><MapPin size={16} /> {t('Branch')}</dt><dd>{profile.branch || (isOwner ? t('All branches') : '—')}</dd></div>
                    <div><dt><Building2 size={16} /> {t('Business')}</dt><dd>{profile.business || '—'}</dd></div>
                    <div><dt><CalendarDays size={16} /> {t('Member since')}</dt><dd>{formatDate(profile.createdAt)}</dd></div>
                    <div><dt><Clock size={16} /> {t('Last sign-in')}</dt><dd>{formatDate(profile.lastLogin, true)}</dd></div>
                  </dl>
                </section>
              </>
            )}

            {activeTab === 'security' && (
              <>
                <section className="acct-card">
                  <div className="acct-card-head">
                    <div>
                      <h2>{t('Password')}</h2>
                      <p>{t('Use a password you do not use anywhere else.')}</p>
                    </div>
                  </div>
                  <form className="acct-form acct-form--narrow" onSubmit={submitPassword}>
                    <PasswordField label={t('Current password')} value={passwordForm.current} onChange={(v) => setPasswordForm({ ...passwordForm, current: v })} autoComplete="current-password" />
                    <PasswordField label={t('New password')} value={passwordForm.next} onChange={(v) => setPasswordForm({ ...passwordForm, next: v })} autoComplete="new-password" hint={passwordProblems || t('At least 8 characters, with letters and numbers.')} />
                    <PasswordField label={t('Confirm new password')} value={passwordForm.confirm} onChange={(v) => setPasswordForm({ ...passwordForm, confirm: v })} autoComplete="new-password" hint={passwordsMatch ? null : t('The passwords do not match.')} />
                    <div className="acct-actions">
                      <button type="submit" className="acct-btn acct-btn--primary" disabled={changingPassword || !passwordForm.current || !passwordForm.next || !passwordForm.confirm}>
                        {changingPassword ? t('Updating…') : t('Update password')}
                      </button>
                    </div>
                  </form>
                </section>

                <section className="acct-card">
                  <div className="acct-card-head">
                    <div>
                      <h2>{t('Two-step verification')}</h2>
                      <p>{t('A code sent by email is needed to sign in, in addition to the password.')}</p>
                    </div>
                    {canSeeTwoFactor && twoFactor && !twoFactor.unavailable && (
                      <span className={`acct-status ${twoFactor.isEnabled ? 'is-on' : 'is-off'}`}>{twoFactor.isEnabled ? t('On') : t('Off')}</span>
                    )}
                  </div>
                  <div className="acct-inline">
                    <p className="acct-muted">
                      {isOwner
                        ? t('This setting applies to everyone in your business.')
                        : t('This is managed by your business owner for everyone in the business.')}
                    </p>
                    {isOwner && (
                      <button type="button" className="acct-btn acct-btn--ghost" onClick={() => navigate('/settings')}>{t('Manage')}</button>
                    )}
                  </div>
                </section>

                <section className="acct-card">
                  <div className="acct-card-head">
                    <div>
                      <h2>{t('Sign out')}</h2>
                      <p>{t('Sign out of BarFlow on this device.')}</p>
                    </div>
                    <button type="button" className="acct-btn acct-btn--danger" onClick={signOut}>
                      <LogOut size={15} /> {t('Sign out')}
                    </button>
                  </div>
                </section>
              </>
            )}

            {activeTab === 'salary' && (
              <section className="acct-card">
                <div className="acct-card-head">
                  <div>
                    <h2>{t('Salary status')}</h2>
                    <p>{t('Your salary payments for the last 12 months.')}</p>
                  </div>
                </div>
                {salaryLoading ? (
                  <p className="acct-muted">{t('Loading salary status…')}</p>
                ) : !salaryStatus ? (
                  <p className="acct-muted">{t('Unable to load salary status.')}</p>
                ) : (
                  <>
                    <div className="acct-stats">
                      <div><span>{t('Monthly salary')}</span><strong>{money(salaryStatus.salary)}</strong></div>
                      <div className="is-paid"><span>{t('Paid')}</span><strong>{(salaryStatus.paidMonths || []).length} {t('months')}</strong></div>
                      <div className="is-pending"><span>{t('Pending')}</span><strong>{(salaryStatus.pendingMonths || []).length} {t('months')}</strong></div>
                      <div className="is-unpaid"><span>{t('Not paid')}</span><strong>{(salaryStatus.notPaidMonths || []).length} {t('months')}</strong></div>
                    </div>
                    <ul className="acct-months">
                      {[...(salaryStatus.months || [])].reverse().map((m) => {
                        const key = String(m.status || '').toLowerCase().replace(/\s+/g, '-')
                        return (
                          <li key={m.month}>
                            <div>
                              <strong>{formatMonthLabel(m.month)}</strong>
                              {m.amount > 0 && <span>{money(m.amount)}</span>}
                            </div>
                            <span className={`acct-pill acct-pill--${key}`}>{t(m.status)}</span>
                          </li>
                        )
                      })}
                    </ul>
                  </>
                )}
              </section>
            )}

            {activeTab === 'qr' && (
              <section className="acct-card">
                <div className="acct-card-head">
                  <div>
                    <h2>{t('Table QR codes')}</h2>
                    <p>{t('100 ready-to-use table QR codes, plus any additional table numbers registered to the selected branch.')}</p>
                  </div>
                </div>
                {isOwner && (
                  <label className="acct-field acct-form--narrow">
                    <span className="acct-label">{t('Branch for these QR codes')}</span>
                    <select value={qrBranchId} onChange={(e) => setActiveBranchId(e.target.value)} disabled={!branches.length}>
                      {branches.filter((b) => b.isActive !== false).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
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
              </section>
            )}
          </main>
        </div>
      </div>
    </div>
  )
}
