# Google Apps Script Backend Setup

Use this when you want Google Sheets, Drive, and Docs without managing Google API OAuth in the Next.js app.

## What It Does

- Next.js calls one Apps Script web app endpoint.
- Apps Script uses `SpreadsheetApp` for table rows.
- Apps Script uses `DriveApp` for uploaded files.
- Apps Script uses `DocumentApp` for Google Docs.
- The app stores document/file IDs in Sheets.

## Files

- `google-apps-script/Code.gs`: paste into Apps Script.
- `src/lib/storage/apps-script-adapter.ts`: Next.js storage adapter.
- `src/lib/storage/apps-script-client.ts`: shared POST client.

## Script Properties

Set these in Apps Script project settings:

```text
SPREADSHEET_ID
API_KEY
FOLDER_AGREEMENTS
FOLDER_ID_PROOFS
FOLDER_RESIDENT_PHOTOS
FOLDER_RECEIPTS
FOLDER_COMPLAINT_IMAGES
FOLDER_EXPORTS
FOLDER_NOTICES
FOLDER_STAFF_DOCS
FOLDER_DOCUMENTS
```

`API_KEY` is not a Google Cloud key. Create any long random text value, save it as the Apps Script `API_KEY` script property, and use the same value as `APPS_SCRIPT_API_KEY` in `.env.local`.

Use the left column as the property name and your real IDs/secrets as values. Do not paste the IDs into `getProperty("...")`; `getProperty()` must receive the property name, for example `getProperty("SPREADSHEET_ID")`.

## Next.js Environment

```bash
DATA_ADAPTER=apps_script
APPS_SCRIPT_WEB_APP_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
APPS_SCRIPT_API_KEY=same-value-as-script-property
AUTH_SECRET=replace-with-strong-random-secret
```

## Deploy Script

1. Create or open an Apps Script project.
2. Paste `google-apps-script/Code.gs`.
3. Add script properties.
4. Deploy > New deployment > Web app.
5. Execute as: owner/admin account.
6. Access: choose the narrowest workable setting for your deployment.
7. Authorize the requested Sheets, Drive, and Docs permissions.
8. Copy the `/exec` URL to `APPS_SCRIPT_WEB_APP_URL`.

## Minimal Test

```bash
curl -L -X POST "$APPS_SCRIPT_WEB_APP_URL" \
  -H "Content-Type: text/plain;charset=utf-8" \
  --data '{"apiKey":"YOUR_KEY","action":"list","entity":"properties","options":{"pageSize":5}}'
```

Expected shape:

```json
{
  "data": {
    "rows": [],
    "total": 0,
    "page": 1,
    "pageSize": 5
  }
}
```

## Notes

- Keep `API_KEY` private.
- Redeploy the Apps Script web app after code changes.
- Apps Script quotas are limited, so keep page sizes small and avoid polling.
- For large production workloads, move the adapter behind PostgreSQL or Firebase later.
