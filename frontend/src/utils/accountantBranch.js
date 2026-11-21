// The branch an accountant is working in. Accountants serve the whole business:
// every API request carries this choice in the X-Branch-Id header (checked by the server).
// '' = their assigned branch, 'all' = every branch (view only), otherwise a branch id.
const KEY = 'barflow.accountantBranchId'

export function getAccountantBranch() {
  try {
    return localStorage.getItem(KEY) || ''
  } catch {
    return ''
  }
}

export function setAccountantBranch(branchId) {
  try {
    if (branchId) localStorage.setItem(KEY, branchId)
    else localStorage.removeItem(KEY)
  } catch {
    // Storage unavailable: the assigned branch is used.
  }
}

export function clearAccountantBranch() {
  setAccountantBranch('')
}

export function isAccountantSession() {
  try {
    const user = JSON.parse(localStorage.getItem('auth_user') || 'null')
    return String(user?.role || '').toLowerCase() === 'accountant'
  } catch {
    return false
  }
}

/** True when an accountant is viewing all branches (records cannot be changed then). */
export function isAllBranchesView() {
  return isAccountantSession() && getAccountantBranch() === 'all'
}
