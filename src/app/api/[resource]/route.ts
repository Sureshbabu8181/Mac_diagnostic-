import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { entityNames, type EntityName } from "@/lib/models";
import { getStorage } from "@/lib/storage";

const resourceSchema = z.enum(entityNames);

export async function GET(request: Request, context: { params: Promise<{ resource: string }> }) {
  try {
    const session = await requireSession();
    const { resource } = await context.params;
    const entity = resourceSchema.parse(resource) as EntityName;
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
    const input = await request.json();
    const result = await getStorage().create(entity, {
      ...input,
      propertyId: input.propertyId ?? session.propertyId,
    });
    await getStorage().create("audit_logs", {
      propertyId: session.propertyId,
      actorUserId: session.id,
      action: "create",
      entity,
      entityId: result.id,
      detailsJson: JSON.stringify({ input }),
    });
    return ok(result, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
