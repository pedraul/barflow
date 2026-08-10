import axios from 'axios'

const rawApiUrl = import.meta.env.VITE_API_URL || 'https://barflow-backend-tezw.onrender.com'
const normalized = rawApiUrl.replace(/\/+$/, '')
const baseURL = normalized.endsWith('/api') ? normalized : `${normalized}/api`

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

export default api