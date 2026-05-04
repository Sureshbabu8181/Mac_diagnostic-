import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { getStorage } from "@/lib/storage";

const schema = z.object({
  fullName: z.string().min(2),
  phone: z.string().min(8),
  email: z.string().email(),
  gender: z.string().min(1),
  occupation: z.string().min(1),
  kycType: z.string().min(1),
  kycNumber: z.string().min(3),
  emergencyName: z.string().min(2),
  emergencyPhone: z.string().min(8),
  roomId: z.string().min(1),
  bedId: z.string().min(1),
  checkInDate: z.string().min(8),
  expectedCheckOutDate: z.string().optional(),
  depositAmount: z.coerce.number().min(0),
  monthlyRent: z.coerce.number().positive(),
});

export async function POST(request: Request) {
  try {
    const session = await requireSession(["SUPER_ADMIN", "OWNER_MANAGER", "CARETAKER"]);
    const input = schema.parse(await request.json());
    const storage = getStorage();
    const bed = await storage.get("beds", input.bedId);
    if (!bed || bed.propertyId !== session.propertyId) throw Object.assign(new Error("Bed not found"), { status: 404 });
    if (bed.status !== "vacant") throw Object.assign(new Error("Selected bed is not vacant"), { status: 409 });

    const timestamp = new Date().toISOString();
    const resident = await storage.create("residents", {
      propertyId: session.propertyId,
      fullName: input.fullName,
      phone: input.phone,
      email: input.email,
      gender: input.gender,
      dateOfBirth: "",
      occupation: input.occupation,
      kycType: input.kycType,
      kycNumber: input.kycNumber,
      emergencyName: input.emergencyName,
      emergencyPhone: input.emergencyPhone,
      status: "active",
    });
    const allocation = await storage.create("allocations", {
      propertyId: session.propertyId,
      residentId: resident.id,
      roomId: input.roomId,
      bedId: input.bedId,
      checkInDate: input.checkInDate,
      expectedCheckOutDate: input.expectedCheckOutDate,
      depositAmount: input.depositAmount,
      monthlyRent: input.monthlyRent,
      status: "active",
    });
    await storage.update("beds", input.bedId, { status: "occupied", currentResidentId: resident.id });
    await storage.create("audit_logs", {
      propertyId: session.propertyId,
      actorUserId: session.id,
      action: "workflow.check_in",
      entity: "allocations",
      entityId: allocation.id,
      detailsJson: JSON.stringify({ residentId: resident.id, bedId: input.bedId }),
      createdAt: timestamp,
    });
    return ok({ resident, allocation }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
