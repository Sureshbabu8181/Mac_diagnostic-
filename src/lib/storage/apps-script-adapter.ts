import type { EntityMap, EntityName } from "../models";
import type { ListOptions, ListResult, StorageAdapter } from "./storage-adapter";
import { callAppsScript } from "./apps-script-client";

function entityCacheKey(entity: string) {
  return `list:${JSON.stringify({ entity })}`;
}

export class AppsScriptAdapter implements StorageAdapter {
  async list<K extends EntityName>(entity: K, options: ListOptions = {}) {
    return callAppsScript<ListResult<EntityMap[K]>>("list", { entity, options });
  }

  async get<K extends EntityName>(entity: K, id: string) {
    return callAppsScript<EntityMap[K] | null>("get", { entity, id });
  }

  async create<K extends EntityName>(entity: K, input: Partial<EntityMap[K]>) {
    const result = await callAppsScript<EntityMap[K]>("create", { entity, input });
    return result;
  }

  async update<K extends EntityName>(entity: K, id: string, input: Partial<EntityMap[K]>) {
    const result = await callAppsScript<EntityMap[K]>("update", { entity, id, input });
    return result;
  }

  async softDelete<K extends EntityName>(entity: K, id: string) {
    const result = await callAppsScript<EntityMap[K]>("softDelete", { entity, id });
    return result;
  }
}
