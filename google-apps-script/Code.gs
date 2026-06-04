var CONFIG = {
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
    documents: PropertiesService.getScriptProperties().getProperty("FOLDER_DOCUMENTS")
  }
};

var SHEET_COLUMNS = {
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
  documents: ["id", "propertyId", "type", "title", "driveFileId", "docId", "relatedEntity", "relatedEntityId", "status", "createdAt", "updatedAt"]
};

function doGet() {
  return json_({
    data: {
      ok: true,
      app: "Sunrise PG Apps Script backend",
      configured: Boolean(CONFIG.spreadsheetId && CONFIG.apiKey)
    }
  });
}

function doPost(e) {
  try {
    var request = JSON.parse((e.postData && e.postData.contents) || "{}");
    if (!CONFIG.apiKey || request.apiKey !== CONFIG.apiKey) throw new Error("Unauthorized");
    return json_({ data: route_(request) });
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
  if (request.action === "dashboard") return dashboard_(request.propertyId);
  throw new Error("Unknown action: " + request.action);
}

function dashboard_(propertyId) {
  var beds = list_("beds", { filters: { propertyId: propertyId }, pageSize: 1000 }).rows;
  var invoices = list_("invoices", { filters: { propertyId: propertyId }, pageSize: 1000 }).rows;
  var complaints = list_("complaints", { filters: { propertyId: propertyId }, pageSize: 1000 }).rows;
  var allocations = list_("allocations", { filters: { propertyId: propertyId }, pageSize: 1000 }).rows;
  var payments = list_("payments", { filters: { propertyId: propertyId }, pageSize: 1000 }).rows;
  var visitors = list_("visitors", { filters: { propertyId: propertyId }, pageSize: 1000 }).rows;
  var inventory = list_("inventory_items", { filters: { propertyId: propertyId }, pageSize: 1000 }).rows;
  var expenses = list_("expenses", { filters: { propertyId: propertyId }, pageSize: 1000 }).rows;
  var residents = list_("residents", { filters: { propertyId: propertyId }, pageSize: 1000 }).rows;
  var today = new Date().toISOString().slice(0, 10);
  var occupiedBeds = countBy_(beds, "status", "occupied");
  var availableBeds = countBy_(beds, "status", "vacant");
  var collectedRent = sumField_(invoices, "paidAmount");
  var dueRent = 0;
  var pendingComplaints = 0;
  var todayCheckIns = 0;
  var todayCheckOuts = 0;
  var lowStockItems = 0;
  var activeResidents = 0;
  var recentActivity = [];
  var i;

  for (i = 0; i < invoices.length; i++) {
    dueRent += Math.max(0, Number(invoices[i].totalAmount || 0) - Number(invoices[i].paidAmount || 0));
  }
  for (i = 0; i < complaints.length; i++) {
    if (complaints[i].status === "open" || complaints[i].status === "in_progress") pendingComplaints++;
    recentActivity.push({ id: complaints[i].id, type: "complaint", label: complaints[i].priority + " complaint: " + complaints[i].title, at: complaints[i].openedAt });
  }
  for (i = 0; i < allocations.length; i++) {
    if (allocations[i].checkInDate === today) todayCheckIns++;
    if (allocations[i].actualCheckOutDate === today) todayCheckOuts++;
  }
  for (i = 0; i < inventory.length; i++) {
    if (Number(inventory[i].currentStock || 0) <= Number(inventory[i].reorderLevel || 0)) lowStockItems++;
  }
  for (i = 0; i < residents.length; i++) {
    if (residents[i].status === "active") activeResidents++;
  }
  for (i = 0; i < payments.length; i++) {
    recentActivity.push({ id: payments[i].id, type: "payment", label: "Payment received: Rs " + payments[i].amount, at: payments[i].paidAt });
  }
  for (i = 0; i < visitors.length; i++) {
    recentActivity.push({ id: visitors[i].id, type: "visitor", label: visitors[i].visitorName + " visited", at: visitors[i].timeIn });
  }
  recentActivity.sort(function(a, b) {
    return String(b.at || "").localeCompare(String(a.at || ""));
  });

  return {
    summary: {
      occupancyRate: beds.length ? Math.round((occupiedBeds / beds.length) * 100) : 0,
      occupiedBeds: occupiedBeds,
      availableBeds: availableBeds,
      totalBeds: beds.length,
      dueRent: dueRent,
      collectedRent: collectedRent,
      pendingComplaints: pendingComplaints,
      todayCheckIns: todayCheckIns,
      todayCheckOuts: todayCheckOuts,
      lowStockItems: lowStockItems,
      monthlyExpenses: sumField_(expenses, "amount"),
      activeResidents: activeResidents
    },
    recentActivity: recentActivity.slice(0, 8),
    beds: beds,
    invoices: invoices,
    complaints: complaints,
    inventory: inventory,
    residents: residents
  };
}

function list_(entity, options) {
  var rows = rows_(entity).records;
  var filtered = [];
  var i;
  for (i = 0; i < rows.length; i++) {
    var keep = true;
    if (!options.includeDeleted && rows[i].status === "deleted") keep = false;
    if (keep && options.filters && !matchesFilters_(rows[i], options.filters)) keep = false;
    if (keep && options.query && !matchesQuery_(rows[i], options.query)) keep = false;
    if (keep) filtered.push(rows[i]);
  }
  var page = Number(options.page || 1);
  var pageSize = Number(options.pageSize || 25);
  var start = (page - 1) * pageSize;
  return { rows: filtered.slice(start, start + pageSize), total: filtered.length, page: page, pageSize: pageSize };
}

function get_(entity, id) {
  var rows = rows_(entity).records;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].id === id) return rows[i];
  }
  return null;
}

