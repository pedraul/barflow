import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, Clock } from 'lucide-react'
import { SidebarLink } from './ui/SharedComponents'
import { usePreferences } from '../context/PreferencesContext'
import useMyGrants from '../hooks/useMyGrants'

/**
 * Sidebar section shown to workers the owner granted staff permissions.
 * Renders nothing when the worker has no grants.
 */
export default function GrantedStaffLinks({ showShifts = true }) {
  const navigate = useNavigate()
  const { t } = usePreferences()
  const { has } = useMyGrants()

  const canManageStaff = has('create_employees') || has('edit_employees') || has('reset_passwords')
  const canSeeShifts = showShifts && has('view_staff_performance')
  if (!canManageStaff && !canSeeShifts) return null

  return (
    <div>
      <p className="px-3 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">{t('Staff')}</p>
      <div className="space-y-1">
        {canManageStaff && (
          <SidebarLink icon={<Users size={18} />} label={t('Staff management')} onClick={() => navigate('/staff')} />
        )}
        {canSeeShifts && (
          <SidebarLink icon={<Clock size={18} />} label={t('Shifts & performance')} onClick={() => navigate('/staff/shifts')} />
        )}
      </div>
    </div>
  )
}
