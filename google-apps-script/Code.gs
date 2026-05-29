const CONFIG = {
  // Set these in Apps Script > Project Settings > Script properties.
  // Property names must be SPREADSHEET_ID, API_KEY, FOLDER_AGREEMENTS, etc.
  spreadsheetId: PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID"),
  apiKey: PropertiesService.getScriptProperties().getProperty("API_KEY"),
  folders: {
    agreements: PropertiesService.getScriptProperties().getProperty("FOLDER_AGREEMENTS"),
    id_proofs: PropertiesService.getScriptProperties().getProperty("FOLDER_ID_PROOFS"),
    resident_photos: PropertiesService.getScriptProperties().getProperty("FOLDER_RESIDENT_PHOTOS"),
    receipts: PropertiesService.getScriptProperties().getProperty("FOLDER_RECEIPTS"),
    complaint_images: PropertiesService.getScriptProperties().getProperty("FOLDER_COMPLAINT_IMAGES"),
    exports: PropertiesService.getScriptProperties().getProperty("FOLDER_EXPORTS"),
    notices: PropertiesService.getScriptProperties().getProperty("FOLDER_NOTICES"),
    staff_docs: PropertiesService.getScriptProperties().getProperty("FOLDER_STAFF_DOCS"),
    documents: PropertiesService.getScriptProperties().getProperty("FOLDER_DOCUMENTS"),
  },
};

const SHEET_COLUMNS = {
  users: ["id", "email", "passwordHash", "name", "role", "propertyId", "residentId", "status", "createdAt", "updatedAt"],
  properties: ["id", "name", "legalName", "address", "city", "contactEmail", "contactPhone", "status", "createdAt", "updatedAt"],
  rooms: ["id", "propertyId", "building", "floor", "roomNumber", "roomType", "capacity", "monthlyRent", "status", "createdAt", "updatedAt"],
  beds: ["id", "propertyId", "roomId", "bedNumber", "status", "currentResidentId", "createdAt", "updatedAt"],
  residents: ["id", "propertyId", "fullName", "phone", "email", "gender", "dateOfBirth", "occupation", "kycType", "kycNumber", "emergencyName", "emergencyPhone", "residentPhotoFileId", "idProofFileId", "agreementFileId", "status", "createdAt", "updatedAt"],
  allocations: ["id", "propertyId", "residentId", "roomId", "bedId", "checkInDate", "expectedCheckOutDate", "actualCheckOutDate", "depositAmount", "monthlyRent", "status", "createdAt", "updatedAt"],
  invoices: ["id", "propertyId", "residentId", "month", "rentAmount", "messAmount", "lateFee", "taxAmount", "totalAmount", "paidAmount", "dueDate", "status", "receiptFileId", "createdAt", "updatedAt"],
  payments: ["id", "propertyId", "invoiceId", "residentId", "amount", "mode", "paidAt", "reference", "notes", "receiptFileId", "status", "createdAt", "updatedAt"],
  complaints: ["id", "propertyId", "residentId", "title", "description", "priority", "status", "assignedStaffId", "imageFileIds", "openedAt", "resolvedAt", "createdAt", "updatedAt"],
  maintenance_logs: ["id", "propertyId", "complaintId", "staffId", "actionTaken", "materialCost", "laborCost", "notes", "createdAt", "updatedAt"],
  visitors: ["id", "propertyId", "residentId", "visitorName", "visitorPhone", "purpose", "timeIn", "timeOut", "guardNotes", "createdAt", "updatedAt"],
  inventory_items: ["id", "propertyId", "name", "category", "unit", "currentStock", "reorderLevel", "status", "createdAt", "updatedAt"],
  inventory_transactions: ["id", "propertyId", "itemId", "type", "quantity", "unitCost", "reference", "createdBy", "createdAt", "updatedAt"],
  expenses: ["id", "propertyId", "category", "amount", "paidAt", "vendor", "notes", "receiptFileId", "status", "createdAt", "updatedAt"],
  staff: ["id", "propertyId", "fullName", "phone", "role", "salary", "documentFileId", "status", "createdAt", "updatedAt"],
  notices: ["id", "propertyId", "title", "body", "audience", "publishAt", "expiresAt", "attachmentFileId", "status", "createdAt", "updatedAt"],
  mess_plans: ["id", "propertyId", "name", "weeklyMenuJson", "monthlyCharge", "status", "createdAt", "updatedAt"],
  audit_logs: ["id", "propertyId", "actorUserId", "action", "entity", "entityId", "detailsJson", "createdAt"],
  settings: ["id", "propertyId", "key", "valueJson", "updatedAt"],
  documents: ["id", "propertyId", "type", "title", "driveFileId", "docId", "relatedEntity", "relatedEntityId", "status", "createdAt", "updatedAt"],
};

function doGet() {
  return json_({
    data: {
      ok: true,
      app: "Sunrise PG Apps Script backend",
      configured: Boolean(CONFIG.spreadsheetId && CONFIG.apiKey),
    },
  });
}

