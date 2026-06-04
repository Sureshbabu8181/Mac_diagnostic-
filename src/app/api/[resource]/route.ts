import { z } from "zod";
import bcrypt from "bcryptjs";
import { fail, ok } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { entityNames, roles, type EntityName, type Role } from "@/lib/models";
import { getStorage } from "@/lib/storage";

const resourceSchema = z.enum(entityNames);
const userSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).optional(),
  passwordHash: z.string().optional(),
  name: z.string().min(2),
  role: z.enum(roles),
  propertyId: z.string().optional(),
  residentId: z.string().optional(),
  status: z.enum(["active", "inactive", "deleted"]).default("active"),
});

function canCreate(entity: EntityName, role: Role) {
  if (role === "SUPER_ADMIN") return true;
  if (role === "OWNER_MANAGER") return entity !== "audit_logs";
  if (role === "ACCOUNTANT") return ["invoices", "payments", "expenses"].includes(entity);
  if (role === "CARETAKER") return ["residents", "allocations", "complaints", "maintenance_logs", "visitors", "inventory_transactions"].includes(entity);
  return false;
}

function canRead(entity: EntityName, role: Role) {
  if (role === "SUPER_ADMIN") return true;
  if (entity === "users") return role === "OWNER_MANAGER";
  if (entity === "audit_logs") return role === "OWNER_MANAGER";
  if (role === "ACCOUNTANT") return ["properties", "invoices", "payments", "expenses", "residents", "allocations", "rooms", "beds"].includes(entity);
  if (role === "CARETAKER") return ["properties", "rooms", "beds", "residents", "allocations", "complaints", "maintenance_logs", "visitors", "inventory_items", "inventory_transactions", "notices", "mess_plans"].includes(entity);
  if (role === "RESIDENT") return ["properties", "complaints", "maintenance_logs", "visitors", "notices", "mess_plans"].includes(entity);
  return true;
}

export async function GET(request: Request, context: { params: Promise<{ resource: string }> }) {
  try {
    const session = await requireSession();
    const { resource } = await context.params;
    const entity = resourceSchema.parse(resource) as EntityName;
    if (!canRead(entity, session.role)) throw Object.assign(new Error("Forbidden"), { status: 403 });
    const url = new URL(request.url);
    const result = await getStorage().list(entity, {
      query: url.searchParams.get("q") ?? undefined,
      page: Number(url.searchParams.get("page") ?? 1),
      pageSize: Number(url.searchParams.get("pageSize") ?? 25),
      filters: entity === "properties" ? undefined : { propertyId: session.propertyId },
    });
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ resource: string }> }) {
  try {
    const session = await requireSession(["SUPER_ADMIN", "OWNER_MANAGER", "ACCOUNTANT", "CARETAKER"]);
    const { resource } = await context.params;
    const entity = resourceSchema.parse(resource) as EntityName;
    if (!canCreate(entity, session.role)) throw Object.assign(new Error("Forbidden"), { status: 403 });
    const input = await request.json();
    const data = entity === "users" ? normalizeUserInput(input, session.propertyId) : input;
    if (entity === "users") assertUserRoleAllowed(session.role, (data as { role: Role }).role);
    const result = await getStorage().create(entity, {
      ...data,
      propertyId: (data as { propertyId?: string }).propertyId ?? session.propertyId,
    });
    await getStorage().create("audit_logs", {
      propertyId: session.propertyId,
      actorUserId: session.id,
      action: "create",
      entity,
      entityId: result.id,
      detailsJson: JSON.stringify({ input: safeAuditInput(entity, data) }),
    });
    return ok(result, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}

function normalizeUserInput(input: unknown, propertyId: string) {
  const parsed = userSchema.parse(input);
  const passwordHash = parsed.password ? bcrypt.hashSync(parsed.password, 10) : parsed.passwordHash;
  if (!passwordHash) throw Object.assign(new Error("password is required"), { status: 400 });
  return {
    email: parsed.email,
    passwordHash,
    name: parsed.name,
    role: parsed.role,
    propertyId: parsed.propertyId || propertyId,
    residentId: parsed.residentId,
    status: parsed.status,
  };
}

function assertUserRoleAllowed(actorRole: Role, targetRole: Role) {
  if (actorRole === "SUPER_ADMIN") return;
  if (actorRole === "OWNER_MANAGER" && targetRole !== "SUPER_ADMIN") return;
  throw Object.assign(new Error("Forbidden"), { status: 403 });
}

function safeAuditInput(entity: EntityName, input: unknown) {
  if (entity !== "users" || typeof input !== "object" || !input) return input;
  const rest = { ...(input as Record<string, unknown>) };
  delete rest.passwordHash;
  delete rest.password;
  return rest;
}
