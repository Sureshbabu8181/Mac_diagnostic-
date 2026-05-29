# Project Summary And Implementation Plan

## Current Architecture

Sunrise PG is a Next.js App Router application for PG/hostel operations. It has a single responsive management console, protected JSON APIs, workflow endpoints, typed domain models, and a swappable storage adapter.

```text
Browser UI
  -> Next.js app routes and API routes
  -> auth/session helpers
  -> domain workflow routes
  -> StorageAdapter
     -> DemoStorageAdapter for local demo data
     -> GoogleSheetsAdapter for structured tables
  -> Google Drive upload service for persisted files
```

## Modules And Workflow

- `src/app/page.tsx`: client dashboard with modules for residents, rooms, billing, maintenance, visitors, meals/notices, inventory, reports, and settings.
- `src/app/api/auth/*`: login, logout, and current-session endpoints using an HTTP-only `pg_session` cookie.
- `src/app/api/[resource]/*`: generic list/create/get/update/soft-delete routes for all modeled sheets.
- `src/app/api/workflows/*`: multi-step operations for check-in, invoice generation, payment posting, complaint status, and inventory movement.
- `src/app/api/dashboard/route.ts` plus `src/lib/dashboard.ts`: aggregates operational metrics from storage lists.
- `src/app/api/files/upload/route.ts`: uploads files to Google Drive when `DATA_ADAPTER=google_sheets`; returns demo file IDs in local mode.
- `src/lib/models.ts`: entity types, role types, sheet names, and exact sheet column order.
- `src/lib/storage/*`: storage contract, demo adapter, Google Sheets adapter, Google Drive upload service, and adapter factory.
- `docs/api.md`: API route catalog.
- `docs/sheets-schema.md`: Google Sheets schema and Drive folder layout.

Current flow: the UI auto-authenticates with demo credentials, loads dashboard data and resource lists, lets operators run forms/actions, then calls protected API routes. API routes validate roles, call the storage adapter, and create audit-log rows.

## Google Workspace Storage Strategy

Use Google Workspace as a lightweight persistence layer:

- Google Sheets: structured database tables for operational records.
- Google Docs: editable long-form content and reference documents.
- Google Drive: folder hierarchy, file persistence, permissions boundary, and file IDs referenced by Sheet rows.

Keep the existing `StorageAdapter` boundary. Add document storage as a separate service instead of mixing rich documents into Sheets rows.

```text
src/lib/storage/google-sheets-adapter.ts  tables and indexes
src/lib/storage/google-drive-service.ts   folders and binary files
src/lib/storage/google-docs-service.ts    document create/read/update references
src/lib/storage/cache.ts                  short-lived per-process cache
```

Recommended free-tier variant:

```text
Next.js API routes
  -> AppsScriptAdapter
  -> Apps Script Web App
     -> SpreadsheetApp for tables
     -> DriveApp for files/folders
     -> DocumentApp for Google Docs
```

This avoids Google API client OAuth setup inside the Next app. Google authorization is granted once when deploying the Apps Script web app.

## Sheets Database Design

Existing sheets are appropriate for a lightweight database:

- Core: `users`, `properties`, `rooms`, `beds`, `residents`, `allocations`
- Money: `invoices`, `payments`, `expenses`
- Operations: `complaints`, `maintenance_logs`, `visitors`, `inventory_items`, `inventory_transactions`
- Content/config: `notices`, `mess_plans`, `settings`, `audit_logs`, `staff`

Recommended additions:

- `documents`: `id`, `propertyId`, `type`, `title`, `driveFileId`, `docId`, `relatedEntity`, `relatedEntityId`, `status`, `createdAt`, `updatedAt`
- `sync_metadata`: `id`, `propertyId`, `resource`, `etag`, `lastFetchedAt`, `lastSyncedAt`, `valueJson`

Use row IDs as app primary keys. Store Drive/Docs IDs as references, not embedded content.

## Drive And Docs Layout

```text
Sunrise-PG/
  data/
    sheets/
  documents/
    agreements/
    resident_templates/
    notices/
    policies/
    staff_docs/
  uploads/
    id_proofs/
    resident_photos/
    receipts/
    complaint_images/
  exports/
    reports/
    backups/
```

