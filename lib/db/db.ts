import Dexie, { type Table } from "dexie";
import type { Connection, Feature, Floor, MetaEntry, Project } from "@/lib/domain/schema";

// PRD 29: lib/db is the only module that knows IndexedDB exists. Every schema
// change ships as a new Dexie version with an upgrade path; a failed migration
// leaves the DB untouched (Dexie aborts the open).

export const SCHEMA_VERSION = 1;

export class WalkAndPlotDB extends Dexie {
  projects!: Table<Project, string>;
  floors!: Table<Floor, string>;
  features!: Table<Feature, string>;
  connections!: Table<Connection, string>;
  meta!: Table<MetaEntry, string>;

  constructor(name = "walk-and-plot") {
    super(name);
    this.version(SCHEMA_VERSION).stores({
      projects: "id, status, updatedAt",
      floors: "id, projectId, order, status",
      features: "id, projectId, floorId, type, subtype",
      connections: "id, projectId, fromFeatureId, toFeatureId",
      meta: "key",
    });
  }
}

let instance: WalkAndPlotDB | null = null;

export function getDb(): WalkAndPlotDB {
  if (!instance) instance = new WalkAndPlotDB();
  return instance;
}

// Tests swap in a fake-indexeddb-backed instance.
export function setDb(next: WalkAndPlotDB): void {
  instance = next;
}
