import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { getStorage } from "@/lib/storage";

const schema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  dueDate: z.string().min(8),
  messAmount: z.coerce.number().min(0).default(0),
  taxPercent: z.coerce.number().min(0).default(0),
});

export async function POST(request: Request) {
  try {
    const session = await requireSession(["SUPER_ADMIN", "OWNER_MANAGER", "ACCOUNTANT"]);
    const input = schema.parse(await request.json());
    const storage = getStorage();
    const [allocations, existing] = await Promise.all([
      storage.list("allocations", { filters: { propertyId: session.propertyId, status: "active" }, pageSize: 1000 }),
      storage.list("invoices", { filters: { propertyId: session.propertyId, month: input.month }, pageSize: 1000 }),
    ]);
    const existingKeys = new Set(existing.rows.map((invoice) => `${invoice.residentId}:${invoice.month}`));
    const created = [];
    for (const allocation of allocations.rows) {
      const key = `${allocation.residentId}:${input.month}`;
      if (existingKeys.has(key)) continue;
      const subtotal = Number(allocation.monthlyRent) + input.messAmount;
      const taxAmount = Math.round((subtotal * input.taxPercent) / 100);
      created.push(await storage.create("invoices", {
        propertyId: session.propertyId,
        residentId: allocation.residentId,
        month: input.month,
        rentAmount: Number(allocation.monthlyRent),
        messAmount: input.messAmount,
        lateFee: 0,
        taxAmount,
        totalAmount: subtotal + taxAmount,
        paidAmount: 0,
        dueDate: input.dueDate,
        status: "due",
      }));
    }
    await storage.create("audit_logs", {
      propertyId: session.propertyId,
      actorUserId: session.id,
      action: "workflow.generate_invoices",
      entity: "invoices",
      entityId: input.month,
      detailsJson: JSON.stringify({ created: created.length }),
    });
    return ok({ created, skipped: existing.rows.length });
  } catch (error) {
    return fail(error);
  }
}
