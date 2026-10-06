import axios from 'axios'

const rawApiUrl = import.meta.env.VITE_API_URL || 'https://barflow-backend-tezw.onrender.com'
const normalized = rawApiUrl.replace(/\/+$/, '')
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

  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config
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