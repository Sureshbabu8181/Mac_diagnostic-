import bcrypt from "bcryptjs";

const now = new Date().toISOString();
const passwordHash = await bcrypt.hash("Demo@12345", 10);

const sheets = {
  users: [
    ["id", "email", "passwordHash", "name", "role", "propertyId", "residentId", "status", "createdAt", "updatedAt"],
    ["user_admin", "admin@sunrisepg.test", passwordHash, "Aarav Admin", "SUPER_ADMIN", "prop_001", "", "active", now, now],
  ],
  properties: [
    ["id", "name", "legalName", "address", "city", "contactEmail", "contactPhone", "status", "createdAt", "updatedAt"],
    ["prop_001", "Sunrise PG", "Sunrise Hospitality Services", "12 Lake View Road", "Bengaluru", "owner@sunrisepg.test", "+91 90000 00001", "active", now, now],
  ],
};

console.log(JSON.stringify(sheets, null, 2));
