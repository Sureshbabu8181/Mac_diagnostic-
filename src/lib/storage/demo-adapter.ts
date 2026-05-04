import { demoData } from "../seed";
import type { EntityMap, EntityName } from "../models";
import { makeId, matchesQuery, type ListOptions, type ListResult, type StorageAdapter } from "./storage-adapter";

const store = globalThis as typeof globalThis & {
  __pgHostelDemoData?: { [K in EntityName]: EntityMap[K][] };
};

if (!store.__pgHostelDemoData) {
  store.__pgHostelDemoData = structuredClone(demoData);
}

for (const key of Object.keys(demoData) as EntityName[]) {
  store.__pgHostelDemoData[key] ??= structuredClone(demoData[key]) as never;
}

export class DemoStorageAdapter implements StorageAdapter {
  async list<K extends EntityName>(entity: K, options: ListOptions = {}): Promise<ListResult<EntityMap[K]>> {
    const page = Number(options.page ?? 1);
    const pageSize = Number(options.pageSize ?? 25);
    let rows = [...store.__pgHostelDemoData![entity]] as EntityMap[K][];

    if (!options.includeDeleted) {
      rows = rows.filter((row) => (row as { status?: string }).status !== "deleted");
    }

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
    return (store.__pgHostelDemoData![entity] as EntityMap[K][]).find((row) => row.id === id) ?? null;
  }

  async create<K extends EntityName>(entity: K, input: Partial<EntityMap[K]>) {
    const timestamp = new Date().toISOString();
    const row = {
      ...input,
      id: input.id ?? makeId(entity.slice(0, 4)),
      createdAt: (input as { createdAt?: string }).createdAt ?? timestamp,
      updatedAt: timestamp,
    } as EntityMap[K];
    (store.__pgHostelDemoData![entity] as EntityMap[K][]).push(row);
    return row;
  }

  async update<K extends EntityName>(entity: K, id: string, input: Partial<EntityMap[K]>) {
    const rows = store.__pgHostelDemoData![entity] as EntityMap[K][];
    const index = rows.findIndex((row) => row.id === id);
    if (index < 0) throw new Error(`${entity} record not found: ${id}`);
    rows[index] = { ...rows[index], ...input, updatedAt: new Date().toISOString() };
    return rows[index];
  }

  async softDelete<K extends EntityName>(entity: K, id: string) {
    return this.update(entity, id, { status: "deleted" } as unknown as Partial<EntityMap[K]>);
  }
}
