import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it } from "vitest";
import { WalkAndPlotDB, setDb } from "@/lib/db/db";
import { projectRepo, featureRepo, floorRepo } from "@/lib/db/repositories";
import { exportProjectBackup } from "@/lib/backup/export";
import { importProjectBackup, ImportRejectedError } from "@/lib/backup/import";
import type { Feature } from "@/lib/domain/schema";

// PRD 30 / AC-07: backup round-trip identity, corrupt rejection, migration
// envelope rules, and no-merge-overwrite on duplicate import.

function freshDb(): WalkAndPlotDB {
  const db = new WalkAndPlotDB(`test-${crypto.randomUUID()}`);
  setDb(db);
  return db;
}

let corridor: Feature;

beforeAll(async () => {
  const db = freshDb();
  const { project, floor } = await projectRepo.create({ name: "ABC Shopping Mall", firstFloorName: "Ground" });
  const second = await floorRepo.create({ projectId: project.id, displayName: "Floor 1" });
  corridor = await featureRepo.create({
    id: crypto.randomUUID(),
    projectId: project.id,
    floorId: floor.id,
    type: "path",
    subtype: "corridor",
    name: "Main corridor",
    geometry: {
      type: "LineString",
      coordinates: [
        [0, 0],
        [0, 12.5],
      ],
    },
    access: "public",
    status: "active",
    confidence: "high",
  });
  await floorRepo.setStatus(second.id, "completed");
  void db;
});

describe("backup round-trip (AC-07)", () => {
  it("re-exports byte-equivalent content modulo timestamps", async () => {
    const first = await exportProjectBackup((await projectRepo.list())[0].id);
    const parsedFirst = JSON.parse(first.json);

    // Fresh browser: wipe everything, then import the backup file.
    freshDb();
    const importedId = await importProjectBackup(first.json);

    const second = await exportProjectBackup(importedId);
    const parsedSecond = JSON.parse(second.json);

    // Same name, same floors/features/content; only exportedAt differs.
    expect(parsedSecond).toEqual({ ...parsedFirst, exportedAt: parsedSecond.exportedAt });
    expect(second.filename).toBe(first.filename);
  });

  it("preserves floors, statuses and feature fields", async () => {
    const first = await exportProjectBackup((await projectRepo.list())[0].id);
    freshDb();
    await importProjectBackup(first.json);
    const projects = await projectRepo.list();
    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe("ABC Shopping Mall");
    // Read through the repo so floors come back ordered by `order`
    // (raw index iteration order is arbitrary - it follows the uuid PK).
    const floors = await floorRepo.listByProject(projects[0].id);
    expect(floors.map((f) => f.status)).toEqual(["mapping", "completed"]);
    const features = await getDbFeatures(projects[0].id);
    expect(features[0].name).toBe("Main corridor");
    expect(features[0].geometry).toEqual(corridor.geometry);
  });
});

describe("backup import rejection (PRD 30)", () => {
  it("rejects invalid JSON in plain language", async () => {
    await expect(importProjectBackup("{not json")).rejects.toThrow(ImportRejectedError);
  });

  it("rejects files that are not Walk & Plot backups", async () => {
    await expect(importProjectBackup(JSON.stringify({ hello: "world" }))).rejects.toThrow(
      /not a Walk & Plot backup/,
    );
  });

  it("rejects backups from a newer schema version", async () => {
    await expect(
      importProjectBackup(
        JSON.stringify({
          app: "walk-and-plot",
          kind: "project-backup",
          schemaVersion: 999,
          project: {},
        }),
      ),
    ).rejects.toThrow(/newer version/);
  });

  it("rejects damaged backups without writing anything", async () => {
    freshDb();
    await expect(
      importProjectBackup(
        JSON.stringify({
          app: "walk-and-plot",
          kind: "project-backup",
          schemaVersion: 1,
          exportedAt: new Date().toISOString(),
          project: { id: "not-a-uuid" },
        }),
      ),
    ).rejects.toThrow(ImportRejectedError);
    expect((await projectRepo.list()).length).toBe(0);
  });
});

describe("duplicate import (PRD 30: never merge-overwrite)", () => {
  it("imports a second copy with remapped ids, original untouched", async () => {
    freshDb();
    const { project } = await projectRepo.create({ name: "Original" });
    await featureRepo.create({
      id: crypto.randomUUID(),
      projectId: project.id,
      floorId: (await floorRepo.listByProject(project.id))[0].id,
      type: "path",
      subtype: "corridor",
      geometry: {
        type: "LineString",
        coordinates: [
          [0, 0],
          [1, 1],
        ],
      },
      access: "public",
      status: "active",
      confidence: "high",
    });
    const backup = await exportProjectBackup(project.id);

    const copyId = await importProjectBackup(backup.json);
    expect(copyId).not.toBe(project.id);

    const projects = await projectRepo.list();
    expect(projects).toHaveLength(2);
    const original = projects.find((p) => p.id === project.id);
    expect(original?.name).toBe("Original");
    expect((await getDbFeatures(project.id)).length).toBe(1);
    expect((await getDbFeatures(copyId)).length).toBe(1);
    // Distinct feature ids across copies.
    expect((await getDbFeatures(project.id))[0].id).not.toBe((await getDbFeatures(copyId))[0].id);
  });
});

async function getDbFloors(projectId: string) {
  const { getDb } = await import("@/lib/db/db");
  return getDb().floors.where("projectId").equals(projectId).toArray();
}
async function getDbFeatures(projectId: string) {
  const { getDb } = await import("@/lib/db/db");
  return getDb().features.where("projectId").equals(projectId).toArray();
}
