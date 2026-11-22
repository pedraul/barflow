import { useAuth } from '../../context/AuthContext'

export const PLATFORM_MODULES = ['businesses', 'subscriptions', 'payments', 'users', 'reports', 'settings', 'backup']

// Which modules each admin page needs (any one of them is enough). Mirrors backend/routes/platformRoutes.js.
export const PAGE_MODULES = {
  '/admin/businesses': ['businesses'],
  '/admin/plans': ['subscriptions'],
  '/admin/payments': ['payments'],
  '/admin/users': ['users'],
  '/admin/reports': ['reports'],
  '/admin/activity': ['reports', 'users'],
  '/admin/settings': ['settings'],
  '/admin/backup': ['backup'],
}

export function adminCan(user, ...modules) {
  if (!user?.isPlatformAdmin) return false
  if (user.role === 'super_admin') return true
  const perms = Array.isArray(user.permissions) ? user.permissions : []
  return modules.some((m) => perms.includes(m))
}

export function useAdminAccess() {
  const { user } = useAuth()
  return {
    user,
    isSuper: user?.isPlatformAdmin === true && user.role === 'super_admin',
    can: (...modules) => adminCan(user, ...modules),
  }
}
