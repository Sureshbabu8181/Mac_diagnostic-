export const roles = [
  "SUPER_ADMIN",
  "OWNER_MANAGER",
  "ACCOUNTANT",
  "CARETAKER",
  "RESIDENT",
] as const;

export type Role = (typeof roles)[number];

export type RecordStatus = "active" | "inactive" | "deleted";

export type User = {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  role: Role;
  propertyId: string;
  residentId?: string;
  status: RecordStatus;
  createdAt: string;
  updatedAt: string;
};

export type Property = {
  id: string;
  name: string;
  legalName: string;
  address: string;
  city: string;
  contactEmail: string;
  contactPhone: string;
  status: RecordStatus;
  createdAt: string;
  updatedAt: string;
};

export type Room = {
  id: string;
  propertyId: string;
  building: string;
  floor: string;
  roomNumber: string;
  roomType: string;
  capacity: number;
  monthlyRent: number;
  status: "active" | "maintenance" | "deleted";
  createdAt: string;
  updatedAt: string;
};

export type Bed = {
  id: string;
  propertyId: string;
  roomId: string;
  bedNumber: string;
  status: "vacant" | "occupied" | "maintenance" | "deleted";
  currentResidentId?: string;
  createdAt: string;
  updatedAt: string;
};

export type Resident = {
  id: string;
  propertyId: string;
  fullName: string;
  phone: string;
  email: string;
  gender: string;
  dateOfBirth: string;
  occupation: string;
  kycType: string;
  kycNumber: string;
  emergencyName: string;
  emergencyPhone: string;
  residentPhotoFileId?: string;
  idProofFileId?: string;
  agreementFileId?: string;
  status: "active" | "checked_out" | "deleted";
  createdAt: string;
  updatedAt: string;
};

export type Allocation = {
  id: string;
  propertyId: string;
  residentId: string;
  roomId: string;
  bedId: string;
  checkInDate: string;
  expectedCheckOutDate?: string;
  actualCheckOutDate?: string;
  depositAmount: number;
  monthlyRent: number;
  status: "active" | "completed" | "cancelled";
  createdAt: string;
  updatedAt: string;
};

export type Invoice = {
  id: string;
  propertyId: string;
  residentId: string;
  month: string;
  rentAmount: number;
  messAmount: number;
  lateFee: number;
  taxAmount: number;
  totalAmount: number;
  paidAmount: number;
  dueDate: string;
  status: "draft" | "due" | "partially_paid" | "paid" | "overdue" | "void";
  receiptFileId?: string;
  createdAt: string;
  updatedAt: string;
};

export type Payment = {
  id: string;
  propertyId: string;
  invoiceId: string;
  residentId: string;
  amount: number;
  mode: "cash" | "upi" | "bank_transfer" | "card" | "other";
  paidAt: string;
  reference: string;
  notes?: string;
  receiptFileId?: string;
  status: "received" | "reversed";
  createdAt: string;
  updatedAt: string;
};

export type Complaint = {
  id: string;
  propertyId: string;
  residentId: string;
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "critical";
  status: "open" | "in_progress" | "resolved" | "closed";
  assignedStaffId?: string;
  imageFileIds?: string;
  openedAt: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type MaintenanceLog = {
  id: string;
  propertyId: string;
  complaintId: string;
  staffId?: string;
  actionTaken: string;
  materialCost: number;
  laborCost: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type Visitor = {
  id: string;
  propertyId: string;
  residentId: string;
  visitorName: string;
  visitorPhone: string;
  purpose: string;
  timeIn: string;
  timeOut?: string;
  guardNotes?: string;
  createdAt: string;
  updatedAt: string;
};

export type InventoryItem = {
  id: string;
  propertyId: string;
  name: string;
  category: string;
  unit: string;
  currentStock: number;
  reorderLevel: number;
  status: RecordStatus;
  createdAt: string;
  updatedAt: string;
};

export type InventoryTransaction = {
  id: string;
  propertyId: string;
  itemId: string;
  type: "purchase" | "issue" | "consume" | "adjustment";
  quantity: number;
  unitCost: number;
  reference?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type Expense = {
  id: string;
  propertyId: string;
  category: string;
  amount: number;
  paidAt: string;
  vendor: string;
  notes?: string;
  receiptFileId?: string;
  status: RecordStatus;
  createdAt: string;
  updatedAt: string;
};

export type Staff = {
  id: string;
  propertyId: string;
  fullName: string;
  phone: string;
  role: string;
  salary: number;
  documentFileId?: string;
  status: RecordStatus;
  createdAt: string;
  updatedAt: string;
};

export type Notice = {
  id: string;
  propertyId: string;
  title: string;
  body: string;
  audience: "all" | Role;
  publishAt: string;
  expiresAt?: string;
  attachmentFileId?: string;
  status: RecordStatus;
  createdAt: string;
  updatedAt: string;
};

export type MessPlan = {
  id: string;
  propertyId: string;
  name: string;
  weeklyMenuJson: string;
  monthlyCharge: number;
  status: RecordStatus;
  createdAt: string;
  updatedAt: string;
};

export type AuditLog = {
  id: string;
  propertyId: string;
  actorUserId: string;
  action: string;
  entity: string;
  entityId: string;
  detailsJson: string;
  createdAt: string;
};

export type Setting = {
  id: string;
  propertyId: string;
  key: string;
  valueJson: string;
  updatedAt: string;
};

export type Enquiry = {
  id: string;
  name: string;
  phone: string;
  email: string;
  message: string;
  createdAt: string;
};

export type WorkspaceDocument = {
  id: string;
  propertyId: string;
  type: string;
  title: string;
  driveFileId: string;
  docId: string;
  relatedEntity?: string;
  relatedEntityId?: string;
  status: RecordStatus;
  createdAt: string;
  updatedAt: string;
};

export type EntityMap = {
  users: User;
  properties: Property;
  rooms: Room;
  beds: Bed;
  residents: Resident;
  allocations: Allocation;
  invoices: Invoice;
  payments: Payment;
  complaints: Complaint;
  maintenance_logs: MaintenanceLog;
  visitors: Visitor;
  inventory_items: InventoryItem;
  inventory_transactions: InventoryTransaction;
  expenses: Expense;
  staff: Staff;
  notices: Notice;
  mess_plans: MessPlan;
  audit_logs: AuditLog;
  settings: Setting;
  documents: WorkspaceDocument;
  enquiries: Enquiry;
};

export type EntityName = keyof EntityMap;

export const entityNames = [
  "users",
  "properties",
  "rooms",
  "beds",
  "residents",
  "allocations",
  "invoices",
  "payments",
  "complaints",
  "maintenance_logs",
  "visitors",
  "inventory_items",
  "inventory_transactions",
  "expenses",
  "staff",
  "notices",
  "mess_plans",
  "audit_logs",
  "settings",
  "documents",
  "enquiries",
] as const satisfies EntityName[];

export const sheetColumns: Record<EntityName, string[]> = {
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
  enquiries: ["id", "name", "phone", "email", "message", "createdAt"],
};
