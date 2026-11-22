import React, { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { login, platformLogin } from '../../api/endpoints'
import { refreshPlatformInfo, isLogoUrl } from '../../hooks/usePlatformInfo'
import { buildWorkspaceUrl } from '../../config/workspaceUrl'
import { usePreferences } from '../../context/PreferencesContext'

export default function Login() {
  const navigate = useNavigate()
  const { t } = usePreferences()
  const { login: setAuth } = useAuth()
  const [mode, setMode] = useState(() => (
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mode') === 'admin' ? 'admin' : 'business'
  )) // 'business' | 'admin'
  // Platform details from Settings (description, support contact, maintenance notice).
  // Fresh on the sign-in page, so a change saved in Settings shows on the next visit.
  const [platformInfo, setPlatformInfo] = useState(null)
  useEffect(() => {
    refreshPlatformInfo().then(setPlatformInfo).catch(() => {})
  }, [])
  const platformName = String(platformInfo?.name || 'BarFlow').trim() || 'BarFlow'
  const websiteRaw = String(platformInfo?.website || '').trim()
  const websiteUrl = websiteRaw ? (/^https?:\/\//i.test(websiteRaw) ? websiteRaw : `https://${websiteRaw}`) : ''
  const [form, setForm] = useState({ username: '', password: '', email: '', password2: '' })
  // A message left by the app when a session was ended (business suspended, deleted, ...).
  const [error, setError] = useState(() => {
    try { return sessionStorage.getItem('barflow.loginNotice') || '' } catch { return '' }
  })
  useEffect(() => {
    try { sessionStorage.removeItem('barflow.loginNotice') } catch { /* ignore */ }
  }, [])
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'admin') {
        const data = await platformLogin(form.email, form.password2)
        if (data.requires2FA) {
          const params = new URLSearchParams({
            email: data.user?.email || form.email,
            method: data.method,
            adminId: data.user?.id,
            role: 'super_admin',
            isPlatformAdmin: 'true',
          })
          navigate(`/auth/2fa?${params.toString()}`)
          return
        }
        setAuth({ token: data.token, user: data.user })
        navigate('/admin/dashboard')
      } else {
         const data = await login(form.username, form.password)
         if (data.requires2FA) {
           const params = new URLSearchParams({
             tempToken: data.tempToken,
             email: data.user?.email || form.username,
             method: data.method,
             userId: data.user?.id,
             role: data.user?.role,
           })
           navigate(`/auth/2fa?${params.toString()}`)
           return
         }
         setAuth({ token: data.token, user: data.user })
        // Route based on role
        const role = String(data.user.role || '').toLowerCase()
        if (data.user.subscriptionExpired && data.user.unpaidAccessGranted !== true && role !== 'owner') {
          window.location.assign(buildWorkspaceUrl(data.user, '/subscription-expired'))
          return
        }
        if (data.user.subscriptionExpired && data.user.unpaidAccessGranted !== true && role === 'owner') {
          window.location.assign(buildWorkspaceUrl(data.user, '/owner/subscription'))
          return
        }
        const roleRoutes = {
          owner: '/owner/',
          manager: '/manager/',
          accountant: '/accountant/',
          waiter: '/waiter/',
          operator: '/operator/',
          kitchen: '/kitchen/',
          bar: '/bar/',
        }
        window.location.assign(buildWorkspaceUrl(data.user, roleRoutes[role] || '/'))
      }
    } catch (err) {
      const status = err.response?.status
      const data = err.response?.data
      if (status === 403 && data?.code === 'SUBSCRIPTION_PENDING') {
        setError(t('Your business subscription is pending activation. Please complete payment and wait for admin verification.'))
      } else {
        setError(err.response?.data?.error || err.response?.data?.message || t('Login failed. Please try again.'))
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-2">
            {/* Settings → Platform Info → Logo (image address or text/emoji), else the default mark */}
            {isLogoUrl(platformInfo?.logo) ? (
              <img src={platformInfo.logo} alt="" className="w-12 h-12 rounded-xl object-contain bg-white/10" />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-400 flex items-center justify-center">
                <span className="text-white font-bold text-lg">{String(platformInfo?.logo || '').trim().slice(0, 2) || platformName.charAt(0).toUpperCase()}</span>
              </div>
            )}
            {/* Settings → General → Platform Name */}
            {platformName.toLowerCase() === 'barflow' ? (
              <h1 className="text-5xl sm:text-6xl leading-none font-black uppercase">
                <span className="text-yellow-300">BAR</span><span className="text-emerald-400">FLOW</span>
              </h1>
            ) : (
              <h1 className="text-4xl sm:text-5xl leading-none font-black text-white">{platformName}</h1>
            )}
          </div>
          <p className="text-slate-400 text-sm">{platformInfo?.description ? platformInfo.description : t('Multi-business management platform')}</p>
        </div>

        {platformInfo?.maintenance?.enabled && mode === 'business' && (
          <div role="status" className="mb-4 rounded-xl border border-amber-300/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            {platformInfo.maintenance.message}
          </div>
        )}

        {/* Mode Toggle */}
        <div className="flex bg-amber-200/40 rounded-xl p-1 mb-6">
          <button
            onClick={() => { setMode('business'); setError('') }}
            className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all ${
              mode === 'business' ? 'bg-amber-400 text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-amber-50'
            }`}
          >
            {t('Business Login')}
          </button>
          <button
            onClick={() => { setMode('admin'); setError('') }}
            className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all ${
              mode === 'admin' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            {t('Admin Login')}
          </button>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 shadow-xl space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
              {error}
            </div>
          )}

          {mode === 'business' ? (
            <>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('Username / Email')}</label>
                <input
                  type="text"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  placeholder={t('Enter your username')}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('Password')}</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  placeholder={t('Enter your password')}
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg transition disabled:opacity-50"
              >
                {loading ? t('Signing in...') : t('Sign In')}
              </button>
              <p className="text-center text-sm text-slate-500">
                {t("Don't have an account?")}{' '}
                <Link to="/register" className="text-indigo-600 font-semibold hover:underline">
                  {t('Register your business')}
                </Link>
              </p>
              <p className="text-center text-sm text-slate-500">
                <Link to="/forgot-password" className="text-indigo-600 font-semibold hover:underline">
                  {t('Forgot Password?')}
                </Link>
              </p>
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('Admin Email')}</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  placeholder="admin@barflow.com"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('Password')}</label>
                <input
                  type="password"
                  value={form.password2}
                  onChange={(e) => setForm({ ...form, password2: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  placeholder={t('Enter admin password')}
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-slate-800 hover:bg-amber-600 text-white font-semibold rounded-lg transition disabled:opacity-50"
              >
                {loading ? t('Signing in...') : t('Admin Sign In')}
              </button>
              <p className="text-center text-sm text-slate-500">
                <Link to="/forgot-password" className="text-indigo-600 font-semibold hover:underline">
                  {t('Forgot Password?')}
                </Link>
              </p>
            </>
          )}
        </form>
        {(platformInfo?.contactEmail || platformInfo?.contactPhone) && (
          <p className="mt-6 text-center text-xs text-slate-400">
            {t('Need help?')} {[platformInfo.contactEmail, platformInfo.contactPhone].filter(Boolean).join(' · ')}
          </p>
        )}
        {websiteUrl && (
          <p className="mt-2 text-center text-xs">
            <a href={websiteUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-300 hover:text-indigo-200 underline">
              {websiteUrl.replace(/^https?:\/\//i, '').replace(/\/$/, '')}
            </a>
          </p>
        )}
      </div>
    </div>
  )
}