import React from 'react'
import { Route, Routes, Navigate } from 'react-router-dom'
import ProtectedRoute from '../components/ProtectedRoute'
import PageWrapper from '../components/PageWrapper'
import Login from '../pages/platform/Login'
import RegisterBusiness from '../pages/platform/RegisterBusiness'
import RenewSubscription from '../pages/platform/RenewSubscription'
import SuperAdminDashboard from '../pages/platform/SuperAdminDashboard'
import NotFoundPage from '../pages/NotFoundPage'
import ForgotPassword from '../pages/auth/ForgotPassword'
import ResetPassword from '../pages/auth/ResetPassword'
import TwoFactorVerify from '../pages/auth/TwoFactorVerify'
import TwoFactorSetup from '../pages/auth/TwoFactorSetup'
import OwnerOverview from '../pages/owner/Overview'
import OwnerUserManagement from '../pages/owner/UserManagement'
import OwnerSubscription from '../pages/owner/Subscription'
import OwnerWithdraw from '../pages/owner/Withdraw'
import OwnerTransfer from '../pages/owner/Transfer'
import OwnerRevenue from '../pages/owner/Revenue'
import ManagerDashboard from '../pages/manager/Dashboard'
import ManagerOrders from '../pages/manager/Orders'
import ManagerStaff from '../pages/manager/Staff'
import ManagerPassword from '../pages/manager/PasswordManagement'
import ManagerTransfer from '../pages/manager/Transfer'
import ApproveTransfers from '../pages/manager/ApproveTransfers'
import ApproveRefunds from '../pages/manager/ApproveRefunds'
import ManagerRefunds from '../pages/manager/Refunds'
import ApprovePayrolls from '../pages/manager/ApprovePayrolls'
import ApproveWithdrawals from '../pages/manager/ApproveWithdrawals'
import ManagerSettings from '../pages/manager/Settings'
import ManagerBarMenu from '../pages/manager/BarMenu'
import ManagerKitchenMenu from '../pages/manager/KitchenMenu'
import ManagerReports from '../pages/manager/Reports'
import OperatorReports from '../pages/operator/OperatorReports'
import ManagerRevenue from '../pages/manager/Revenue'
import WaiterDashboard from '../pages/waiter/Dashboard'
import AccountantDashboard from '../pages/accountant/Dashboard'
import AccountantOrders from '../pages/accountant/Orders'
import AccountantQR from '../pages/accountant/AccountantQR'
import AccountantSalary from '../pages/accountant/Salary'
import ReconciliationDashboard from '../pages/accountant/ReconciliationDashboard'
import AccountantTransfers from '../pages/accountant/Transfers'
import AccountantProfit from '../pages/accountant/Profit'
import AccountantSalesRevenue from '../pages/accountant/SalesRevenue'
import AccountantPayments from '../pages/accountant/Payments'
import AccountantRefunds from '../pages/accountant/Refunds'
import AccountantReports from '../pages/accountant/Reports'
import AccountantTaxes from '../pages/accountant/Taxes'
import EmptyPage from '../pages/EmptyPage'
import UserManagementPage from '../pages/UserManagementPage'
import CreateUserPage from '../pages/CreateUserPage'
import MyAccount from '../pages/MyAccount'
import ErrorBoundary from '../components/ErrorBoundary'
import Settings from '../pages/owner/Settings'
import OwnerLayout from '../layouts/OwnerLayout'
import ManagerLayout from '../layouts/ManagerLayout'
import AccountantLayout from '../layouts/AccountantLayout'
import WaiterLayout from '../layouts/WaiterLayout'
import OwnerQRWorkspace from '../pages/owner/OwnerQRWorkspace'
import OwnerWaiterOrders from '../pages/owner/OwnerWaiterOrders'
import OwnerAuditLogViewer from '../pages/owner/AuditLogViewer'
import { CustomerProvider } from '../context/CustomerContext'
import { NotificationProvider } from '../context/NotificationContext'
import MenuPage from '../pages/customer/MenuPage'
import CartPage from '../pages/customer/CartPage'
import PaymentPage from '../pages/customer/PaymentPage'
import QRCodeManager from '../pages/operator/QRCodeManager'
import KitchenDisplay from '../pages/kitchen/KitchenDisplay'
import KitchenLayout from '../layouts/KitchenLayout'
import BarDisplay from '../pages/bar/BarDisplay'
import BarLayout from '../layouts/BarLayout'
import OperatorOrderManagement from '../pages/operator/OperatorOrderManagement'
import OperatorReceipts from '../pages/operator/OperatorReceipts'
import OperatorReceiptDetail from '../pages/operator/OperatorReceiptDetail'
import OperatorLayout from '../layouts/OperatorLayout'
import WaiterOrders from '../pages/waiter/Orders'
import WaiterNewOrder from '../pages/waiter/WaiterNewOrder'
import WaiterCart from '../pages/waiter/WaiterCart'
import WaiterCheckout from '../pages/waiter/WaiterCheckout'
import WaiterUnpaidOrders from '../pages/waiter/UnpaidOrders'
import WaiterOrderHistory from '../pages/waiter/WaiterOrderHistory'
import NotificationsPage from '../pages/NotificationsPage'

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<PageWrapper />}>
      <Route path="/" element={<Navigate to="/login" replace />} />

      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/auth/2fa" element={<TwoFactorVerify />} />
      <Route path="/register" element={<RegisterBusiness />} />
      <Route path="/subscription-expired" element={
        <ProtectedRoute allow={['Owner', 'Manager', 'Accountant', 'Waiter', 'Kitchen', 'Bar', 'Operator']}>
          <RenewSubscription />
        </ProtectedRoute>
      } />
      <Route path="/owner/renew" element={
        <ProtectedRoute allow={['Owner']}>
          <RenewSubscription />
        </ProtectedRoute>
      } />

      {/* Super Admin Platform Routes */}
      <Route path="/admin/*" element={<SuperAdminDashboard />} />

      {/* Public Customer Ordering Flow (accessed by scanning a table QR code) */}
      <Route path="/menu" element={<CustomerProvider><MenuPage /></CustomerProvider>} />
      <Route path="/cart" element={<CustomerProvider><CartPage /></CustomerProvider>} />
      <Route path="/payment" element={<CustomerProvider><PaymentPage /></CustomerProvider>} />

      {/* Owner Routes */}
      <Route
        path="/settings/*"
        element={
          <ProtectedRoute checkSubscription allow={['Owner']}>
            <Settings />
          </ProtectedRoute>
        }
      />

      <Route
        path="/settings/*"
        element={
          <ProtectedRoute checkSubscription allow={['Owner']}>
            <Settings />
          </ProtectedRoute>
        }
      />

      <Route
        path="/dashboard/owner"
        element={
          <ProtectedRoute checkSubscription allow={['Owner']}>
            <OwnerLayout>
              <OwnerOverview />
            </OwnerLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/owner/subscription"
        element={
          <ProtectedRoute allow={['Owner']}>
            <OwnerSubscription />
          </ProtectedRoute>
        }
      />

      <Route
        path="/owner/withdraw"
        element={
          <ProtectedRoute checkSubscription allow={['Owner']}>
            <OwnerLayout>
              <OwnerWithdraw />
            </OwnerLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/owner/transfer"
        element={
          <ProtectedRoute checkSubscription allow={['Owner']}>
            <OwnerLayout>
              <OwnerTransfer />
            </OwnerLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/owner/revenue"
        element={
          <ProtectedRoute checkSubscription allow={['Owner']}>
            <OwnerLayout>
              <OwnerRevenue />
            </OwnerLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/owner/qr-orders"
        element={
          <ProtectedRoute checkSubscription allow={['Owner']}>
            <OwnerLayout>
              <OwnerQRWorkspace />
            </OwnerLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/owner/waiter-orders"
        element={
          <ProtectedRoute checkSubscription allow={['Owner']}>
            <OwnerLayout>
              <OwnerWaiterOrders />
            </OwnerLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/owner/users"
        element={
          <ProtectedRoute checkSubscription allow={['Owner']}>
            <OwnerLayout>
              <OwnerUserManagement />
            </OwnerLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/owner/audit-logs"
        element={
          <ProtectedRoute checkSubscription allow={['Owner']}>
            <OwnerLayout>
              <OwnerAuditLogViewer />
            </OwnerLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/settings/*"
        element={
          <ProtectedRoute checkSubscription allow={['Owner']}>
            <Settings />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings/2fa"
        element={
          <ProtectedRoute checkSubscription allow={['Owner', 'Manager']}>
            <OwnerLayout>
              <TwoFactorSetup />
            </OwnerLayout>
          </ProtectedRoute>
        }
      />

      {/* Manager Routes */}
      <Route
        path="/dashboard/manager"
        element={
          <ProtectedRoute checkSubscription allow={['Manager']}>
            <ManagerLayout>
              <ManagerDashboard />
            </ManagerLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/manager/dashboard"
        element={
          <ProtectedRoute checkSubscription allow={['Manager']}>
            <ManagerLayout>
              <ManagerDashboard />
            </ManagerLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/manager/orders"
        element={
          <ProtectedRoute checkSubscription allow={['Manager']}>
            <ManagerLayout>
              <ManagerOrders />
            </ManagerLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/manager/staff"
        element={
          <ProtectedRoute checkSubscription allow={['Manager']}>
            <ManagerLayout>
              <ManagerStaff />
            </ManagerLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/manager/staff/manage"
        element={
          <ProtectedRoute checkSubscription allow={['Manager']}>
            <ManagerLayout>
              <UserManagementPage accessRole="Manager" />
            </ManagerLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/manager/staff/create"
        element={
          <ProtectedRoute checkSubscription allow={['Manager']}>
            <ManagerLayout>
              <CreateUserPage accessRole="Manager" />
            </ManagerLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/manager/staff/password"
        element={
          <ProtectedRoute checkSubscription allow={['Manager']}>
            <ManagerLayout>
              <ManagerPassword />
            </ManagerLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/manager/transfer"
        element={
          <ProtectedRoute checkSubscription allow={['Manager']}>
            <ManagerLayout>
              <ManagerTransfer />
            </ManagerLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/manager/transfer/transfers"
        element={
          <ProtectedRoute checkSubscription allow={['Manager']}>
            <ManagerLayout>
              <ApproveTransfers />
            </ManagerLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/manager/transfer/refunds"
        element={
          <ProtectedRoute checkSubscription allow={['Manager']}>
            <ManagerLayout>
              <ManagerRefunds />
            </ManagerLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/manager/transfer/payrolls"
        element={
          <ProtectedRoute checkSubscription allow={['Manager', 'Owner']}>
            <ManagerLayout>
              <ApprovePayrolls />
            </ManagerLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/manager/withdrawals"
        element={
          <ProtectedRoute checkSubscription allow={['Manager', 'Owner']}>
            <ManagerLayout>
              <ApproveWithdrawals />
            </ManagerLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/manager/settings"
        element={
          <ProtectedRoute checkSubscription allow={['Manager']} permission="canManageSettings">
            <ManagerLayout>
              <ManagerSettings />
            </ManagerLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/manager/bar-menu"
        element={
          <ProtectedRoute checkSubscription allow={['Manager']}>
            <ManagerLayout>
              <ManagerBarMenu />
            </ManagerLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/manager/kitchen-menu"
        element={
          <ProtectedRoute checkSubscription allow={['Manager']}>
            <ManagerLayout>
              <ManagerKitchenMenu />
            </ManagerLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/manager/reports"
        element={
          <ProtectedRoute checkSubscription allow={['Manager']}>
            <ManagerLayout>
              <ManagerReports />
            </ManagerLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/manager/revenue"
        element={
          <ProtectedRoute checkSubscription allow={['Manager']}>
            <ManagerLayout>
              <ManagerRevenue />
            </ManagerLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/manager/staff"
        element={
          <ProtectedRoute checkSubscription allow={['Manager']}>
            <ManagerLayout>
              <UserManagementPage accessRole="Manager" />
            </ManagerLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/manager/staff/create"
        element={
          <ProtectedRoute checkSubscription allow={['Manager']}>
            <ManagerLayout>
              <CreateUserPage accessRole="Manager" />
            </ManagerLayout>
          </ProtectedRoute>
        }
      />

      {/* Operator / Manager: Table QR code generation & printing */}
      <Route
        path="/operator/qr-codes"
        element={
          <ProtectedRoute checkSubscription allow={['Manager', 'Owner']}>
            <ManagerLayout>
              <QRCodeManager />
            </ManagerLayout>
          </ProtectedRoute>
        }
      />

      {/* Accountant Routes */}
      <Route
        path="/dashboard/accountant"
        element={
          <ProtectedRoute checkSubscription allow={['Accountant']}>
            <AccountantLayout>
              <AccountantDashboard />
            </AccountantLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/accountant/dashboard"
        element={
          <ProtectedRoute checkSubscription allow={['Accountant']}>
            <AccountantLayout>
              <AccountantDashboard />
            </AccountantLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/accountant/salary"
        element={
          <ProtectedRoute checkSubscription allow={['Accountant']}>
            <AccountantLayout>
              <AccountantSalary />
            </AccountantLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/accountant/reconciliations"
        element={
          <ProtectedRoute checkSubscription allow={['Accountant']}>
            <AccountantLayout>
              <ReconciliationDashboard />
            </AccountantLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/accountant/sales-revenue"
        element={
          <ProtectedRoute checkSubscription allow={['Accountant']}>
            <AccountantLayout>
              <AccountantSalesRevenue />
            </AccountantLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/accountant/payments"
        element={
          <ProtectedRoute checkSubscription allow={['Accountant']}>
            <AccountantLayout>
              <AccountantPayments />
            </AccountantLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/accountant/refunds"
        element={
          <ProtectedRoute checkSubscription allow={['Accountant']}>
            <AccountantLayout>
              <AccountantRefunds />
            </AccountantLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/accountant/reports"
        element={
          <ProtectedRoute checkSubscription allow={['Accountant']}>
            <AccountantLayout>
              <AccountantReports />
            </AccountantLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/accountant/settings"
        element={
          <ProtectedRoute checkSubscription allow={['Accountant']} permission="canManageSettings">
            <AccountantLayout>
              <ManagerSettings workspaceLabel="Accountant workspace" pageTitle="System settings" subtitle="Manage system settings and recovery actions." />
            </AccountantLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/accountant/taxes"
        element={
          <ProtectedRoute checkSubscription allow={['Accountant']}>
            <AccountantLayout>
              <AccountantTaxes />
            </AccountantLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/accountant/transfers"
        element={
          <ProtectedRoute checkSubscription allow={['Accountant']}>
            <AccountantLayout>
              <AccountantTransfers />
            </AccountantLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/accountant/profit"
        element={
          <ProtectedRoute checkSubscription allow={['Accountant']}>
            <AccountantLayout>
              <AccountantProfit />
            </AccountantLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/accountant/orders"
        element={
          <ProtectedRoute checkSubscription allow={['Accountant']}>
            <AccountantLayout>
              <AccountantOrders />
            </AccountantLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/accountant/qr"
        element={
          <ProtectedRoute checkSubscription allow={['Accountant']}>
            <AccountantLayout>
              <AccountantQR />
            </AccountantLayout>
          </ProtectedRoute>
        }
      />

      {/* Waiter Routes */}
      <Route
        path="/dashboard/waiter"
        element={
          <ProtectedRoute checkSubscription allow={['Waiter']}>
            <WaiterLayout>
              <WaiterDashboard />
            </WaiterLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/waiter/dashboard"
        element={
          <ProtectedRoute checkSubscription allow={['Waiter']}>
            <WaiterLayout>
              <WaiterDashboard />
            </WaiterLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/waiter/new-order"
        element={
          <ProtectedRoute checkSubscription allow={['Waiter']}>
            <WaiterLayout>
              <WaiterNewOrder />
            </WaiterLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/waiter/cart"
        element={
          <ProtectedRoute checkSubscription allow={['Waiter']}>
            <WaiterLayout>
              <WaiterCart />
            </WaiterLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/waiter/checkout"
        element={
          <ProtectedRoute checkSubscription allow={['Waiter']}>
            <WaiterLayout>
              <WaiterCheckout />
            </WaiterLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/waiter/unpaid-orders"
        element={
          <ProtectedRoute checkSubscription allow={['Waiter']}>
            <WaiterLayout>
              <WaiterUnpaidOrders />
            </WaiterLayout>
          </ProtectedRoute>
        }
      />

      {/* Waiter: Ready orders pickup (mark delivered to client) */}
      <Route
        path="/waiter/orders"
        element={
          <ProtectedRoute checkSubscription allow={['Waiter']}>
            <WaiterLayout>
              <WaiterOrders />
            </WaiterLayout>
          </ProtectedRoute>
        }
      />

      {/* Waiter: Order History */}
      <Route
        path="/waiter/order-history"
        element={
          <ProtectedRoute checkSubscription allow={['Waiter']}>
            <WaiterLayout>
              <WaiterOrderHistory />
            </WaiterLayout>
          </ProtectedRoute>
        }
      />

      {/* Kitchen Display — kitchen staff + managers/owners can view */}
      <Route
        path="/kitchen"
        element={
          <ProtectedRoute checkSubscription allow={['Kitchen', 'Operator', 'Manager', 'Owner']}>
            <KitchenLayout>
              <KitchenDisplay />
            </KitchenLayout>
          </ProtectedRoute>
        }
      />

      {/* Bar Display — bar staff + managers/owners can view */}
      <Route
        path="/bar"
        element={
          <ProtectedRoute checkSubscription allow={['Bar', 'Operator', 'Manager', 'Owner']}>
            <BarLayout>
              <BarDisplay />
            </BarLayout>
          </ProtectedRoute>
        }
      />

      {/* Kitchen / Bar dashboards (login lands here at /dashboard/<role>) */}
      <Route
        path="/dashboard/kitchen"
        element={
          <ProtectedRoute checkSubscription allow={['Kitchen', 'Operator', 'Manager', 'Owner']}>
            <KitchenLayout>
              <KitchenDisplay />
            </KitchenLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard/bar"
        element={
          <ProtectedRoute checkSubscription allow={['Bar', 'Operator', 'Manager', 'Owner']}>
            <BarLayout>
              <BarDisplay />
            </BarLayout>
          </ProtectedRoute>
        }
      />

      {/* Operator: redirect old dashboard route to order management */}
      <Route
        path="/dashboard/operator"
        element={
          <ProtectedRoute checkSubscription allow={['Operator', 'Manager', 'Owner']}>
            <OperatorLayout>
              <Navigate to="/operator/orders" replace />
            </OperatorLayout>
          </ProtectedRoute>
        }
      />

      {/* Operator: route incoming QR orders to kitchen / bar */}
      <Route
        path="/operator/orders"
        element={
          <ProtectedRoute checkSubscription allow={['Operator', 'Manager', 'Owner']}>
            <OperatorLayout>
              <OperatorOrderManagement />
            </OperatorLayout>
          </ProtectedRoute>
        }
      />

      {/* Operator: Printed Receipts */}
      <Route
        path="/operator/receipts/printed"
        element={
          <ProtectedRoute checkSubscription allow={['Operator', 'Manager', 'Owner']}>
            <OperatorLayout>
              <OperatorReceipts />
            </OperatorLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/operator/receipt/:id"
        element={
          <ProtectedRoute checkSubscription allow={['Operator', 'Manager', 'Owner']}>
            <OperatorLayout>
              <OperatorReceiptDetail />
            </OperatorLayout>
          </ProtectedRoute>
        }
      />

      {/* Operator Reports */}
      <Route
        path="/operator/reports"
        element={
          <ProtectedRoute checkSubscription allow={['Operator', 'Manager', 'Owner']}>
            <OperatorLayout>
              <OperatorReports />
            </OperatorLayout>
          </ProtectedRoute>
        }
      />

      {/* Operator Settings */}
      <Route
        path="/operator/settings"
        element={
          <ProtectedRoute checkSubscription allow={['Operator', 'Manager', 'Owner']}>
            <ManagerLayout>
              <ManagerSettings />
            </ManagerLayout>
          </ProtectedRoute>
        }
      />

      {/* Shared Routes */}
      <Route
        path="/account/*"
        element={
          <ProtectedRoute>
            <ErrorBoundary>
              <MyAccount />
            </ErrorBoundary>
          </ProtectedRoute>
        }
      />

      {/* Fallback catch-all routes */}
      <Route
        path="/owner/:page"
        element={
          <ProtectedRoute checkSubscription allow={['Owner']}>
            <OwnerLayout>
              <EmptyPage />
            </OwnerLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/manager/:page"
        element={
          <ProtectedRoute checkSubscription allow={['Manager']}>
            <ManagerLayout>
              <EmptyPage />
            </ManagerLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/accountant/:page"
        element={
          <ProtectedRoute checkSubscription allow={['Accountant']}>
            <AccountantLayout>
              <EmptyPage />
            </AccountantLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/waiter/:page"
        element={
          <ProtectedRoute checkSubscription allow={['Waiter']}>
            <WaiterLayout>
              <EmptyPage />
            </WaiterLayout>
          </ProtectedRoute>
        }
      />

      <Route path="/notifications" element={
        <ProtectedRoute>
          <NotificationsPage />
        </ProtectedRoute>
      } />

      <Route path="*" element={<NotFoundPage />} />
      <Route
        path="/settings/*"
        element={
          <ProtectedRoute checkSubscription allow={['Owner']}>
            <Settings />
          </ProtectedRoute>
        }
      />
      </Route>
    </Routes>
  )
}

