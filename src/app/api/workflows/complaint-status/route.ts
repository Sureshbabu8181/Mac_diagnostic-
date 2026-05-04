import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { getStorage } from "@/lib/storage";

const schema = z.object({
  complaintId: z.string().min(1),
  status: z.enum(["open", "in_progress", "resolved", "closed"]),
  actionTaken: z.string().optional(),
  materialCost: z.coerce.number().min(0).default(0),
  laborCost: z.coerce.number().min(0).default(0),
});

export async function POST(request: Request) {
  try {
    const session = await requireSession(["SUPER_ADMIN", "OWNER_MANAGER", "CARETAKER"]);
    const input = schema.parse(await request.json());
    const storage = getStorage();
    const complaint = await storage.get("complaints", input.complaintId);
    if (!complaint || complaint.propertyId !== session.propertyId) throw Object.assign(new Error("Complaint not found"), { status: 404 });
    const updated = await storage.update("complaints", input.complaintId, {
      status: input.status,
      resolvedAt: ["resolved", "closed"].includes(input.status) ? new Date().toISOString() : complaint.resolvedAt,
    });
    let log = null;
    if (input.actionTaken) {
      log = await storage.create("maintenance_logs", {
        propertyId: session.propertyId,
        complaintId: input.complaintId,
        staffId: session.id,
        actionTaken: input.actionTaken,
        materialCost: input.materialCost,
        laborCost: input.laborCost,
      });
    }
    await storage.create("audit_logs", {
      propertyId: session.propertyId,
      actorUserId: session.id,
      action: "workflow.complaint_status",
      entity: "complaints",
      entityId: input.complaintId,
      detailsJson: JSON.stringify({ status: input.status }),
    });
    return ok({ complaint: updated, log });
  } catch (error) {
    return fail(error);
  }
}
