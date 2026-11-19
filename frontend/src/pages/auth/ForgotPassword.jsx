import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { usePreferences } from '../../context/PreferencesContext'
import { forgotPassword } from '../../api/endpoints'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const { t } = usePreferences()

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)
    try {
      const result = await forgotPassword(email.trim())
      setMessage(result.message || t('If an account exists, password reset instructions have been sent to your email.'))
      setSubmitted(true)
    } catch (err) {
      setError(err.response?.data?.error || err.message || t('Request failed. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <section className="bg-white border border-slate-200 rounded-2xl shadow-lg p-6 sm:p-8">
          <header className="text-center mb-7">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-600 rounded-xl text-white mb-4">
              <span className="text-xl font-black">B</span>
            </div>
            <h1 className="text-2xl font-black text-slate-900">BarFlow</h1>
            <p className="text-sm text-slate-500 mt-1">{t('Reset your password securely')}</p>
          </header>

          <div className="mb-6 text-center">
            <h2 className="text-xl font-bold text-slate-900">{t('Forgot password?')}</h2>
            <p className="mt-2 text-sm text-slate-500">{t('Enter the email address linked to your account and we’ll send reset instructions.')}</p>
          </div>

          {error && <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}
          {message && <div role="status" className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-sm">{message}</div>}

          {!submitted ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="reset-email" className="block text-sm font-semibold text-slate-700 mb-1.5">{t('Email address')}</label>
                <input
                  id="reset-email"
                  type="email"
                  name="email"
                  autoComplete="email"
                  autoFocus
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={t('you@example.com')}
                  required
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg transition shadow-sm disabled:opacity-50 disabled:cursor-wait"
              >
                {loading ? t('Sending instructions…') : t('Send reset instructions')}
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => { setSubmitted(false); setMessage(''); setEmail('') }}
              className="w-full border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold py-2.5 rounded-lg transition"
            >
              {t('Use another email')}
            </button>
          )}

          <p className="mt-6 text-center text-sm text-slate-500">
            {t('Remember your password?')} <Link to="/login" className="text-indigo-600 font-semibold hover:underline">{t('Sign in')}</Link>
          </p>
        </section>
      </div>
    </main>
  )
}
