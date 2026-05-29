import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { callAppsScript } from "@/lib/storage/apps-script-client";
import { uploadToDrive, type DriveFolderKey } from "@/lib/storage/google-drive-service";

const folderSchema = z.enum(["agreements", "id_proofs", "resident_photos", "receipts", "complaint_images", "exports", "notices", "staff_docs"]);

export async function POST(request: Request) {
  try {
    await requireSession(["SUPER_ADMIN", "OWNER_MANAGER", "ACCOUNTANT", "CARETAKER", "RESIDENT"]);
    const formData = await request.formData();
    const file = formData.get("file");
    const folder = folderSchema.parse(formData.get("folder")) as DriveFolderKey;
    if (!(file instanceof File)) throw Object.assign(new Error("file is required"), { status: 400 });
    const buffer = Buffer.from(await file.arrayBuffer());
    if (process.env.DATA_ADAPTER === "apps_script") {
      return ok(await callAppsScript("uploadFile", {
        folder,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        base64: buffer.toString("base64"),
      }));
    }
    if (process.env.DATA_ADAPTER !== "google_sheets") {
      return ok({ id: `demo_file_${crypto.randomUUID().slice(0, 8)}`, name: "demo-upload", webViewLink: "#" });
    }
    return ok(await uploadToDrive({ folder, fileName: file.name, mimeType: file.type || "application/octet-stream", buffer }));
  } catch (error) {
    return fail(error);
  }
}