function doPost(e) {
  try {
    const request = JSON.parse((e.postData && e.postData.contents) || "{}");
    if (!CONFIG.apiKey || request.apiKey !== CONFIG.apiKey) throw new Error("Unauthorized");
    const result = route_(request);
    return json_({ data: result });
  } catch (error) {
    return json_({ error: String(error.message || error) });
  }
}

function route_(request) {
  if (request.action === "list") return list_(request.entity, request.options || {});
  if (request.action === "get") return get_(request.entity, request.id);
  if (request.action === "create") return create_(request.entity, request.input || {});
  if (request.action === "update") return update_(request.entity, request.id, request.input || {});
  if (request.action === "softDelete") return update_(request.entity, request.id, { status: "deleted" });
  if (request.action === "uploadFile") return uploadFile_(request);
  if (request.action === "createDocument") return createDocument_(request);
  throw new Error("Unknown action: " + request.action);
}

function list_(entity, options) {
  let rows = rows_(entity).records;
  if (!options.includeDeleted) rows = rows.filter((row) => row.status !== "deleted");
  if (options.filters) {
    rows = rows.filter((row) => Object.keys(options.filters).every((key) => String(row[key] || "") === String(options.filters[key])));
  }
  if (options.query) {
    const query = String(options.query).toLowerCase();
    rows = rows.filter((row) => Object.keys(row).some((key) => String(row[key] || "").toLowerCase().indexOf(query) >= 0));
  }
  const page = Number(options.page || 1);
  const pageSize = Number(options.pageSize || 25);
  const start = (page - 1) * pageSize;
  return { rows: rows.slice(start, start + pageSize), total: rows.length, page, pageSize };
}

function get_(entity, id) {
  return rows_(entity).records.find((row) => row.id === id) || null;
}

function create_(entity, input) {
  const sheet = sheet_(entity);
  const columns = SHEET_COLUMNS[entity];
  const now = new Date().toISOString();
  const row = Object.assign({}, input, {
    id: input.id || makeId_(entity.slice(0, 4)),
    createdAt: input.createdAt || now,
    updatedAt: now,
  });
  sheet.appendRow(columns.map((column) => row[column] == null ? "" : row[column]));
  return row;
}

function update_(entity, id, input) {
  const table = rows_(entity);
  const index = table.records.findIndex((row) => row.id === id);
  if (index < 0) throw new Error(entity + " record not found: " + id);
  const row = Object.assign({}, table.records[index], input, { updatedAt: new Date().toISOString() });
  const values = table.columns.map((column) => row[column] == null ? "" : row[column]);
  table.sheet.getRange(index + 2, 1, 1, values.length).setValues([values]);
  return row;
}

function uploadFile_(request) {
  const folderId = CONFIG.folders[request.folder];
  if (!folderId) throw new Error("Folder is not configured: " + request.folder);
  const bytes = Utilities.base64Decode(request.base64 || "");
  const blob = Utilities.newBlob(bytes, request.mimeType || "application/octet-stream", request.fileName || "upload");
  const file = DriveApp.getFolderById(folderId).createFile(blob);
  return { id: file.getId(), name: file.getName(), webViewLink: file.getUrl() };
}

function createDocument_(request) {
  const doc = DocumentApp.create(request.title || "Untitled");
  if (request.body) doc.getBody().setText(request.body);
  doc.saveAndClose();
  const file = DriveApp.getFileById(doc.getId());
  const folderId = CONFIG.folders.documents || CONFIG.folders.notices;
  if (folderId) {
    DriveApp.getFolderById(folderId).addFile(file);
    DriveApp.getRootFolder().removeFile(file);
  }
  return { documentId: doc.getId(), title: request.title, webViewLink: file.getUrl() };
}

function rows_(entity) {
  const sheet = sheet_(entity);
  const values = sheet.getDataRange().getValues();
  const columns = values[0] && values[0].length ? values[0] : SHEET_COLUMNS[entity];
  const records = values.slice(1).filter((row) => row.some(Boolean)).map((row) => {
    const record = {};
    columns.forEach((column, index) => record[column] = row[index] == null ? "" : row[index]);
    return record;
  });
  return { sheet, columns, records };
}

function sheet_(entity) {
  if (!SHEET_COLUMNS[entity]) throw new Error("Unknown entity: " + entity);
  if (!CONFIG.spreadsheetId) throw new Error("SPREADSHEET_ID script property is required.");
  const spreadsheet = SpreadsheetApp.openById(CONFIG.spreadsheetId);
  let sheet = spreadsheet.getSheetByName(entity);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(entity);
    sheet.appendRow(SHEET_COLUMNS[entity]);
  }
  return sheet;
}

function makeId_(prefix) {
  return prefix + "_" + Utilities.getUuid().replace(/-/g, "").slice(0, 12);
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
