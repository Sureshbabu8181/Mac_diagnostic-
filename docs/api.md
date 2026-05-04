# API Route List

All protected routes use the `pg_session` HTTP-only cookie. Demo credentials use password `Demo@12345`.

## Auth

- `POST /api/auth/login` - email/password login.
- `POST /api/auth/logout` - clears the session cookie.
- `GET /api/auth/me` - returns current session user or null.

## Dashboard

- `GET /api/dashboard` - occupancy, rent, complaints, check-in/check-out, inventory, and recent activity summary.

## Generic CRUD

Supported resources: `users`, `properties`, `rooms`, `beds`, `residents`, `allocations`, `invoices`, `payments`, `complaints`, `maintenance_logs`, `visitors`, `inventory_items`, `inventory_transactions`, `expenses`, `staff`, `notices`, `mess_plans`, `audit_logs`, `settings`.

- `GET /api/{resource}?q=&page=&pageSize=` - paginated list with search.
- `POST /api/{resource}` - create record, scoped to the session property.
- `GET /api/{resource}/{id}` - fetch one record.
- `PUT /api/{resource}/{id}` - update one record.
- `DELETE /api/{resource}/{id}` - soft delete one record where the entity supports `status`.

## Files

- `POST /api/files/upload` - multipart upload with `file` and `folder`.
- Folder values: `agreements`, `id_proofs`, `resident_photos`, `receipts`, `complaint_images`, `exports`, `notices`, `staff_docs`.

## Reports

- `GET /api/reports/revenue?format=json|csv|pdf`
- `GET /api/reports/occupancy?format=json|csv|pdf`
- `GET /api/reports/defaulters?format=json|csv|pdf`
- `GET /api/reports/complaints?format=json|csv|pdf`
- `GET /api/reports/inventory?format=json|csv|pdf`
