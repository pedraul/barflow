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
