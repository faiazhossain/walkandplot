import { getDb } from "@/lib/db/db";
import { connectionRepo } from "@/lib/db/connection-repo";
import { featureRepo, floorRepo, projectRepo } from "@/lib/db/repositories";
import { downloadJson } from "@/lib/backup/filename";
import { buildFloorGeoJSON, buildProjectGeoJSON, exportFilename } from "@/lib/geojson/export";

// PRD 22 scopes: one floor or the whole project. Components call these; the
// repos remain the only Dexie speakers.

export interface ExportedFile {
  filename: string;
  json: string;
}

export async function buildFloorExport(floorId: string): Promise<ExportedFile> {
  const db = getDb();
  const floor = await floorRepo.get(floorId);
  if (!floor) throw new Error("Floor not found");
  const project = await projectRepo.get(floor.projectId);
  if (!project) throw new Error("Project not found");
  const [features, connections] = await Promise.all([
    featureRepo.listByFloor(floorId),
    connectionRepo.listByProject(project.id),
  ]);
  const collection = buildFloorGeoJSON({ project, floor, features, connections });
  return {
    filename: exportFilename(project.name, floor.displayName),
    json: JSON.stringify(collection, null, 2),
  };
}

export async function buildProjectExport(projectId: string): Promise<ExportedFile> {
  const db = getDb();
  const project = await projectRepo.get(projectId);
  if (!project) throw new Error("Project not found");
  const [floors, features, connections] = await Promise.all([
    floorRepo.listByProject(projectId),
    db.features.where("projectId").equals(projectId).toArray(),
    connectionRepo.listByProject(projectId),
  ]);
  const collection = buildProjectGeoJSON({ project, floors, features, connections });
  return { filename: exportFilename(project.name), json: JSON.stringify(collection, null, 2) };
}

/** Browser-only: builds then triggers the download. */
export async function downloadFloorGeoJSON(floorId: string): Promise<string> {
  const file = await buildFloorExport(floorId);
  downloadJson(file.filename, file.json);
  return file.filename;
}

export async function downloadProjectGeoJSON(projectId: string): Promise<string> {
  const file = await buildProjectExport(projectId);
  downloadJson(file.filename, file.json);
  return file.filename;
}
