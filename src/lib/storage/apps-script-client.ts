type AppsScriptAction =
  | "list"
  | "get"
  | "create"
  | "update"
  | "softDelete"
  | "uploadFile"
  | "createDocument"
  | "dashboard";

type AppsScriptResponse<T> = {
  data?: T;
  error?: string;
};

export async function callAppsScript<T>(action: AppsScriptAction, payload: Record<string, unknown> = {}) {
  const url = process.env.APPS_SCRIPT_WEB_APP_URL;
  const apiKey = process.env.APPS_SCRIPT_API_KEY;
  if (!url || !apiKey) throw new Error("Apps Script endpoint is not configured.");

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ apiKey, action, ...payload }),
    cache: "no-store",
  });
  const result = (await response.json()) as AppsScriptResponse<T>;
  if (!response.ok || result.error) throw new Error(result.error ?? `Apps Script request failed: ${response.status}`);
  return result.data as T;
}
