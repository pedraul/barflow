# BarFlow

A bar management platform with React frontend and PostgreSQL backend.

## Overview

- Frontend: React + Vite + TypeScript
- Backend: Express + PostgreSQL
- Role-based dashboards: Owner, Manager, Accountant, and Waiter.
- Sales, inventory, staff shifts, reporting, and Cash / MTN MoMo / Airtel Money / POS payment records.

## Getting started

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Backend

```bash
cd backend
npm install
npm run dev
```

### Online mobile-money payments

Customer checkout sends collection requests to MTN MoMo and Airtel Money and checks payment status directly with the provider. Copy `backend/.env.example` to `backend/.env` and add the API credentials issued for your Rwanda merchant accounts:

- MTN MoMo Collection: subscription key, API user and API key; MTN Disbursement: its own subscription key, API user and API key.
- Airtel Money Open API: client ID and client secret, with disbursement enabled for the merchant account.

Payroll payouts are sent to each employee's saved mobile number after manager approval, or during the owner's confirmed bulk payout. Select MTN MoMo or Airtel Money when creating the payroll. MTN payouts require separate Disbursement API credentials; Airtel payouts require the disbursement product to be enabled on the Airtel merchant account. A payout remains processing until the provider confirms success; managers can check its status from the payroll approval screen.

Owner withdrawals and owner/accountant transfers use the same MTN MoMo or Airtel Money disbursement credentials. Choose the provider when creating a request; manager approval submits the payout, and the request stays processing until a manager checks and receives provider confirmation. An uncertain provider response must be checked before any retry; BarFlow does not automatically resend it. Outbound payout requests are funded by the balance and disbursement facility on the configured merchant provider account, not by BarFlow's sales records.

The example configuration uses provider sandbox URLs. Use production URLs and approved production credentials only after completing merchant onboarding and verifying that payout products are enabled. Keep credentials in backend environment variables; never expose them in frontend settings or commit them to source control. A collection payment is not marked paid until the provider confirms it. Cash payments remain pending until a signed-in staff member confirms receipt.

Subscription payments use the same provider-confirmed flow: a subscription becomes active only after MTN MoMo or Airtel Money confirms the amount and currency. Platform administrators can separately grant unpaid business access from the business list; this is an access override, not a payment or paid subscription, and remains in effect until an administrator revokes it.

Managers and owners can add branch-specific dining tables under **Tables & QR Codes** and print their QR codes. Each printed code includes the table number and opens the customer menu with the correct business, branch, and table identifiers. The dining-table schema is applied by the backend startup migration.

## Next steps

1. Create the database and apply the initial schema:

```bash
createdb barflow
psql -d barflow -f database/001_initial_schema.sql
```

2. Copy `.env.example` to `.env` and set `DATABASE_URL`.
3. Add authenticated API endpoints and enforce role permissions on every request.

### Business subdomains

Business workspaces use the registered business name as a URL-safe subdomain, for example:

```text
https://business-one.your-app.com
```

Set `VITE_WORKSPACE_DOMAIN=your-app.com` when building the frontend. Configure wildcard DNS (`*.your-app.com`) and make the frontend host serve the SPA for every subdomain. The backend migration `20260923_add_business_slug.sql` creates unique business slugs.
