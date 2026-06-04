import { z } from "zod";
import bcrypt from "bcryptjs";
import { fail, ok } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { entityNames, roles, type EntityName, type Role } from "@/lib/models";
import { getStorage } from "@/lib/storage";

const resourceSchema = z.enum(entityNames);
const userUpdateSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  name: z.string().min(2).optional(),
  role: z.enum(roles).optional(),
  residentId: z.string().optional(),
  status: z.enum(["active", "inactive", "deleted"]).optional(),
});

function canUpdate(entity: EntityName, role: Role) {
  if (role === "SUPER_ADMIN") return true;
  if (role === "OWNER_MANAGER") return entity !== "audit_logs";
  if (role === "ACCOUNTANT") return ["invoices", "payments", "expenses"].includes(entity);
  if (role === "CARETAKER") return ["residents", "allocations", "complaints", "maintenance_logs", "visitors", "inventory_items", "inventory_transactions"].includes(entity);
  return false;
}

function canDelete(entity: EntityName, role: Role) {
  if (role === "SUPER_ADMIN") return true;
  if (role === "OWNER_MANAGER") return entity !== "audit_logs";
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

export async function GET(_: Request, context: { params: Promise<{ resource: string; id: string }> }) {
  try {
    const session = await requireSession();
    const { resource, id } = await context.params;
    const entity = resourceSchema.parse(resource) as EntityName;
    if (!canRead(entity, session.role)) throw Object.assign(new Error("Forbidden"), { status: 403 });
    const result = await getStorage().get(entity, id);
    if (!result) throw Object.assign(new Error("Record not found"), { status: 404 });
    if (entity !== "properties" && (result as { propertyId?: string }).propertyId !== session.propertyId) {
      throw Object.assign(new Error("Forbidden"), { status: 403 });
    }
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}

export async function PUT(request: Request, context: { params: Promise<{ resource: string; id: string }> }) {
  try {
    const session = await requireSession(["SUPER_ADMIN", "OWNER_MANAGER", "ACCOUNTANT", "CARETAKER"]);
    const { resource, id } = await context.params;
    const entity = resourceSchema.parse(resource) as EntityName;
    if (!canUpdate(entity, session.role)) throw Object.assign(new Error("Forbidden"), { status: 403 });
    const input = await request.json();
    const data = entity === "users" ? normalizeUserUpdate(input) : input;
    if (entity === "users" && (data as { role?: Role }).role) assertUserRoleAllowed(session.role, (data as { role: Role }).role);
    const result = await getStorage().update(entity, id, data);
    await getStorage().create("audit_logs", {
      propertyId: session.propertyId,
      actorUserId: session.id,
      action: "update",
      entity,
      entityId: id,
      detailsJson: JSON.stringify({ input: safeAuditInput(entity, data) }),
    });
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(_: Request, context: { params: Promise<{ resource: string; id: string }> }) {
  try {
    const session = await requireSession(["SUPER_ADMIN", "OWNER_MANAGER"]);
    const { resource, id } = await context.params;
    const entity = resourceSchema.parse(resource) as EntityName;
    if (!canDelete(entity, session.role)) throw Object.assign(new Error("Forbidden"), { status: 403 });
    if (entity === "users" && id === session.id) throw Object.assign(new Error("You cannot delete your own user."), { status: 400 });
    if (entity === "users" && session.role === "OWNER_MANAGER") {
      const target = await getStorage().get("users", id);
      if (target?.role === "SUPER_ADMIN") throw Object.assign(new Error("Forbidden"), { status: 403 });
    }
    const result = await getStorage().softDelete(entity, id);
    await getStorage().create("audit_logs", {
      propertyId: session.propertyId,
      actorUserId: session.id,
      action: "soft_delete",
      entity,
      entityId: id,
      detailsJson: "{}",
    });
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}

function normalizeUserUpdate(input: unknown) {
  const parsed = userUpdateSchema.parse(input);
  const result: Record<string, unknown> = { ...parsed };
  if (parsed.password) {
    result.passwordHash = bcrypt.hashSync(parsed.password, 10);
    delete result.password;
  }
  return result;
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
