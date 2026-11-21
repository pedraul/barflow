import React, { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useOwner } from '../context/OwnerContext'
import { usePreferences } from '../context/PreferencesContext'
import { fetchAccountantBranches } from '../api/endpoints'
import { getAccountantBranch, setAccountantBranch } from '../utils/accountantBranch'

// Accountants serve every branch of the business: they pick the branch they work in.
function AccountantBranchSelect({ user, t }) {
  const [branches, setBranches] = useState([])
  const [assignedId, setAssignedId] = useState(user?.branchId || '')
  const stored = getAccountantBranch()
  const value = stored || assignedId || ''

  useEffect(() => {
    let active = true
    fetchAccountantBranches()
      .then((data) => {
        if (!active) return
        const list = data?.branches || []
        setBranches(list)
        if (data?.assignedBranchId) setAssignedId(data.assignedBranchId)
        // The saved branch was closed or removed: go back to the assigned branch.
        if (stored && stored !== 'all' && !list.some((b) => String(b.id) === String(stored))) {
          setAccountantBranch('')
          window.location.reload()
        }
      })
      .catch(() => {})
    return () => { active = false }
  }, [])

  const change = (next) => {
    setAccountantBranch(next === assignedId ? '' : next)
    // Reload so every page and shared list is fetched again for the new branch.
    window.location.reload()
  }

  if (!branches.length) return <strong>{user?.branch || t('Unassigned branch')}</strong>

  return (
    <select
      aria-label={t('Select branch')}
      className="branch-badge-select"
      value={value}
      onChange={(event) => change(event.target.value)}
    >
      <option value="all">{t('All branches')}</option>
      {branches.map((branch) => (
        <option key={branch.id} value={branch.id}>
          {branch.name}{String(branch.id) === String(assignedId) ? ` (${t('my branch')})` : ''}
        </option>
      ))}
    </select>
  )
}

export default function BranchBadge() {
  const { t } = usePreferences()
  const { user } = useAuth()
  const { activeBranchId, branches, setActiveBranchId } = useOwner()
  const role = String(user?.role || '').toLowerCase()
  const isOwner = role === 'owner'
  const isAccountant = role === 'accountant'
  const selectedBranch = branches.find((branch) => String(branch.id) === String(activeBranchId))
  const branchName = isOwner
    ? activeBranchId === 'all' || !activeBranchId
      ? t('All branches')
      : selectedBranch?.name || user?.branch || t('Selected branch')
    : user?.branch || t('Unassigned branch')

  return (
    <div className="branch-badge" title={isAccountant ? t('Branch you are working in') : `${t('Current branch:')} ${branchName}`}>
      <span className="branch-badge-label">{t('Branch')}</span>
      {isOwner ? (
        <select
          aria-label={t('Select branch scope')}
          className="branch-badge-select"
          value={activeBranchId || 'all'}
          onChange={(event) => setActiveBranchId(event.target.value)}
        >
          <option value="all">{t('All branches')}</option>
          {activeBranchId !== 'all' && !selectedBranch && (
            <option value={activeBranchId}>{branchName}</option>
          )}
          {branches.filter((branch) => branch.isActive !== false).map((branch) => (
            <option key={branch.id} value={branch.id}>{branch.name}</option>
          ))}
        </select>
      ) : isAccountant ? (
        <AccountantBranchSelect user={user} t={t} />
      ) : (
        <strong>{branchName}</strong>
      )}
    </div>
  )
}
