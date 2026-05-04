import { fail, ok } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { getDashboard } from "@/lib/dashboard";

export async function GET() {
  try {
    const session = await requireSession();
    return ok(await getDashboard(session.propertyId));
  } catch (error) {
    return fail(error);
  }
}
