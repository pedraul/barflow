import { PUBLIC_APP_URL } from './publicAppUrl'
import { slugifyWorkspace } from './workspaceUrl'

export function buildTableMenuUrl({ tableNumber, businessId, branchId, businessSlug }) {
  const params = new URLSearchParams({ table: String(tableNumber) })
  if (businessId) params.set('businessId', businessId)
  if (branchId && branchId !== 'all') params.set('branchId', branchId)

  const baseUrl = new URL(PUBLIC_APP_URL, window.location.origin)
  const baseSegments = baseUrl.pathname.split('/').filter(Boolean)
  const workspaceSlug = slugifyWorkspace(businessSlug)
  if (workspaceSlug && baseSegments[baseSegments.length - 1]?.toLowerCase() === workspaceSlug) {
    baseSegments.pop()
  }
  const basePath = baseSegments.length ? `/${baseSegments.join('/')}` : ''
  return `${baseUrl.origin}${basePath}/menu?${params.toString()}`
}
