import React from 'react'
import { useAuth } from '../context/AuthContext'
import { useOwner } from '../context/OwnerContext'

export default function BranchBadge() {
  const { user } = useAuth()
  const { activeBranchId, branches } = useOwner()
  const isOwner = String(user?.role || '').toLowerCase() === 'owner'
  const selectedBranch = branches.find((branch) => branch.id === activeBranchId)
  const branchName = isOwner
    ? activeBranchId === 'all' || !activeBranchId
      ? 'All branches'
      : selectedBranch?.name || user?.branch || 'Selected branch'
    : user?.branch || 'Unassigned branch'

  return (
    <div className="branch-badge" title={`Current branch: ${branchName}`}>
      <span className="branch-badge-label">Branch</span>
      <strong>{branchName}</strong>
    </div>
  )
}
