import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { forgotPassword } from '../../api/endpoints'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')
    setSubmitted(false)
    setLoading(true)
    try {
      const res = await forgotPassword(email)
      setMessage(res.message || 'If an account exists, password reset instructions have been sent to your email.')
      setSubmitted(true)
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Request failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-400 flex items-center justify-center">
              <span className="text-white font-bold text-lg">B</span>
            </div>
            <h1 className="text-3xl font-black text-white tracking-tight">
              Bar<span className="text-indigo-400">Flow</span>
            </h1>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-xl space-y-4">
          <h2 className="text-xl font-bold text-slate-900 text-center">Forgot Password</h2>
          <p className="text-sm text-slate-500 text-center">Enter your username to reset your password.</p>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
              {error}
            </div>
          )}
          {message && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-lg p-3">
              {message}
            </div>
          )}

          {!submitted && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email address"
                  required
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg transition disabled:opacity-50"
              >
                {loading ? 'Sending...' : 'Send Reset Instructions'}
              </button>
            </form>
          )}

          {submitted && (
            <div className="text-center">
              <button type="button" onClick={() => { setSubmitted(false); setMessage(''); setEmail(''); }} className="text-indigo-600 font-semibold text-sm hover:underline">
                Submit another email
              </button>
            </div>
          )}

          <p className="text-center text-sm text-slate-500">
            Remember your password?{' '}
            <button type="button" onClick={() => navigate('/')} className="text-indigo-600 font-semibold hover:underline">
              Sign in
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
