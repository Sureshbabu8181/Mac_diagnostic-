import { readFileSync } from "node:fs";
import bcrypt from "bcryptjs";

function loadEnvFile(path) {
  const values = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 0) continue;
    values[trimmed.slice(0, index)] = trimmed.slice(index + 1);
  }
  return values;
}

const env = { ...loadEnvFile(".env.local"), ...process.env };
const endpoint = env.APPS_SCRIPT_WEB_APP_URL;
const apiKey = env.APPS_SCRIPT_API_KEY;

if (!endpoint || !apiKey) {
  throw new Error("APPS_SCRIPT_WEB_APP_URL and APPS_SCRIPT_API_KEY are required in .env.local.");
}

async function call(action, payload = {}) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ apiKey, action, ...payload }),
  });
  const text = await response.text();
  let result;
  try {
    result = JSON.parse(text);
  } catch {
    throw new Error(`Apps Script returned non-JSON response: ${text.slice(0, 160)}`);
  }
  if (!response.ok || result.error) throw new Error(result.error ?? `Apps Script request failed: ${response.status}`);
  return result.data;
}

async function ensure(entity, id, input) {
  const existing = await call("get", { entity, id });
  if (existing) {
    console.log(`exists ${entity}/${id}`);
    return existing;
  }
  const created = await call("create", { entity, input: { ...input, id } });
  console.log(`created ${entity}/${id}`);
  return created;
}

const now = new Date().toISOString();
const passwordHash = bcrypt.hashSync("Demo@12345", 10);

await ensure("properties", "prop_001", {
  name: "Sunrise PG",
  legalName: "Sunrise Hospitality Services",
  address: "12 Lake View Road",
  city: "Bengaluru",
  contactEmail: "owner@sunrisepg.test",
  contactPhone: "+91 90000 00001",
  status: "active",
  createdAt: now,
  updatedAt: now,
});

const users = [
  ["user_admin", "admin@sunrisepg.test", "Aarav Admin", "SUPER_ADMIN", ""],
  ["user_owner", "owner@sunrisepg.test", "Nisha Owner", "OWNER_MANAGER", ""],
  ["user_accountant", "accounts@sunrisepg.test", "Kiran Accounts", "ACCOUNTANT", ""],
  ["user_caretaker", "care@sunrisepg.test", "Mohan Caretaker", "CARETAKER", ""],
  ["user_resident", "resident@sunrisepg.test", "Meera Resident", "RESIDENT", "res_001"],
];

for (const [id, email, name, role, residentId] of users) {
  await ensure("users", id, {
    email,
    passwordHash,
    name,
    role,
    propertyId: "prop_001",
    residentId,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
}

console.log("Seed complete. Demo password: Demo@12345");
