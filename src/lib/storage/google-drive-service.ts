import { Readable } from "node:stream";
import { google } from "googleapis";

const driveFolders = {
  agreements: process.env.GOOGLE_DRIVE_AGREEMENTS_FOLDER_ID,
  id_proofs: process.env.GOOGLE_DRIVE_ID_PROOFS_FOLDER_ID,
  resident_photos: process.env.GOOGLE_DRIVE_RESIDENT_PHOTOS_FOLDER_ID,
  receipts: process.env.GOOGLE_DRIVE_RECEIPTS_FOLDER_ID,
  complaint_images: process.env.GOOGLE_DRIVE_COMPLAINT_IMAGES_FOLDER_ID,
  exports: process.env.GOOGLE_DRIVE_EXPORTS_FOLDER_ID,
  notices: process.env.GOOGLE_DRIVE_NOTICES_FOLDER_ID,
  staff_docs: process.env.GOOGLE_DRIVE_STAFF_DOCS_FOLDER_ID,
} as const;

export type DriveFolderKey = keyof typeof driveFolders;

function getDrive() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !key) throw new Error("Google service account credentials are not configured.");
  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  return google.drive({ version: "v3", auth });
}

export async function uploadToDrive(params: {
  folder: DriveFolderKey;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}) {
  const folderId = driveFolders[params.folder];
  if (!folderId) throw new Error(`Drive folder ID missing for ${params.folder}`);
  const response = await getDrive().files.create({
    requestBody: {
      name: params.fileName,
      parents: [folderId],
      mimeType: params.mimeType,
    },
    media: {
      mimeType: params.mimeType,
      body: Readable.from(params.buffer),
    },
    fields: "id,name,webViewLink,webContentLink",
  });
  return response.data;
}
