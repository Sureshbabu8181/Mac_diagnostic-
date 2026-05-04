import { clearSession } from "@/lib/auth/session";
import { fail, ok } from "@/lib/api";

export async function POST() {
  try {
    await clearSession();
    return ok({ success: true });
  } catch (error) {
    return fail(error);
  }
}
