import { fail, ok } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { getStorage } from "@/lib/storage";

export async function POST() {
  try {
    const session = await requireSession(["SUPER_ADMIN", "OWNER_MANAGER", "CARETAKER"]);
    const storage = getStorage();

    const { rows: allocations } = await storage.list("allocations", {
      filters: { propertyId: session.propertyId, status: "active" },
      pageSize: 5000,
    });

    const today = new Date().toISOString().slice(0, 10);
    const dueAllocations = allocations.filter(
      (a) => a.scheduledVacateDate && a.scheduledVacateDate <= today
    );

    if (!dueAllocations.length) {
      return ok({ message: "No allocations ready for auto-vacate", count: 0 });
    }

    const timestamp = new Date().toISOString();
    const results: { allocationId: string; residentId: string; status: string }[] = [];

    for (const allocation of dueAllocations) {
      await storage.update("allocations", allocation.id, {
        actualCheckOutDate: today,
        status: "completed",
      });

      if (allocation.residentId) {
        await storage.update("residents", allocation.residentId, {
          status: "checked_out",
        });
      }

      if (allocation.bedId) {
        const bed = await storage.get("beds", allocation.bedId);
        if (bed && bed.currentResidentId === allocation.residentId) {
          await storage.update("beds", allocation.bedId, {
            status: "vacant",
            currentResidentId: undefined,
          });
        }
      }

      await storage.create("audit_logs", {
        propertyId: session.propertyId,
        actorUserId: session.id,
        action: "workflow.auto_vacate",
        entity: "allocations",
        entityId: allocation.id,
        detailsJson: JSON.stringify({ residentId: allocation.residentId, scheduledVacateDate: allocation.scheduledVacateDate }),
        createdAt: timestamp,
      });

      results.push({ allocationId: allocation.id, residentId: allocation.residentId, status: "completed" });
    }

    return ok({ message: `${results.length} resident(s) auto-vacated`, count: results.length, results });
  } catch (error) {
    return fail(error);
  }
}
