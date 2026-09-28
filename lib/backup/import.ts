import { z } from "zod";
import { getDb, SCHEMA_VERSION } from "@/lib/db/db";
import { newId } from "@/lib/db/id";
import type { Connection, Feature, Floor, Project } from "@/lib/domain/schema";
import { backupSchemaV1, BACKUP_APP_ID } from "@/lib/backup/schema";

// PRD 30 import: validate, migrate if old, and import as a NEW project copy -
// never merge-overwrite silently. A corrupt or invalid file is rejected with
// a plain-language error and nothing is written.

export class ImportRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportRejectedError";
  }
}

type AnyRecord = Record<string, unknown>;

interface ParsedBackup {
  project: Project;
  floors: Floor[];
  features: Feature[];
  connections: Connection[];
  schemaVersion: number;
}

const envelopeSchema = z.object({
  app: z.string(),
  kind: z.string(),
  schemaVersion: z.number(),
});

/** Migrate older backup versions forward. v1 is the first version. */
function migrate(raw: AnyRecord, fromVersion: number): ParsedBackup {
  const data = raw;
  // Future versions chain here:
  // if (fromVersion === 1) data = migrateV1toV2(data);
  if (fromVersion !== SCHEMA_VERSION) {
    throw new ImportRejectedError(
      `Backup schema version ${fromVersion} cannot be read by this version (${SCHEMA_VERSION}).`,
    );
  }
  const parsed = backupSchemaV1.safeParse(data);
  if (!parsed.success) {
    throw new ImportRejectedError("This backup file is damaged or incomplete.");
  }
  return {
    project: parsed.data.project,
    floors: parsed.data.floors,
    features: parsed.data.features,
    connections: parsed.data.connections,
    schemaVersion: fromVersion,
  };
}

function parseBackup(text: string): ParsedBackup {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ImportRejectedError("That file is not valid JSON.");
  }
  if (typeof json !== "object" || json === null) {
    throw new ImportRejectedError("That file is not a Walk & Plot backup.");
  }
  const raw = json as AnyRecord;
  const envelope = envelopeSchema.safeParse(json);
  if (!envelope.success || envelope.data.app !== BACKUP_APP_ID) {
    throw new ImportRejectedError("That file is not a Walk & Plot backup.");
  }
  if (envelope.data.kind !== "project-backup") {
    throw new ImportRejectedError("That file is not a project backup.");
  }
  if (envelope.data.schemaVersion > SCHEMA_VERSION) {
    throw new ImportRejectedError(
      "This backup was made by a newer version of Walk & Plot. Update the app, then try again.",
    );
  }
  return migrate(raw, envelope.data.schemaVersion);
}

// AC-07: export -> fresh browser -> import -> export is byte-equivalent
// modulo timestamps. So ids are preserved whenever they cannot collide (the
// fresh-DB case), and the whole subtree is remapped only when the project
// already exists here - an import then lands as a separate copy instead of
// merging over the original (PRD 30).
function prepareImport(backup: ParsedBackup, projectExists: boolean) {
  if (!projectExists) {
    return {
      project: backup.project,
      floors: backup.floors,
      features: backup.features,
      connections: backup.connections,
    };
  }

  const projectId = newId();
  const floorIds = new Map<string, string>();
  for (const f of backup.floors) floorIds.set(f.id, newId());
  const featureIds = new Map<string, string>();
  const groupIds = new Map<string, string>();
  for (const f of backup.features) {
    featureIds.set(f.id, newId());
    // PRD 28: connectorGroupId links the copies of one vertical connector
    // across floors. It is its own id space - remap it consistently so the
    // link survives the copy.
    if (f.connectorGroupId && !groupIds.has(f.connectorGroupId)) {
      groupIds.set(f.connectorGroupId, newId());
    }
  }
  const connectionIds = new Map<string, string>();
  for (const c of backup.connections) connectionIds.set(c.id, newId());

  const project: Project = { ...backup.project, id: projectId };

  const floors: Floor[] = backup.floors.map((f) => ({ ...f, id: floorIds.get(f.id)!, projectId }));

  const features: Feature[] = backup.features.map((f) => {
    const mapped: Feature = { ...f, id: featureIds.get(f.id)!, projectId };
    if (mapped.connectorGroupId) {
      mapped.connectorGroupId = groupIds.get(mapped.connectorGroupId)!;
    }
    return mapped;
  });

  const connections: Connection[] = backup.connections.map((c) => ({
    ...c,
    id: connectionIds.get(c.id)!,
    projectId,
    fromFeatureId: featureIds.get(c.fromFeatureId)!,
    toFeatureId: featureIds.get(c.toFeatureId)!,
  }));

  return { project, floors, features, connections };
}

/** Returns the id of the imported project copy. */
export async function importProjectBackup(text: string): Promise<string> {
  const backup = parseBackup(text);
  const db = getDb();
  const projectExists = (await db.projects.get(backup.project.id)) !== undefined;
  const prepared = prepareImport(backup, projectExists);
  // PRD 29: all-or-nothing - a failed import leaves the library untouched.
  await db.transaction("rw", db.projects, db.floors, db.features, db.connections, async () => {
    await db.projects.add(prepared.project);
    if (prepared.floors.length) await db.floors.bulkAdd(prepared.floors);
    if (prepared.features.length) await db.features.bulkAdd(prepared.features);
    if (prepared.connections.length) await db.connections.bulkAdd(prepared.connections);
  });
  return prepared.project.id;
}
