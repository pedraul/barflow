const platformPaths = new Set([
  'login', 'forgot-password', 'reset-password', 'auth', 'register', 'subscription-expired',
  'owner', 'admin', 'menu', 'cart', 'payment', 'settings', 'dashboard', 'manager',
  'accountant', 'waiter', 'operator', 'kitchen', 'bar', 'notifications', 'my-account',
  'qr-manager',
])

export function slugifyWorkspace(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function getWorkspaceBasePath(pathname = window.location.pathname) {
  const firstSegment = pathname.split('/').filter(Boolean)[0]?.toLowerCase()
  return firstSegment && !platformPaths.has(firstSegment) ? `/${firstSegment}` : ''
}

export function buildWorkspaceUrl(user, path) {
  const slug = slugifyWorkspace(user?.businessSlug)
  if (!slug) return path

  const workspacePath = path.startsWith('/') ? path : `/${path}`
  return `${window.location.origin}/${slug}${workspacePath}`
}