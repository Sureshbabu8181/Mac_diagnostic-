import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { getStorage } from "@/lib/storage";

const schema = z.object({
  itemId: z.string().min(1),
  type: z.enum(["purchase", "issue", "consume", "adjustment"]),
  quantity: z.coerce.number().positive(),
  unitCost: z.coerce.number().min(0),
  reference: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const session = await requireSession(["SUPER_ADMIN", "OWNER_MANAGER", "CARETAKER", "ACCOUNTANT"]);
    const input = schema.parse(await request.json());
    const storage = getStorage();
    const item = await storage.get("inventory_items", input.itemId);
    if (!item || item.propertyId !== session.propertyId) throw Object.assign(new Error("Item not found"), { status: 404 });
    const delta = input.type === "purchase" || input.type === "adjustment" ? input.quantity : -input.quantity;
    const currentStock = Math.max(0, Number(item.currentStock) + delta);
    const transaction = await storage.create("inventory_transactions", {
      propertyId: session.propertyId,
      itemId: input.itemId,
      type: input.type,
      quantity: input.quantity,
      unitCost: input.unitCost,
      reference: input.reference,
      createdBy: session.id,
    });
    const updatedItem = await storage.update("inventory_items", input.itemId, { currentStock });
    await storage.create("audit_logs", {
      propertyId: session.propertyId,
      actorUserId: session.id,
      action: "workflow.inventory_transaction",
      entity: "inventory_transactions",
      entityId: transaction.id,
      detailsJson: JSON.stringify({ itemId: input.itemId, delta }),
    });
    return ok({ transaction, item: updatedItem }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
