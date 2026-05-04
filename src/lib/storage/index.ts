import { DemoStorageAdapter } from "./demo-adapter";
import { GoogleSheetsAdapter } from "./google-sheets-adapter";
import type { StorageAdapter } from "./storage-adapter";

let adapter: StorageAdapter | null = null;

export function getStorage(): StorageAdapter {
  if (adapter) return adapter;
  adapter = process.env.DATA_ADAPTER === "google_sheets" ? new GoogleSheetsAdapter() : new DemoStorageAdapter();
  return adapter;
}
