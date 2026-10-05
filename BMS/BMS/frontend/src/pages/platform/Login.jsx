import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { login, platformLogin } from '../../api/endpoints'

export default function Login() {
  const navigate = useNavigate()
  const { login: setAuth } = useAuth()
  const [mode, setMode] = useState('business') // 'business' | 'admin'
  const [form, setForm] = useState({ username: '', password: '', email: '', password2: '' })
  const [error, setError] = useState('')
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
        const role = data.user.role
        if (data.user.subscriptionExpired && role !== 'owner') {
          navigate('/subscription-expired')
          return
        }
        if (data.user.subscriptionExpired && role === 'owner') {
          navigate('/owner/subscription')
          return
        }
        const roleRoutes = {
          owner: '/dashboard/owner',
          manager: '/manager/dashboard',
          accountant: '/accountant/dashboard',
          waiter: '/waiter/dashboard',
          operator: '/operator/orders',
          kitchen: '/kitchen',
          bar: '/bar',
        }
        navigate(roleRoutes[role] || '/')
      }
    } catch (err) {
      const status = err.response?.status
      const data = err.response?.data
      if (status === 403 && data?.code === 'SUBSCRIPTION_PENDING') {
        setError('Your business subscription is pending activation. Please complete payment and wait for admin verification.')
      } else {
        setError(err.response?.data?.error || err.response?.data?.message || 'Login failed. Please try again.')
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
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-400 flex items-center justify-center">
              <span className="text-white font-bold text-lg">B</span>
            </div>
            <h1 className="text-3xl font-black text-white tracking-tight">
              Bar<span className="text-amber-300">Flow</span>
            </h1>
          </div>
          <p className="text-slate-400 text-sm">Multi-business management platform</p>
        </div>

        {/* Mode Toggle */}
        <div className="flex bg-amber-200/40 rounded-xl p-1 mb-6">
          <button
            onClick={() => { setMode('business'); setError('') }}
            className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all ${
              mode === 'business' ? 'bg-amber-400 text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-amber-50'
            }`}
          >
            Business Login
          </button>
          <button
            onClick={() => { setMode('admin'); setError('') }}
            className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all ${
              mode === 'admin' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            Admin Login
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
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Username / Email</label>
                <input
                  type="text"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  placeholder="Enter your username"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Password</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  placeholder="Enter your password"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg transition disabled:opacity-50"
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
              <p className="text-center text-sm text-slate-500">
                Don't have an account?{' '}
                <Link to="/register" className="text-indigo-600 font-semibold hover:underline">
                  Register your business
                </Link>
              </p>
              <p className="text-center text-sm text-slate-500">
                <Link to="/forgot-password" className="text-indigo-600 font-semibold hover:underline">
                  Forgot Password?
                </Link>
              </p>
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Admin Email</label>
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
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Password</label>
                <input
                  type="password"
                  value={form.password2}
                  onChange={(e) => setForm({ ...form, password2: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  placeholder="Enter admin password"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-slate-800 hover:bg-amber-600 text-white font-semibold rounded-lg transition disabled:opacity-50"
              >
                {loading ? 'Signing in...' : 'Admin Sign In'}
              </button>
              <p className="text-center text-sm text-slate-500">
                <Link to="/forgot-password" className="text-indigo-600 font-semibold hover:underline">
                  Forgot Password?
                </Link>
              </p>
            </>
          )}
        </form>
      </div>
    </div>
  )
}