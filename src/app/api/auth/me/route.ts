import { getSession } from "@/lib/auth/session";
import { ok } from "@/lib/api";

export async function GET() {
  return ok(await getSession());
}
