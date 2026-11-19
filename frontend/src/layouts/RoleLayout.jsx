import React from 'react'
import { useAuth } from '../context/AuthContext'
import WaiterLayout from './WaiterLayout'
import KitchenLayout from './KitchenLayout'
import BarLayout from './BarLayout'
import AccountantLayout from './AccountantLayout'
import ManagerLayout from './ManagerLayout'
import OperatorLayout from './OperatorLayout'
import OwnerLayout from './OwnerLayout'

const LAYOUTS = {
  waiter: WaiterLayout,
  kitchen: KitchenLayout,
  bar: BarLayout,
  accountant: AccountantLayout,
  manager: ManagerLayout,
  operator: OperatorLayout,
  owner: OwnerLayout,
}

/** Wraps shared pages in the current user's own role layout. */
export default function RoleLayout({ children }) {
  const { user } = useAuth()
  const Chosen = LAYOUTS[String(user?.role || '').toLowerCase()] || WaiterLayout
  return <Chosen>{children}</Chosen>
}