Google Docs should store document-based content:

- Rental agreements and templates
- Policy/reference documents
- Long notices or circulars
- Staff onboarding/checklist documents
- Resident-specific document copies

## Required Permissions And Scopes

Current code uses these broad scopes:

- `https://www.googleapis.com/auth/spreadsheets`
- `https://www.googleapis.com/auth/drive`

Recommended least-privilege scopes before production:

- `https://www.googleapis.com/auth/spreadsheets`: read/write only the configured spreadsheet.
- `https://www.googleapis.com/auth/drive.file`: create/read/update files created or opened by the app.
- `https://www.googleapis.com/auth/documents`: create/read/update app-managed Google Docs.

Sensitive permission note: full Drive scope (`https://www.googleapis.com/auth/drive`) is broader than needed for most deployments. Do not enable or keep full Drive access without explicit owner approval.

Apps Script deployment permissions are approved in Google during script deployment. The script will request access to the spreadsheet, Drive files/folders, and Docs it creates or edits. Deploy it as "Me" and restrict access to the app caller model you choose.

## Environment Variables

```bash
DATA_ADAPTER=google_sheets
AUTH_SECRET=replace-with-strong-random-secret
APPS_SCRIPT_WEB_APP_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
APPS_SCRIPT_API_KEY=replace-with-random-shared-secret
GOOGLE_SERVICE_ACCOUNT_EMAIL=service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_SHEET_ID=spreadsheet-id
GOOGLE_DRIVE_ROOT_FOLDER_ID=root-folder-id
GOOGLE_DRIVE_AGREEMENTS_FOLDER_ID=folder-id
GOOGLE_DRIVE_ID_PROOFS_FOLDER_ID=folder-id
GOOGLE_DRIVE_RESIDENT_PHOTOS_FOLDER_ID=folder-id
GOOGLE_DRIVE_RECEIPTS_FOLDER_ID=folder-id
GOOGLE_DRIVE_COMPLAINT_IMAGES_FOLDER_ID=folder-id
GOOGLE_DRIVE_EXPORTS_FOLDER_ID=folder-id
GOOGLE_DRIVE_NOTICES_FOLDER_ID=folder-id
GOOGLE_DRIVE_STAFF_DOCS_FOLDER_ID=folder-id
```

Add when Google Docs support is implemented:

```bash
GOOGLE_DOCS_TEMPLATES_FOLDER_ID=folder-id
GOOGLE_DOCS_POLICIES_FOLDER_ID=folder-id
```

## API Setup Steps

1. Create a Google Cloud project.
2. Enable Google Sheets API, Google Drive API, and Google Docs API.
3. Create a service account and JSON key for server-side access.
4. Share the spreadsheet and root Drive folder with the service account email.
5. Create sheet tabs with headers from `docs/sheets-schema.md`.
6. Add environment variables to `.env.local` and hosting provider settings.
7. Run in demo mode first, then switch `DATA_ADAPTER=google_sheets`.

Reference: the Sheets API v4 REST service is hosted at `https://sheets.googleapis.com` and supports `spreadsheets.values.get`, `append`, `batchGet`, `update`, and `batchUpdate`.

## Apps Script Setup Steps

1. Create a Google Sheet for the app tables.
2. Open Apps Script and create a standalone project.
3. Copy `google-apps-script/Code.gs` into the Apps Script editor.
4. In Apps Script project settings, add script properties:
   - `SPREADSHEET_ID`
   - `API_KEY`
   - `FOLDER_AGREEMENTS`
   - `FOLDER_ID_PROOFS`
   - `FOLDER_RESIDENT_PHOTOS`
   - `FOLDER_RECEIPTS`
   - `FOLDER_COMPLAINT_IMAGES`
   - `FOLDER_EXPORTS`
   - `FOLDER_NOTICES`
   - `FOLDER_STAFF_DOCS`
   - `FOLDER_DOCUMENTS`
