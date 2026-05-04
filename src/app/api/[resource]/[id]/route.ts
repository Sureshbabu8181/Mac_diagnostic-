import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { entityNames, type EntityName } from "@/lib/models";
import { getStorage } from "@/lib/storage";

const resourceSchema = z.enum(entityNames);

export async function GET(_: Request, context: { params: Promise<{ resource: string; id: string }> }) {
  try {
    const session = await requireSession();
    const { resource, id } = await context.params;
    const entity = resourceSchema.parse(resource) as EntityName;
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
    const input = await request.json();
    const result = await getStorage().update(entity, id, input);
    await getStorage().create("audit_logs", {
      propertyId: session.propertyId,
      actorUserId: session.id,
      action: "update",
      entity,
      entityId: id,
      detailsJson: JSON.stringify({ input }),
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
