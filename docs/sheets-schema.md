# Google Sheets Schema

Primary keys are string IDs with entity prefixes, for example `res_001` or generated IDs like `resi_ab12cd34ef56`. Every sheet should use row 1 as the exact header row. Soft-delete-capable sheets use `status=deleted`.

## Folder Layout In Google Drive

- `agreements/`
- `id_proofs/`
- `resident_photos/`
- `receipts/`
- `complaint_images/`
- `exports/`
- `notices/`
- `staff_docs/`

## Sheets

### users
Columns: `id`, `email`, `passwordHash`, `name`, `role`, `propertyId`, `residentId`, `status`, `createdAt`, `updatedAt`

Validation: unique email, role in `SUPER_ADMIN`, `OWNER_MANAGER`, `ACCOUNTANT`, `CARETAKER`, `RESIDENT`.

Sample: `user_admin`, `admin@sunrisepg.test`, bcrypt hash, `Aarav Admin`, `SUPER_ADMIN`, `prop_001`, blank, `active`.

### properties
Columns: `id`, `name`, `legalName`, `address`, `city`, `contactEmail`, `contactPhone`, `status`, `createdAt`, `updatedAt`

### rooms
Columns: `id`, `propertyId`, `building`, `floor`, `roomNumber`, `roomType`, `capacity`, `monthlyRent`, `status`, `createdAt`, `updatedAt`

Validation: capacity must be positive. Status: `active`, `maintenance`, `deleted`.

### beds
Columns: `id`, `propertyId`, `roomId`, `bedNumber`, `status`, `currentResidentId`, `createdAt`, `updatedAt`

Validation: bed count for a room must not exceed `rooms.capacity`. Status: `vacant`, `occupied`, `maintenance`, `deleted`.

### residents
Columns: `id`, `propertyId`, `fullName`, `phone`, `email`, `gender`, `dateOfBirth`, `occupation`, `kycType`, `kycNumber`, `emergencyName`, `emergencyPhone`, `residentPhotoFileId`, `idProofFileId`, `agreementFileId`, `status`, `createdAt`, `updatedAt`

### allocations
Columns: `id`, `propertyId`, `residentId`, `roomId`, `bedId`, `checkInDate`, `expectedCheckOutDate`, `actualCheckOutDate`, `depositAmount`, `monthlyRent`, `status`, `createdAt`, `updatedAt`

Relationship: one active allocation per occupied bed.

### invoices
Columns: `id`, `propertyId`, `residentId`, `month`, `rentAmount`, `messAmount`, `lateFee`, `taxAmount`, `totalAmount`, `paidAmount`, `dueDate`, `status`, `receiptFileId`, `createdAt`, `updatedAt`

Formula option: `totalAmount = rentAmount + messAmount + lateFee + taxAmount`. The app computes this server-side; formula columns can be added in Sheets for owner visibility.

### payments
Columns: `id`, `propertyId`, `invoiceId`, `residentId`, `amount`, `mode`, `paidAt`, `reference`, `notes`, `receiptFileId`, `status`, `createdAt`, `updatedAt`

Validation: payment mode in `cash`, `upi`, `bank_transfer`, `card`, `other`.

### complaints
Columns: `id`, `propertyId`, `residentId`, `title`, `description`, `priority`, `status`, `assignedStaffId`, `imageFileIds`, `openedAt`, `resolvedAt`, `createdAt`, `updatedAt`

Validation: priority in `low`, `medium`, `high`, `critical`. Status flow: `open -> in_progress -> resolved -> closed`.

### maintenance_logs
Columns: `id`, `propertyId`, `complaintId`, `staffId`, `actionTaken`, `materialCost`, `laborCost`, `notes`, `createdAt`, `updatedAt`

### visitors
Columns: `id`, `propertyId`, `residentId`, `visitorName`, `visitorPhone`, `purpose`, `timeIn`, `timeOut`, `guardNotes`, `createdAt`, `updatedAt`

### mess_plans
Columns: `id`, `propertyId`, `name`, `weeklyMenuJson`, `monthlyCharge`, `status`, `createdAt`, `updatedAt`

### notices
Columns: `id`, `propertyId`, `title`, `body`, `audience`, `publishAt`, `expiresAt`, `attachmentFileId`, `status`, `createdAt`, `updatedAt`

### inventory_items
Columns: `id`, `propertyId`, `name`, `category`, `unit`, `currentStock`, `reorderLevel`, `status`, `createdAt`, `updatedAt`

Low stock formula option: `=IF(currentStock<=reorderLevel,"LOW","OK")`.

### inventory_transactions
Columns: `id`, `propertyId`, `itemId`, `type`, `quantity`, `unitCost`, `reference`, `createdBy`, `createdAt`, `updatedAt`

Validation: type in `purchase`, `issue`, `consume`, `adjustment`.

### expenses
Columns: `id`, `propertyId`, `category`, `amount`, `paidAt`, `vendor`, `notes`, `receiptFileId`, `status`, `createdAt`, `updatedAt`

### staff
Columns: `id`, `propertyId`, `fullName`, `phone`, `role`, `salary`, `documentFileId`, `status`, `createdAt`, `updatedAt`

### audit_logs
Columns: `id`, `propertyId`, `actorUserId`, `action`, `entity`, `entityId`, `detailsJson`, `createdAt`

### settings
Columns: `id`, `propertyId`, `key`, `valueJson`, `updatedAt`

Example keys: `late_fee_rules`, `tax_settings`, `room_types`, `custom_fields`, `notification_templates`.
