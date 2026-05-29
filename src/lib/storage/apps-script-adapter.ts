import type { EntityMap, EntityName } from "../models";
import type { ListOptions, ListResult, StorageAdapter } from "./storage-adapter";
import { callAppsScript } from "./apps-script-client";

export class AppsScriptAdapter implements StorageAdapter {
  list<K extends EntityName>(entity: K, options: ListOptions = {}) {
    return callAppsScript<ListResult<EntityMap[K]>>("list", { entity, options });
  }

  get<K extends EntityName>(entity: K, id: string) {
    return callAppsScript<EntityMap[K] | null>("get", { entity, id });
  }

  create<K extends EntityName>(entity: K, input: Partial<EntityMap[K]>) {
    return callAppsScript<EntityMap[K]>("create", { entity, input });
  }

  update<K extends EntityName>(entity: K, id: string, input: Partial<EntityMap[K]>) {
    return callAppsScript<EntityMap[K]>("update", { entity, id, input });
  }

  softDelete<K extends EntityName>(entity: K, id: string) {
    return callAppsScript<EntityMap[K]>("softDelete", { entity, id });
  }
}
