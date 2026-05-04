import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { getStorage } from "@/lib/storage";

const schema = z.object({
  invoiceId: z.string().min(1),
  amount: z.coerce.number().positive(),
  mode: z.enum(["cash", "upi", "bank_transfer", "card", "other"]),
  reference: z.string().min(1),
  notes: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const session = await requireSession(["SUPER_ADMIN", "OWNER_MANAGER", "ACCOUNTANT"]);
    const input = schema.parse(await request.json());
    const storage = getStorage();
    const invoice = await storage.get("invoices", input.invoiceId);
    if (!invoice || invoice.propertyId !== session.propertyId) throw Object.assign(new Error("Invoice not found"), { status: 404 });
    const paidAmount = Number(invoice.paidAmount) + input.amount;
    const status = paidAmount >= Number(invoice.totalAmount) ? "paid" : "partially_paid";
    const payment = await storage.create("payments", {
      propertyId: session.propertyId,
      invoiceId: invoice.id,
      residentId: invoice.residentId,
      amount: input.amount,
      mode: input.mode,
      paidAt: new Date().toISOString(),
      reference: input.reference,
      notes: input.notes,
      status: "received",
    });
    const updatedInvoice = await storage.update("invoices", invoice.id, { paidAmount, status });
    await storage.create("audit_logs", {
      propertyId: session.propertyId,
      actorUserId: session.id,
      action: "workflow.record_payment",
      entity: "payments",
      entityId: payment.id,
      detailsJson: JSON.stringify({ invoiceId: invoice.id, amount: input.amount }),
    });
    return ok({ payment, invoice: updatedInvoice }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
