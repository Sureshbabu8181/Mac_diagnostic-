import type { EntityMap, EntityName } from "../models";

export type ListOptions = {
  query?: string;
  page?: number;
  pageSize?: number;
  includeDeleted?: boolean;
  filters?: Record<string, string>;
};

export type ListResult<T> = {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
};

export type StorageAdapter = {
  list<K extends EntityName>(entity: K, options?: ListOptions): Promise<ListResult<EntityMap[K]>>;
  get<K extends EntityName>(entity: K, id: string): Promise<EntityMap[K] | null>;
  create<K extends EntityName>(entity: K, input: Partial<EntityMap[K]>): Promise<EntityMap[K]>;
  update<K extends EntityName>(entity: K, id: string, input: Partial<EntityMap[K]>): Promise<EntityMap[K]>;
  softDelete<K extends EntityName>(entity: K, id: string): Promise<EntityMap[K]>;
};

export function makeId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

export function matchesQuery(row: Record<string, unknown>, query?: string) {
  if (!query) return true;
  const needle = query.toLowerCase();
  return Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(needle));
}
