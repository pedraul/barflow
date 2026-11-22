import axios from 'axios'
import { getAccountantBranch, isAccountantSession } from '../utils/accountantBranch'

const rawApiUrl = import.meta.env.VITE_API_URL || 'https://barflow-backend-tezw.onrender.com'
// Never talk to the API over plain HTTP from a deployed page (only a local dev server may use http).
const isLocalApi = /^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(rawApiUrl)
const secureApiUrl = !isLocalApi && /^http:\/\//i.test(rawApiUrl) ? rawApiUrl.replace(/^http:/i, 'https:') : rawApiUrl
const normalized = secureApiUrl.replace(/\/+$/, '')
const baseURL = normalized.endsWith('/api') ? normalized : `${normalized}/api`

console.log('[axios] baseURL =', baseURL)

const api = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token')

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  // Accountants choose the branch they work in; the server checks it belongs to the business.
  const branch = isAccountantSession() ? getAccountantBranch() : ''
  if (branch) {
    config.headers['X-Branch-Id'] = branch
  }

  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config

    // The business was suspended or deactivated while this person was signed in:
    // end the session and show the reason on the login page.
    const code = error.response?.data?.code
    if (error.response?.status === 403 && ['BUSINESS_SUSPENDED', 'BUSINESS_DEACTIVATED'].includes(code)
      && !/\/(auth|owner\/auth)\/login/.test(String(config?.url || ''))) {
      try {
        sessionStorage.setItem('barflow.loginNotice', error.response.data.error || 'Your business account is not active.')
        localStorage.removeItem('auth_token')
        localStorage.removeItem('auth_user')
      } catch { /* ignore */ }
      if (!/\/login$/.test(window.location.pathname)) window.location.assign('/login')
      return Promise.reject(error)
    }

    const isLoginCall = /\/(auth|owner\/auth|platform)\/login/.test(String(config?.url || ''))
    const onLoginPage = /\/login$/.test(window.location.pathname)

    // Session timeout (Settings → Security), or a platform admin account that was disabled/removed: sign in again.
    if (error.response?.status === 401 && ['SESSION_EXPIRED', 'ADMIN_INACTIVE'].includes(code) && !isLoginCall) {
      try {
        sessionStorage.setItem('barflow.loginNotice', error.response.data.error || 'Your session has expired. Please sign in again.')
        localStorage.removeItem('auth_token')
        localStorage.removeItem('auth_user')
      } catch { /* ignore */ }
      if (!onLoginPage) window.location.assign(window.location.pathname.startsWith('/admin') ? '/login?mode=admin' : '/login')
      return Promise.reject(error)
    }

    // Maintenance mode: show the platform's message on the sign-in page.
    if (error.response?.status === 503 && code === 'MAINTENANCE') {
      try { sessionStorage.setItem('barflow.loginNotice', error.response.data.error) } catch { /* ignore */ }
      if (!onLoginPage && !isLoginCall) window.location.assign('/login')
      return Promise.reject(error)
    }

    // Subscription ended or not paid: the owner can renew, staff are told to ask the owner.
    if (error.response?.status === 403 && code === 'SUBSCRIPTION_PENDING' && !isLoginCall) {
      let role = ''
      try { role = String(JSON.parse(localStorage.getItem('auth_user') || '{}').role || '').toLowerCase() } catch { /* ignore */ }
      const target = role === 'owner' ? '/owner/subscription' : '/subscription-expired'
      if (!window.location.pathname.startsWith(target)) window.location.assign(target)
      return Promise.reject(error)
    }

    const retryable = config &&
      config.method?.toLowerCase() === 'get' &&
      !axios.isCancel(error) &&
      (!error.response || [502, 503, 504].includes(error.response.status))

    if (!retryable || (config.__retryCount || 0) >= 2) {
      return Promise.reject(error)
    }

    config.__retryCount = (config.__retryCount || 0) + 1
    await new Promise((resolve) => setTimeout(resolve, 400 * 2 ** (config.__retryCount - 1)))
    return api.request(config)
  }
)

export default api