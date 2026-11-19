import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useAuditLog } from '../../context/AuditLogContext'
import { usePreferences } from '../../context/PreferencesContext'
import { login as loginApi } from '../../api/endpoints'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const { login } = useAuth()
  const { log } = useAuditLog()
  const { t } = usePreferences()

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')

    if (!username.trim() || !password.trim()) {
      setError(t('Please enter both username and password.'))
      return
    }

    try {
      const { token, user } = await loginApi(username, password)
      login({ token, user })
      log({ actor: user.name || username, action: `Signed in as ${user.role}`, type: 'login' })
      navigate(`/dashboard/${user.role.toLowerCase()}`)
    } catch (err) {
      const status = err.response?.status
      const data = err.response?.data
      if (status === 403 && data?.code === 'SUBSCRIPTION_PENDING') {
        setError(t('Your business subscription is pending activation. Please complete payment and wait for admin verification.'))
      } else {
        const message = err.response?.data?.error || err.message || t('Login failed')
        setError(message)
      }
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-lg p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-600 rounded-xl text-white mb-4">
              <span className="text-xl font-black text-white">B</span>
            </div>
            <h1 className="text-2xl font-black text-slate-900">BarFlow</h1>
            <p className="text-sm text-slate-500 mt-1">{t('Sign in to continue to your workspace')}</p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('Username')}</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t('e.g. john.doe')}
                autoFocus
                className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('Password')}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('Enter your password')}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg transition shadow-sm"
            >
              {t('Sign in')}
            </button>
          </form>

          <div className="mt-4 text-center text-sm text-slate-500 space-y-2">
            <p>
              <Link to="/forgot-password" className="text-indigo-600 font-semibold hover:underline">
                {t('Forgot Password?')}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
