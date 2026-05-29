import { AppsScriptAdapter } from "./apps-script-adapter";
import { DemoStorageAdapter } from "./demo-adapter";
import { GoogleSheetsAdapter } from "./google-sheets-adapter";
import type { StorageAdapter } from "./storage-adapter";

let adapter: StorageAdapter | null = null;

export function getStorage(): StorageAdapter {
  if (adapter) return adapter;
  if (process.env.DATA_ADAPTER === "apps_script") adapter = new AppsScriptAdapter();
  else if (process.env.DATA_ADAPTER === "google_sheets") adapter = new GoogleSheetsAdapter();
  else adapter = new DemoStorageAdapter();
  return adapter;
}
