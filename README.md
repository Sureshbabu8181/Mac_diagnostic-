# PG / Hostel Management Application

## Product Overview

This is a production-oriented Next.js application for PG and hostel operators. It uses Google Sheets as the structured source of truth and Google Drive as the document store, with an adapter layer so the storage backend can later move to PostgreSQL, Firebase, or another database.

The app includes multi-role authentication, dashboards, CRUD APIs, reports, file upload routing, audit logs, soft delete support, seed data, and documentation for the Google Sheets/Drive layout.

## Feature List

- Multi-role access: Super Admin, Owner/Manager, Accountant, Caretaker, Resident.
- Dashboard: occupancy, available beds, due rent, collected rent, complaints, check-ins/check-outs, activity feed.
- Room and bed management with capacity/status modeling.
- Resident profiles with KYC and document references.
- Billing, invoices, partial payments, deposits, receipt file support.
- Maintenance complaints with priority, status flow, assignment, and image upload support.
- Meals/mess plan data model and notice support.
- Visitor logs, inventory, expenses, staff, notices, settings, audit logs.
- Search, pagination-ready APIs, loading states, empty states, CSV/PDF exports.
- Google Sheets and Google Drive service abstractions.

## Architecture Diagram

```text
Browser
  |
  | React / Tailwind UI
  v
Next.js App Router
  |
  | API route controllers
  v
Domain services
  |
  | StorageAdapter interface
  +--> DemoStorageAdapter in memory
  +--> GoogleSheetsAdapter via Google Sheets API
  |
  | FileStorage service
  +--> Google Drive API folders
```

## Folder Structure

```text
src/app                       Next.js pages and API routes
src/app/api/auth              login, logout, current user
src/app/api/[resource]        generic CRUD API
src/app/api/dashboard         operational dashboard API
src/app/api/files/upload      Drive upload endpoint
src/app/api/reports/[type]    JSON, CSV, PDF reports
src/components                shared UI components
src/lib/auth                  JWT session and password auth
src/lib/storage               storage adapters and Drive service
src/lib/models.ts             typed entities and sheet columns
src/lib/seed.ts               demo data
docs/api.md                   API catalog
docs/sheets-schema.md         Google Sheets schema
scripts/seed-demo.mjs         sample seed payload generator
```

## Database / Sheet Schema

See [docs/sheets-schema.md](./docs/sheets-schema.md). Required core sheets:

`users`, `properties`, `rooms`, `beds`, `residents`, `allocations`, `payments`, `invoices`, `complaints`, `maintenance_logs`, `visitors`, `mess_plans`, `notices`, `inventory_items`, `inventory_transactions`, `expenses`, `staff`, `audit_logs`, `settings`.

## API Endpoints

See [docs/api.md](./docs/api.md).

## Core Code Files

- `src/lib/models.ts` - typed domain records and Google Sheet column order.
- `src/lib/storage/storage-adapter.ts` - swappable storage contract.
- `src/lib/storage/google-sheets-adapter.ts` - Google Sheets database adapter.
- `src/lib/storage/google-drive-service.ts` - Google Drive upload service.
- `src/lib/auth/session.ts` - secure HTTP-only JWT session handling.
- `src/app/api/[resource]/route.ts` - generic list/create routes.
- `src/app/api/[resource]/[id]/route.ts` - get/update/soft-delete routes.
- `src/app/page.tsx` - responsive management dashboard.

## Setup Instructions

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy environment variables:

   ```bash
   cp .env.example .env.local
   ```

3. Run in demo mode:

   ```bash
   npm run dev
   ```

4. Open `http://localhost:3000`.

Demo users:

- `admin@sunrisepg.test`
- `owner@sunrisepg.test`
- `accounts@sunrisepg.test`
- `care@sunrisepg.test`
- `resident@sunrisepg.test`

Password: `Demo@12345`

## Google Sheets / Drive Setup

1. Create a Google Cloud project.
2. Enable Google Sheets API and Google Drive API.
3. Create a service account and JSON key.
4. Share the target spreadsheet and Drive folders with the service account email.
5. Create the sheets with headers from `docs/sheets-schema.md`.
6. Set `DATA_ADAPTER=google_sheets` and fill the Google environment variables.

## Deployment Steps

1. Deploy to Vercel, Render, Fly.io, or any Node-compatible host.
2. Add all environment variables in the deployment provider.
3. Set `AUTH_SECRET` to a strong random value.
4. Ensure the Google private key preserves newline characters as `\n`.
5. Share Sheets and Drive folders with the service account.
6. Run a smoke test: login, dashboard, list residents, upload a demo file, export CSV/PDF.

## Testing Checklist

- Login rejects invalid credentials.
- Each role can access only permitted routes.
- Dashboard numbers match sheet rows.
- Bed capacity is enforced before production customization.
- CRUD list/search/pagination works for all resources.
- Soft delete hides records from normal lists.
- Audit log rows are created for create/update/delete.
- File uploads land in the expected Drive folder.
- CSV and PDF exports download correctly.
- Mobile layout works at 360px width and desktop at 1440px.

## Assumptions

- Service-account based Google API access is the practical enterprise-ready default.
- Demo mode is enabled by default so the app runs without credentials.
- Advanced notification providers are integration placeholders; templates and API extension points are present.
- For high-volume production use, the adapter boundary should be reused to move structured data into PostgreSQL.
