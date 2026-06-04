import { fail, ok } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { getDashboard } from "@/lib/dashboard";
import { callAppsScript } from "@/lib/storage/apps-script-client";

export async function GET() {
  try {
    const session = await requireSession();
    if (process.env.DATA_ADAPTER === "apps_script") {
      try {
        return ok(await callAppsScript("dashboard", { propertyId: session.propertyId }));
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes("Unknown action: dashboard")) throw error;
      }
    }
    return ok(await getDashboard(session.propertyId));
  } catch (error) {
    return fail(error);
  }
}
