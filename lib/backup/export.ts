import { getDb, SCHEMA_VERSION } from "@/lib/db/db";
import { metaRepo } from "@/lib/db/meta-repo";
import type { Connection, Feature, Floor, Project } from "@/lib/domain/schema";
import { backupSchemaV1, BACKUP_APP_ID, type BackupV1 } from "@/lib/backup/schema";
import { backupFilename } from "@/lib/backup/filename";

// PRD 30 export: gather everything in the project, validate against the
// backup schema, and hand back the JSON + filename. The caller downloads.

export interface ExportedBackup {
  filename: string;
  json: string;
}

export async function buildProjectBackup(
  project: Project,
  floors: Floor[],
  features: Feature[],
  connections: Connection[],
  now = Date.now(),
): Promise<ExportedBackup> {
  const backup: BackupV1 = {
    app: BACKUP_APP_ID,
    kind: "project-backup",
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date(now).toISOString(),
    project,
    floors,
    features,
    connections,
  };
  // PRD 30: validate before download - a broken backup is a bug we refuse to
  // write, same rule as the GeoJSON exporter (PRD 22).
  const parsed = backupSchemaV1.parse(backup);
  return {
    filename: backupFilename(parsed.project.name, new Date(now)),
    json: JSON.stringify(parsed, null, 2),
  };
}

export async function exportProjectBackup(projectId: string): Promise<ExportedBackup> {
  const db = getDb();
  const project = await db.projects.get(projectId);
  if (!project) throw new Error("Project not found");
  const floors = await db.floors.where("projectId").equals(projectId).toArray();
  const features = await db.features.where("projectId").equals(projectId).toArray();
  const connections = await db.connections.where("projectId").equals(projectId).toArray();
  const result = await buildProjectBackup(project, floors, features, connections);
  // The reminder banner compares against this timestamp (PRD 30).
  await metaRepo.setLastBackupAt(projectId, Date.now());
  return result;
}
