import React from 'react'
import { useAuth } from '../context/AuthContext'
import { useOwner } from '../context/OwnerContext'
import { usePreferences } from '../context/PreferencesContext'

export default function BranchBadge() {
  const { t } = usePreferences()
  const { user } = useAuth()
  const { activeBranchId, branches, setActiveBranchId } = useOwner()
  const isOwner = String(user?.role || '').toLowerCase() === 'owner'
  const selectedBranch = branches.find((branch) => String(branch.id) === String(activeBranchId))
  const branchName = isOwner
    ? activeBranchId === 'all' || !activeBranchId
      ? t('All branches')
      : selectedBranch?.name || user?.branch || t('Selected branch')
    : user?.branch || t('Unassigned branch')

  return (
    <div className="branch-badge" title={`${t('Current branch:')} ${branchName}`}>
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
      ) : (
        <strong>{branchName}</strong>
      )}
    </div>
  )
}