function create_(entity, input) {
  var sheet = sheet_(entity);
  var columns = SHEET_COLUMNS[entity];
  var now = new Date().toISOString();
  var row = copy_(input);
  row.id = row.id || makeId_(entity.slice(0, 4));
  row.createdAt = row.createdAt || now;
  row.updatedAt = now;
  sheet.appendRow(rowValues_(columns, row));
  return row;
}

function update_(entity, id, input) {
  var table = rows_(entity);
  for (var i = 0; i < table.records.length; i++) {
    if (table.records[i].id === id) {
      var row = copy_(table.records[i]);
      var keys = Object.keys(input);
      for (var j = 0; j < keys.length; j++) row[keys[j]] = input[keys[j]];
      row.updatedAt = new Date().toISOString();
      table.sheet.getRange(i + 2, 1, 1, table.columns.length).setValues([rowValues_(table.columns, row)]);
      return row;
    }
  }
  throw new Error(entity + " record not found: " + id);
}

function uploadFile_(request) {
  var folderId = CONFIG.folders[request.folder];
  if (!folderId) throw new Error("Folder is not configured: " + request.folder);
  var bytes = Utilities.base64Decode(request.base64 || "");
  var blob = Utilities.newBlob(bytes, request.mimeType || "application/octet-stream", request.fileName || "upload");
  var file = DriveApp.getFolderById(folderId).createFile(blob);
  return { id: file.getId(), name: file.getName(), webViewLink: file.getUrl() };
}

function createDocument_(request) {
  var doc = DocumentApp.create(request.title || "Untitled");
  if (request.body) doc.getBody().setText(request.body);
  doc.saveAndClose();
  var file = DriveApp.getFileById(doc.getId());
  var folderId = CONFIG.folders.documents || CONFIG.folders.notices;
  if (folderId) {
    DriveApp.getFolderById(folderId).addFile(file);
    DriveApp.getRootFolder().removeFile(file);
  }
  return { documentId: doc.getId(), title: request.title, webViewLink: file.getUrl() };
}

function rows_(entity) {
  var sheet = sheet_(entity);
  var values = sheet.getDataRange().getValues();
  var columns = values[0] && values[0].length ? values[0] : SHEET_COLUMNS[entity];
  var records = [];
  for (var i = 1; i < values.length; i++) {
    if (rowHasValue_(values[i])) {
      var record = {};
      for (var j = 0; j < columns.length; j++) record[columns[j]] = values[i][j] == null ? "" : values[i][j];
      records.push(record);
    }
  }
  return { sheet: sheet, columns: columns, records: records };
}

function sheet_(entity) {
  if (!SHEET_COLUMNS[entity]) throw new Error("Unknown entity: " + entity);
  if (!CONFIG.spreadsheetId) throw new Error("SPREADSHEET_ID script property is required.");
  var spreadsheet = SpreadsheetApp.openById(CONFIG.spreadsheetId);
  var sheet = spreadsheet.getSheetByName(entity);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(entity);
    sheet.appendRow(SHEET_COLUMNS[entity]);
  }
  return sheet;
}

function rowValues_(columns, row) {
  var values = [];
  for (var i = 0; i < columns.length; i++) values.push(row[columns[i]] == null ? "" : row[columns[i]]);
  return values;
}

function matchesFilters_(row, filters) {
  var keys = Object.keys(filters);
  for (var i = 0; i < keys.length; i++) {
    if (String(row[keys[i]] || "") !== String(filters[keys[i]])) return false;
  }
  return true;
}

function matchesQuery_(row, query) {
  var keys = Object.keys(row);
  var needle = String(query).toLowerCase();
  for (var i = 0; i < keys.length; i++) {
    if (String(row[keys[i]] || "").toLowerCase().indexOf(needle) >= 0) return true;
  }
  return false;
}

function rowHasValue_(row) {
  for (var i = 0; i < row.length; i++) {
    if (row[i]) return true;
  }
  return false;
}

function countBy_(rows, field, value) {
  var count = 0;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][field] === value) count++;
  }
  return count;
}

function sumField_(rows, field) {
  var sum = 0;
  for (var i = 0; i < rows.length; i++) sum += Number(rows[i][field] || 0);
  return sum;
}

function copy_(value) {
  var result = {};
  var keys = Object.keys(value || {});
  for (var i = 0; i < keys.length; i++) result[keys[i]] = value[keys[i]];
  return result;
}

function makeId_(prefix) {
  return prefix + "_" + Utilities.getUuid().replace(/-/g, "").slice(0, 12);
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
