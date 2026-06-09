import { google } from "googleapis";
import type { EntityMap, EntityName } from "../models";
import { sheetColumns } from "../models";
import { makeId, matchesQuery, type ListOptions, type ListResult, type StorageAdapter } from "./storage-adapter";

const cache = new Map<string, { data: Record<string, unknown>[]; at: number }>();
const CACHE_TTL = 15_000;

function getCached<T extends Record<string, unknown>>(key: string): T[] | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.at < CACHE_TTL) return entry.data as T[];
  cache.delete(key);
  return null;
}

function setCache(key: string, data: Record<string, unknown>[]) {
  cache.set(key, { data, at: Date.now() });
}

function clearCache(entity?: string) {
  if (entity) {
    cache.delete(entity);
  } else {
    cache.clear();
  }
}

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !key) throw new Error("Google service account credentials are not configured.");
  return new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"],
  });
}

export class GoogleSheetsAdapter implements StorageAdapter {
  private spreadsheetId = process.env.GOOGLE_SHEET_ID;
  private sheets = google.sheets({ version: "v4", auth: getAuth() });

  private assertSheetId() {
    if (!this.spreadsheetId) throw new Error("GOOGLE_SHEET_ID is required for the sheets adapter.");
    return this.spreadsheetId;
  }

  private async allRows<K extends EntityName>(entity: K): Promise<EntityMap[K][]> {
    const cached = getCached<EntityMap[K]>(entity);
    if (cached) return cached;
    const range = `${entity}!A:ZZ`;
    const response = await this.sheets.spreadsheets.values.get({ spreadsheetId: this.assertSheetId(), range });
    const values = response.data.values ?? [];
    const headers = values[0] ?? sheetColumns[entity];
    const rows = values.slice(1).filter((row) => row.some(Boolean)).map((row) => {
      const record: Record<string, unknown> = {};
      headers.forEach((header, index) => {
        record[header] = row[index] ?? "";
      });
      return coerceRecord(entity, record) as EntityMap[K];
    });
    setCache(entity, rows as Record<string, unknown>[]);
    return rows;
  }

  private async replaceRows<K extends EntityName>(entity: K, rows: EntityMap[K][]) {
    const columns = sheetColumns[entity];
    const values = [
      columns,
      ...rows.map((row) => columns.map((column) => String((row as Record<string, unknown>)[column] ?? ""))),
    ];
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.assertSheetId(),
      range: `${entity}!A1`,
      valueInputOption: "RAW",
      requestBody: { values },
    });
    clearCache(entity);
  }

  async list<K extends EntityName>(entity: K, options: ListOptions = {}): Promise<ListResult<EntityMap[K]>> {
    const page = Number(options.page ?? 1);
    const pageSize = Number(options.pageSize ?? 25);
    let rows = await this.allRows(entity);
    if (!options.includeDeleted) rows = rows.filter((row) => (row as { status?: string }).status !== "deleted");
    if (options.filters) {
      rows = rows.filter((row) =>
        Object.entries(options.filters ?? {}).every(([key, value]) => String((row as Record<string, unknown>)[key] ?? "") === value),
      );
    }
    rows = rows.filter((row) => matchesQuery(row as Record<string, unknown>, options.query));
    const total = rows.length;
    const start = (page - 1) * pageSize;
    return { rows: rows.slice(start, start + pageSize), total, page, pageSize };
  }

  async get<K extends EntityName>(entity: K, id: string) {
    return (await this.allRows(entity)).find((row) => row.id === id) ?? null;
  }

  async create<K extends EntityName>(entity: K, input: Partial<EntityMap[K]>) {
    const timestamp = new Date().toISOString();
    const row = {
      ...input,
      id: input.id ?? makeId(entity.slice(0, 4)),
      createdAt: (input as { createdAt?: string }).createdAt ?? timestamp,
      updatedAt: timestamp,
    } as EntityMap[K];
    const columns = sheetColumns[entity];
    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.assertSheetId(),
      range: `${entity}!A1`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [columns.map((column) => String((row as Record<string, unknown>)[column] ?? ""))] },
    });
    clearCache(entity);
    return row;
  }

  async update<K extends EntityName>(entity: K, id: string, input: Partial<EntityMap[K]>) {
    const rows = await this.allRows(entity);
    const index = rows.findIndex((row) => row.id === id);
    if (index < 0) throw new Error(`${entity} record not found: ${id}`);
    rows[index] = { ...rows[index], ...input, updatedAt: new Date().toISOString() };
    await this.replaceRows(entity, rows);
    return rows[index];
  }

  async softDelete<K extends EntityName>(entity: K, id: string) {
    return this.update(entity, id, { status: "deleted" } as unknown as Partial<EntityMap[K]>);
  }
}

function coerceRecord(entity: EntityName, record: Record<string, unknown>) {
  for (const column of sheetColumns[entity]) {
    if (["capacity", "monthlyRent", "depositAmount", "rentAmount", "messAmount", "lateFee", "taxAmount", "totalAmount", "paidAmount", "amount", "currentStock", "reorderLevel", "salary", "materialCost", "laborCost", "quantity", "unitCost"].includes(column)) {
      record[column] = Number(record[column] || 0);
    }
  }
  return record;
}
