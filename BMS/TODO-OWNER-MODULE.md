# Owner Module Implementation Checklist

## Backend (Node.js & Express.js)
- [x] Analyze existing codebase structure
- [x] Create backend `ownerController.js` with all Owner-specific handlers
- [x] Create backend `ownerRoutes.js` with all endpoints wrapped in isAuthenticated + isRole('Owner')
- [x] Update `routes/index.js` to mount owner routes at `/api/v1/owner`
- [x] Update User model to include `branch_id` foreign key
- [x] Update AuditLog model to include `user_id`, `target_module`, `ip_address`
- [x] Update Subscription model to include `business_id`, `start_date`, `expiration_date`, `is_active`

## Frontend - Context Providers
- [x] Create `frontend/src/context/OwnerContext.jsx` - centralized Owner data context
- [x] Update `frontend/src/App.jsx` to wrap with OwnerProvider

## Frontend - Owner Pages/Components
- [x] Create `frontend/src/pages/owner/Overview.jsx` - Analytics Dashboard (KPI Cards, Branch Performance Grid, Activity Snapshot)
- [x] Create `frontend/src/pages/owner/UserManagement.jsx` - Staff Registry Directory + Employee Actions Modal
- [x] Create `frontend/src/pages/owner/GlobalInventory.jsx` - Inventory Supervision Table + Stock Movement Feed
- [x] Create `frontend/src/pages/owner/PayrollManagement.jsx` - Master Payroll Table + Payout Wizard
- [x] Create `frontend/src/pages/owner/AuditLogViewer.jsx` - System Activity Ledger (paginated, read-only)
- [x] Create `frontend/src/pages/owner/SaaSBilling.jsx` - Plan Status Widget + Renewal Actions
- [x] Update `frontend/src/pages/owner/Settings.jsx` - System Settings Component

## Frontend - Layout & Routing
- [x] Update `frontend/src/layouts/OwnerLayout.jsx` - Full sidebar with all Owner sub-navigation
- [x] Update `frontend/src/routes/AppRoutes.jsx` - Add routes for all Owner sub-views

## 🔴 ENHANCEMENTS NEEDED 🔴

### 1. Subscription Page (SaaSBilling.jsx) - COMPLETE REWRITE
- [ ] Plan selection: monthly, quarterly, annually with auto price calculation
- [ ] Payment method selection (mobile money, card, bank)
- [ ] Phone number entry for USSD payment
- [ ] Auto-calculation of money based on selected plan
- [ ] USSD code generation and display
- [ ] Payment verification flow
- [ ] Receipt generation and download/view
- [ ] Remaining time auto-display after subscription paid
- [ ] Next renewal date display
- [ ] Alert when subscription about to expire
- [ ] Redirect to renewal when no active plan
- [ ] Block features when no active subscription

### 2. Settings Page (Settings.jsx) - MAJOR ENHANCEMENT
- [ ] Full backup functionality (database dump with name)
- [ ] Restore backup (list backups, select to restore)
- [ ] File backup (list backup names, select to make backup from)
- [ ] Subscription settings (configure prices)
- [ ] Permissions settings (role-based permissions editor)
- [ ] Account settings (business info, email, SMTP)
- [ ] Security settings (password policy, login attempts, session timeout)
- [ ] Recover settings (backup restore, recovery options)

### 3. Dashboard (Overview.jsx) - ENHANCEMENT
- [ ] Subscription status check and banner when no active plan
- [ ] More comprehensive KPI stats
- [ ] Improved alert system for expiring subscription

### 4. UserManagement.jsx - ENHANCEMENT
- [ ] Ensure full CRUD (create, edit, delete, activate/deactivate, reset password)
- [ ] Ensure all fields as required (username, full name, email, phone, salary, role, password)