5. Deploy as a web app.
6. Set execution identity to your owner/admin account.
7. Set access to the minimum that works for your deployment. For server-to-server use, the shared `API_KEY` in the POST body is the app-level guard.
8. Copy the web app URL into `APPS_SCRIPT_WEB_APP_URL`.
9. Set `DATA_ADAPTER=apps_script`.

## Optimized Implementation Plan

1. Tighten scopes.
   - Replace broad Drive scope with `drive.file` where possible.
   - Add Docs scope only after approval.

2. Add request caching.
   - Cache `allRows(entity)` results for 30-60 seconds.
   - Invalidate only the changed entity after create/update/delete.
   - Cache dashboard aggregates separately for 15-30 seconds.

3. Reduce Sheet reads.
   - Use `spreadsheets.values.batchGet` for dashboard and initial app load.
   - Fetch only needed ranges, not `A:ZZ`, once row width is known.
   - Avoid loading deleted rows unless requested.

4. Reduce Sheet writes.
   - Keep append for creates.
   - For updates, locate the row once and update only that row range.
   - Use `spreadsheets.values.batchUpdate` for workflows that update multiple sheets.

5. Add document service.
   - Create `google-docs-service.ts`.
   - Create docs from templates or plain text.
   - Store returned Docs/Drive IDs in the `documents` sheet.

6. Add Drive folder bootstrap.
   - Check for expected folders under `GOOGLE_DRIVE_ROOT_FOLDER_ID`.
   - Create missing folders only when an admin explicitly runs setup.
   - Save folder IDs to environment/config docs.

7. Add observability.
   - Log Google API request type, entity, and duration in development.
   - Never log private keys, document text, KYC values, or uploaded file contents.

## Sample API Requests

Append a resident row:

```http
POST https://sheets.googleapis.com/v4/spreadsheets/{spreadsheetId}/values/residents!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS
Authorization: Bearer {token}
Content-Type: application/json

{
  "values": [[
    "res_001", "prop_001", "Asha Rao", "9999999999", "asha@example.com",
    "Female", "", "Student", "Aadhaar", "XXXX", "Parent", "9888888888",
    "", "", "", "active", "2026-05-28T00:00:00.000Z", "2026-05-28T00:00:00.000Z"
  ]]
}
```

Sample response:

```json
{
  "spreadsheetId": "spreadsheet-id",
  "tableRange": "residents!A1:R10",
  "updates": {
    "spreadsheetId": "spreadsheet-id",
    "updatedRange": "residents!A11:R11",
    "updatedRows": 1,
    "updatedColumns": 18,
    "updatedCells": 18
  }
}
```

Batch read dashboard ranges:

```http
GET https://sheets.googleapis.com/v4/spreadsheets/{spreadsheetId}/values:batchGet?ranges=beds!A:H&ranges=invoices!A:O&ranges=complaints!A:N
Authorization: Bearer {token}
```

Sample response:

```json
{
  "spreadsheetId": "spreadsheet-id",
  "valueRanges": [
    { "range": "beds!A:H", "values": [["id", "propertyId"], ["bed_001", "prop_001"]] },
    { "range": "invoices!A:O", "values": [["id", "propertyId"], ["inv_001", "prop_001"]] }
  ]
}
```

Create an app-managed Google Doc:

```http
POST https://docs.googleapis.com/v1/documents
Authorization: Bearer {token}
Content-Type: application/json

{ "title": "Agreement - Asha Rao - 2026-05" }
```

Sample response:

```json
{
  "documentId": "doc-id",
  "title": "Agreement - Asha Rao - 2026-05"
}
```

## Low-Cost Deployment

- Vercel free tier is suitable for the current Next.js app.
- Keep demo mode as the default local path.
- Use service account credentials only in server environment variables.
- Prefer serverless API routes for low idle cost.
- Avoid polling. Refresh after mutations and use short TTL caches.
- Keep uploads in Drive and store only file IDs in Sheets.
- Move to PostgreSQL only when Sheets row count, concurrency, or reporting latency becomes a real limit.

## Approval Gates

Ask before:

- Enabling Google Docs API scope.
- Keeping or adding full Google Drive scope.
- Creating Drive folders automatically.
- Migrating existing data or deleting Sheet rows/files.
- Replacing the current storage adapter behavior.
