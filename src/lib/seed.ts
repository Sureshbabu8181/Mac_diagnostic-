import bcrypt from "bcryptjs";
import type { EntityMap } from "./models";

const now = new Date().toISOString();
const passwordHash = bcrypt.hashSync("Demo@12345", 10);

export const demoData: { [K in keyof EntityMap]: EntityMap[K][] } = {
  properties: [
    {
      id: "prop_001",
      name: "Sunrise PG",
      legalName: "Sunrise Hospitality Services",
      address: "12 Lake View Road",
      city: "Bengaluru",
      contactEmail: "owner@sunrisepg.test",
      contactPhone: "+91 90000 00001",
      status: "active",
      createdAt: now,
      updatedAt: now,
    },
  ],
  users: [
    { id: "user_admin", email: "admin@sunrisepg.test", passwordHash, name: "Aarav Admin", role: "SUPER_ADMIN", propertyId: "prop_001", status: "active", createdAt: now, updatedAt: now },
    { id: "user_owner", email: "owner@sunrisepg.test", passwordHash, name: "Nisha Owner", role: "OWNER_MANAGER", propertyId: "prop_001", status: "active", createdAt: now, updatedAt: now },
    { id: "user_accountant", email: "accounts@sunrisepg.test", passwordHash, name: "Kiran Accounts", role: "ACCOUNTANT", propertyId: "prop_001", status: "active", createdAt: now, updatedAt: now },
    { id: "user_caretaker", email: "care@sunrisepg.test", passwordHash, name: "Mohan Caretaker", role: "CARETAKER", propertyId: "prop_001", status: "active", createdAt: now, updatedAt: now },
    { id: "user_resident", email: "resident@sunrisepg.test", passwordHash, name: "Meera Resident", role: "RESIDENT", propertyId: "prop_001", residentId: "res_001", status: "active", createdAt: now, updatedAt: now },
  ],
  rooms: [
    { id: "room_101", propertyId: "prop_001", building: "A", floor: "1", roomNumber: "101", roomType: "Triple Sharing", capacity: 3, monthlyRent: 9500, status: "active", createdAt: now, updatedAt: now },
    { id: "room_102", propertyId: "prop_001", building: "A", floor: "1", roomNumber: "102", roomType: "Double Sharing", capacity: 2, monthlyRent: 12000, status: "active", createdAt: now, updatedAt: now },
    { id: "room_201", propertyId: "prop_001", building: "A", floor: "2", roomNumber: "201", roomType: "Single", capacity: 1, monthlyRent: 18000, status: "maintenance", createdAt: now, updatedAt: now },
  ],
  beds: [
    { id: "bed_101_a", propertyId: "prop_001", roomId: "room_101", bedNumber: "101-A", status: "occupied", currentResidentId: "res_001", createdAt: now, updatedAt: now },
    { id: "bed_101_b", propertyId: "prop_001", roomId: "room_101", bedNumber: "101-B", status: "occupied", currentResidentId: "res_002", createdAt: now, updatedAt: now },
    { id: "bed_101_c", propertyId: "prop_001", roomId: "room_101", bedNumber: "101-C", status: "vacant", createdAt: now, updatedAt: now },
    { id: "bed_102_a", propertyId: "prop_001", roomId: "room_102", bedNumber: "102-A", status: "vacant", createdAt: now, updatedAt: now },
    { id: "bed_102_b", propertyId: "prop_001", roomId: "room_102", bedNumber: "102-B", status: "occupied", currentResidentId: "res_003", createdAt: now, updatedAt: now },
    { id: "bed_201_a", propertyId: "prop_001", roomId: "room_201", bedNumber: "201-A", status: "maintenance", createdAt: now, updatedAt: now },
  ],
  residents: [
    { id: "res_001", propertyId: "prop_001", fullName: "Meera Sharma", phone: "+91 90000 10001", email: "resident@sunrisepg.test", gender: "Female", dateOfBirth: "2000-04-12", occupation: "Student", kycType: "Aadhaar", kycNumber: "XXXX-XXXX-1245", emergencyName: "Ravi Sharma", emergencyPhone: "+91 90000 20001", status: "active", createdAt: now, updatedAt: now },
    { id: "res_002", propertyId: "prop_001", fullName: "Priya Nair", phone: "+91 90000 10002", email: "priya@example.test", gender: "Female", dateOfBirth: "1999-11-04", occupation: "Engineer", kycType: "PAN", kycNumber: "ABCDE1234F", emergencyName: "Anil Nair", emergencyPhone: "+91 90000 20002", status: "active", createdAt: now, updatedAt: now },
    { id: "res_003", propertyId: "prop_001", fullName: "Sneha Rao", phone: "+91 90000 10003", email: "sneha@example.test", gender: "Female", dateOfBirth: "1998-07-22", occupation: "Designer", kycType: "Passport", kycNumber: "P1234567", emergencyName: "Dev Rao", emergencyPhone: "+91 90000 20003", status: "active", createdAt: now, updatedAt: now },
  ],
  allocations: [
    { id: "alloc_001", propertyId: "prop_001", residentId: "res_001", roomId: "room_101", bedId: "bed_101_a", checkInDate: "2026-04-01", expectedCheckOutDate: "2027-03-31", depositAmount: 19000, monthlyRent: 9500, status: "active", createdAt: now, updatedAt: now },
    { id: "alloc_002", propertyId: "prop_001", residentId: "res_002", roomId: "room_101", bedId: "bed_101_b", checkInDate: "2026-05-05", expectedCheckOutDate: "2027-05-04", depositAmount: 19000, monthlyRent: 9500, status: "active", createdAt: now, updatedAt: now },
    { id: "alloc_003", propertyId: "prop_001", residentId: "res_003", roomId: "room_102", bedId: "bed_102_b", checkInDate: "2026-03-10", expectedCheckOutDate: "2027-03-09", depositAmount: 24000, monthlyRent: 12000, status: "active", createdAt: now, updatedAt: now },
  ],
  invoices: [
    { id: "inv_001", propertyId: "prop_001", residentId: "res_001", month: "2026-05", rentAmount: 9500, messAmount: 2500, lateFee: 0, taxAmount: 0, totalAmount: 12000, paidAmount: 12000, dueDate: "2026-05-05", status: "paid", createdAt: now, updatedAt: now },
    { id: "inv_002", propertyId: "prop_001", residentId: "res_002", month: "2026-05", rentAmount: 9500, messAmount: 2500, lateFee: 250, taxAmount: 0, totalAmount: 12250, paidAmount: 5000, dueDate: "2026-05-05", status: "partially_paid", createdAt: now, updatedAt: now },
    { id: "inv_003", propertyId: "prop_001", residentId: "res_003", month: "2026-05", rentAmount: 12000, messAmount: 0, lateFee: 0, taxAmount: 0, totalAmount: 12000, paidAmount: 0, dueDate: "2026-05-05", status: "due", createdAt: now, updatedAt: now },
  ],
  payments: [
    { id: "pay_001", propertyId: "prop_001", invoiceId: "inv_001", residentId: "res_001", amount: 12000, mode: "upi", paidAt: "2026-05-03T10:30:00.000Z", reference: "UPI12345", status: "received", createdAt: now, updatedAt: now },
    { id: "pay_002", propertyId: "prop_001", invoiceId: "inv_002", residentId: "res_002", amount: 5000, mode: "cash", paidAt: "2026-05-04T12:00:00.000Z", reference: "CASH-0504", status: "received", createdAt: now, updatedAt: now },
  ],
  complaints: [
    { id: "cmp_001", propertyId: "prop_001", residentId: "res_001", title: "Wi-Fi unstable in room 101", description: "Internet drops during evening hours.", priority: "medium", status: "in_progress", assignedStaffId: "staff_001", openedAt: "2026-05-04T09:00:00.000Z", createdAt: now, updatedAt: now },
    { id: "cmp_002", propertyId: "prop_001", residentId: "res_003", title: "Bathroom tap leakage", description: "Continuous leakage near wash basin.", priority: "high", status: "open", assignedStaffId: "staff_001", openedAt: "2026-05-05T07:00:00.000Z", createdAt: now, updatedAt: now },
  ],
  maintenance_logs: [
    { id: "mlog_001", propertyId: "prop_001", complaintId: "cmp_001", staffId: "staff_001", actionTaken: "Router restart and ISP ticket raised", materialCost: 0, laborCost: 0, notes: "Monitoring evening usage", createdAt: now, updatedAt: now },
  ],
  visitors: [
    { id: "vis_001", propertyId: "prop_001", residentId: "res_001", visitorName: "Ananya Sharma", visitorPhone: "+91 90000 30001", purpose: "Family visit", timeIn: "2026-05-05T10:00:00.000Z", guardNotes: "ID checked", createdAt: now, updatedAt: now },
  ],
  inventory_items: [
    { id: "item_001", propertyId: "prop_001", name: "Rice", category: "Mess", unit: "kg", currentStock: 18, reorderLevel: 25, status: "active", createdAt: now, updatedAt: now },
    { id: "item_002", propertyId: "prop_001", name: "LED Bulbs", category: "Maintenance", unit: "pcs", currentStock: 6, reorderLevel: 10, status: "active", createdAt: now, updatedAt: now },
  ],
  inventory_transactions: [
    { id: "itx_001", propertyId: "prop_001", itemId: "item_001", type: "purchase", quantity: 25, unitCost: 62, reference: "Fresh Mart bill 0502", createdBy: "user_caretaker", createdAt: now, updatedAt: now },
    { id: "itx_002", propertyId: "prop_001", itemId: "item_002", type: "consume", quantity: 2, unitCost: 120, reference: "Fan room repair", createdBy: "user_caretaker", createdAt: now, updatedAt: now },
  ],
  expenses: [
    { id: "exp_001", propertyId: "prop_001", category: "Groceries", amount: 8200, paidAt: "2026-05-02", vendor: "Fresh Mart", notes: "Weekly mess purchase", status: "active", createdAt: now, updatedAt: now },
    { id: "exp_002", propertyId: "prop_001", category: "Repairs", amount: 1500, paidAt: "2026-05-04", vendor: "Local Electrician", notes: "Fan repair", status: "active", createdAt: now, updatedAt: now },
  ],
  staff: [
    { id: "staff_001", propertyId: "prop_001", fullName: "Mohan Kumar", phone: "+91 90000 40001", role: "Caretaker", salary: 22000, status: "active", createdAt: now, updatedAt: now },
  ],
  notices: [
    { id: "notice_001", propertyId: "prop_001", title: "Water tank cleaning", body: "Water supply will pause from 10 AM to 12 PM on Sunday.", audience: "all", publishAt: "2026-05-05T08:00:00.000Z", status: "active", createdAt: now, updatedAt: now },
  ],
  mess_plans: [
    { id: "mess_001", propertyId: "prop_001", name: "Standard Veg", weeklyMenuJson: "{\"Mon\":\"Dal rice\",\"Tue\":\"Chapati sabzi\",\"Wed\":\"Pulao\",\"Thu\":\"Idli sambar\",\"Fri\":\"Paneer rice\",\"Sat\":\"Dosa\",\"Sun\":\"Special thali\"}", monthlyCharge: 2500, status: "active", createdAt: now, updatedAt: now },
  ],
  audit_logs: [
    { id: "audit_001", propertyId: "prop_001", actorUserId: "user_admin", action: "seed.created", entity: "system", entityId: "seed", detailsJson: "{\"message\":\"Demo data loaded\"}", createdAt: now },
  ],
  settings: [
    { id: "set_001", propertyId: "prop_001", key: "late_fee_rules", valueJson: "{\"graceDays\":5,\"dailyFee\":50,\"maxFee\":1000}", updatedAt: now },
    { id: "set_002", propertyId: "prop_001", key: "tax_settings", valueJson: "{\"enabled\":false,\"gstPercent\":0}", updatedAt: now },
  ],
  documents: [],
  enquiries: [],
};
