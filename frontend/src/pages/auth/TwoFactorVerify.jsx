import React, { useState, useRef, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import * as api from '../../api/endpoints'
import { useAuth } from '../../context/AuthContext'
import { ShieldCheck, Info, RotateCw, HelpCircle, Lock, Mail, Smartphone } from 'lucide-react'

export default function TwoFactorVerify() {
  const [searchParams] = useSearchParams()
  const tempToken = searchParams.get('tempToken')
  const email = searchParams.get('email') || ''
  const method = searchParams.get('method') || 'email'
  const navigate = useNavigate()
  const { login, user } = useAuth()

  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [timer, setTimer] = useState(45)
  const inputRefs = useRef([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [pendingDashboard, setPendingDashboard] = useState('')

  const userId = searchParams.get('userId')
  const adminId = searchParams.get('adminId')
  const role = searchParams.get('role')
  const isPlatformAdmin = searchParams.get('isPlatformAdmin') === 'true'

  const ROLE_DASHBOARD = {
    owner: '/dashboard/owner',
    manager: '/manager/dashboard',
    accountant: '/accountant/dashboard',
    waiter: '/waiter/dashboard',
    operator: '/operator/orders',
    kitchen: '/kitchen',
    bar: '/bar',
    super_admin: '/admin/dashboard',
  }

  useEffect(() => {
    if (pendingDashboard && user) {
      navigate(pendingDashboard, { replace: true })
      setPendingDashboard('')
    }
  }, [pendingDashboard, user, navigate])

  useEffect(() => {
    if (!tempToken && !isPlatformAdmin) {
      navigate('/login', { replace: true })
    }
  }, [tempToken, isPlatformAdmin, navigate])

  useEffect(() => {
    if (isPlatformAdmin && email && adminId) {
      // For platform admin, the code is already sent by the login endpoint
      setTimer(45)
    } else if (tempToken && email && userId) {
      setLoading(true)
      api.sendTwoFactorCode(email, userId, method)
        .then(() => setTimer(45))
        .catch((err) => setError(err.message || 'Failed to send verification code.'))
        .finally(() => setLoading(false))
    }
  }, [tempToken, email, userId, adminId, method, isPlatformAdmin, navigate])

  useEffect(() => {
    if (timer > 0) {
      const interval = setInterval(() => {
        setTimer((prev) => prev - 1)
      }, 1000)
      return () => clearInterval(interval)
    }
  }, [timer])

  const handleChange = (element, index) => {
    const value = element.value
    if (isNaN(Number(value))) return false

    const newOtp = [...otp]
    newOtp[index] = value.substring(value.length - 1)
    setOtp(newOtp)

    if (value && index < 5) {
      inputRefs.current[index + 1].focus()
    }
  }

  const handleKeyDown = (e, index) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1].focus()
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const code = otp.join('')
      if (isPlatformAdmin && adminId) {
        const result = await api.verifyPlatform2FA(adminId, code)
        if (result.token) {
          login({
            token: result.token,
            user: result.user,
          })
          const dashboard = ROLE_DASHBOARD[result.user?.role || role] || '/admin/dashboard'
          setPendingDashboard(dashboard)
        }
      } else {
        const result = await api.verifyTwoFactorCode(userId, code)
        if (result.success) {
          const rawUser = decodeJwtPayload(tempToken) || {}
          login({
            token: tempToken,
            user: {
              id: rawUser.id || userId,
              name: rawUser.name || '',
              email: rawUser.email || email,
              phone: rawUser.phone || '',
              role: rawUser.role || role || '',
              branch: rawUser.branch || '',
              avatar: rawUser.avatar || '',
              businessId: rawUser.businessId || '',
              businessName: rawUser.businessName || '',
              subscriptionStatus: rawUser.subscriptionStatus || '',
              subscriptionExpired: rawUser.subscriptionExpired,
            },
          })
          const dashboard = ROLE_DASHBOARD[rawUser.role || role] || '/'
          setPendingDashboard(dashboard)
        }
      }
    } catch (err) {
      setError(err.message || 'Invalid or expired code.')
    } finally {
      setLoading(false)
    }
  }

  function decodeJwtPayload(token) {
    try {
      if (!token || typeof token !== 'string') return null
      const parts = token.split('.')
      if (parts.length < 2) return null
      const payload = parts[0]
      const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
      const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=')
      const decoded = atob(padded)
      return JSON.parse(decoded)
    } catch {
      return null
    }
  }

  const handleResend = async () => {
    if (timer > 0) return
    setError('')
    setLoading(true)
    try {
      await api.sendTwoFactorCode(email, userId, method)
      setTimer(45)
    } catch (err) {
      setError(err.message || 'Failed to resend code.')
    } finally {
      setLoading(false)
    }
  }

  const formattedTime = `00:${timer.toString().padStart(2, '0')}`

  return (
    <div className="min-h-screen bg-[#F8F9FD] flex flex-col justify-center items-center p-4 font-sans text-gray-800">
      <div className="bg-white rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.04)] w-full max-w-[480px] p-8 md:p-10 text-center flex flex-col items-center">
        
        <div className="flex items-center gap-2 mb-8">
          <div className="text-[#5B41DE]">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 22h8" />
              <path d="M12 11v11" />
              <path d="m19 3-7 8-7-8Z" />
            </svg>
          </div>
          <div className="flex flex-col items-start leading-tight">
            <span className="font-bold text-xl tracking-tight text-[#1E1B4B]">
              Bar<span className="text-[#5B41DE]">Flow</span>
            </span>
            <span className="text-[10px] text-gray-400 font-medium tracking-wide">
              Smart Bar Management
            </span>
          </div>
        </div>

        <div className="relative flex items-center justify-center w-48 h-28 mb-6">
          <div className="absolute inset-0 border border-dashed border-gray-200 rounded-full scale-100 opacity-60"></div>
          <div className="absolute inset-2 border border-dashed border-gray-200 rounded-full scale-90 opacity-40"></div>

          <div className="absolute top-0 bg-gray-50 border border-gray-100 rounded-full p-1.5 shadow-sm text-gray-400 text-xs font-bold">
            G
          </div>
          <div className="absolute left-2 top-1/2 -translate-y-1/2 bg-gray-50 border border-gray-100 rounded-full p-1.5 shadow-sm text-gray-400">
            <Mail className="w-3.5 h-3.5" />
          </div>
          <div className="absolute right-2 top-1/2 -translate-y-1/2 bg-gray-50 border border-gray-100 rounded-full p-1.5 shadow-sm text-gray-400">
            <Smartphone className="w-3.5 h-3.5" />
          </div>

          <div className="relative z-10 bg-gradient-to-br from-[#6D53F2] to-[#5136DC] p-4 rounded-[22px] shadow-lg shadow-indigo-200">
            <Lock className="w-8 h-8 text-white" />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-[#1E1B4B] mb-2 tracking-tight">
          Two-Factor Authentication
        </h1>
        <p className="text-sm text-gray-500 mb-6 font-normal">
          Enter the 6-digit code sent to <br />
          <span className="font-semibold text-[#5B41DE]">{email || 'your email'}</span>
        </p>

        <form onSubmit={handleSubmit} className="w-full">
          <div className="flex gap-2.5 mb-6 justify-center w-full">
            {otp.map((data, index) => (
              <input
                key={index}
                type="text"
                maxLength="1"
                ref={(el) => (inputRefs.current[index] = el)}
                value={data}
                onChange={(e) => handleChange(e.target, index)}
                onKeyDown={(e) => handleKeyDown(e, index)}
                className="w-11 h-12 md:w-12 md:h-12 border-2 border-gray-200 rounded-xl text-center text-lg font-bold text-gray-800 focus:border-[#5B41DE] focus:ring-0 focus:outline-none transition-colors"
              />
            ))}
          </div>

          {error && (
            <div className="w-full bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-4">
              {error}
            </div>
          )}

          {loading && otp.every((v) => v === '') && (
            <p className="text-sm text-gray-500 mb-4">Sending verification code...</p>
          )}

          <button
            type="submit"
            className="w-full bg-[#5B41DE] hover:bg-[#4C33CF] active:scale-[0.99] text-white font-medium py-3.5 rounded-xl shadow-md shadow-indigo-100 transition-all flex items-center justify-center gap-2 mb-6 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loading || otp.some((v) => v === '')}
          >
            <ShieldCheck className="w-5 h-5" />
            <span>{loading ? 'Verifying...' : 'Verify'}</span>
          </button>
        </form>

        <div className="relative w-full flex items-center justify-center mb-6">
          <div className="border-t border-gray-100 w-full"></div>
          <span className="bg-white px-3 text-[10px] text-gray-400 font-medium absolute">
            or
          </span>
        </div>

        <button
          onClick={handleResend}
          disabled={timer > 0 || loading}
          className={`flex items-center gap-2 text-sm font-semibold transition-colors mb-2 ${
            timer > 0 ? 'text-gray-400 cursor-not-allowed' : 'text-[#5B41DE] hover:underline'
          }`}
        >
          <RotateCw className="w-4 h-4" />
          <span>Resend Code</span>
        </button>

        <p className="text-xs text-gray-400 font-medium">
          You can request a new code in{' '}
          <span className="text-gray-700 font-semibold">{formattedTime}</span>
        </p>
      </div>

      <div className="mt-8 flex items-center gap-2 text-xs text-gray-500 font-normal">
        <HelpCircle className="w-4 h-4 text-gray-400" />
        <span>Didn't receive the code? Check your spam folder or try again.</span>
      </div>
    </div>
  )
}
