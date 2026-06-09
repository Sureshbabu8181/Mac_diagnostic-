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

const cache = new Map<string, { data: unknown; at: number }>();
const CACHE_TTL = 15_000;

function getCacheKey(action: string, payload: Record<string, unknown>) {
  return `${action}:${JSON.stringify(payload)}`;
}

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.at < CACHE_TTL) return entry.data as T;
  cache.delete(key);
  return null;
}

function setCache(key: string, data: unknown) {
  cache.set(key, { data, at: Date.now() });
}

function clearCache(action?: string) {
  if (action) {
    for (const key of cache.keys()) {
      if (key.startsWith(`${action}:`)) cache.delete(key);
    }
  } else {
    cache.clear();
  }
}

export async function callAppsScript<T>(action: AppsScriptAction, payload: Record<string, unknown> = {}) {
  const isRead = action === "list" || action === "get" || action === "dashboard";
  const isWrite = action === "create" || action === "update" || action === "softDelete";
  const cacheKey = isRead ? getCacheKey(action, payload) : "";
  if (isRead) {
    const cached = getCached<T>(cacheKey);
    if (cached) return cached;
  }
  if (isWrite && payload.entity) clearCache(`list:${JSON.stringify({ entity: payload.entity })}`);

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
  if (isRead) setCache(cacheKey, result.data);
  return result.data as T;
}
