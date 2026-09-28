import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { WalkAndPlotDB, getDb, setDb } from "@/lib/db/db";
import { featureRepo, floorRepo, projectRepo } from "@/lib/db/repositories";
import { metaRepo } from "@/lib/db/meta-repo";

// Phase 2 integration: floor CRUD semantics, project-touch bookkeeping, meta
// settings, and undo/redo restore behavior against real Dexie.

function freshDb(): WalkAndPlotDB {
  const db = new WalkAndPlotDB(`test-${crypto.randomUUID()}`);
  setDb(db);
  return db;
}

const line = (points: [number, number][]) => ({ type: "LineString" as const, coordinates: points });

async function seedFloorWithFeature() {
  const { project, floor } = await projectRepo.create({ name: "Mall" });
  const feature = await featureRepo.create({
    id: crypto.randomUUID(),
    projectId: project.id,
    floorId: floor.id,
    type: "path",
    subtype: "corridor",
    geometry: line([
      [0, 0],
      [0, 10],
    ]),
    access: "public",
    status: "active",
    confidence: "high",
  });
  return { project, floor, feature };
}

describe("floorRepo CRUD", () => {
  it("renames a floor and bumps the parent project's updatedAt", async () => {
    freshDb();
    const { project, floor } = await seedFloorWithFeature();
    const before = (await projectRepo.get(project.id))!.updatedAt;
    await new Promise((r) => setTimeout(r, 5));
    await floorRepo.rename(floor.id, "Mezzanine");
    expect((await floorRepo.get(floor.id))?.displayName).toBe("Mezzanine");
    expect((await projectRepo.get(project.id))!.updatedAt).toBeGreaterThan(before);
  });

  it("reorders by the order field, not list position (PRD 11)", async () => {
    freshDb();
    const { project } = await projectRepo.create({ name: "Mall" });
    const a = await floorRepo.create({ projectId: project.id, displayName: "A" });
    const b = await floorRepo.create({ projectId: project.id, displayName: "B" });
    const c = await floorRepo.create({ projectId: project.id, displayName: "C" });
    // Ground is not in the list: it keeps its relative position, trailing.
    await floorRepo.reorder([c.id, a.id, b.id]);
    const floors = await floorRepo.listByProject(project.id);
    expect(floors.map((f) => f.displayName)).toEqual(["C", "A", "B", "Ground"]);
    expect(floors.map((f) => f.order)).toEqual([0, 1, 2, 3]);
  });

  it("deleting a floor removes its features and their connections", async () => {
    freshDb();
    const { project, floor, feature } = await seedFloorWithFeature();
    const other = await floorRepo.create({ projectId: project.id, displayName: "Two" });
    const otherFeature = await featureRepo.create({
      id: crypto.randomUUID(),
      projectId: project.id,
      floorId: other.id,
      type: "path",
      subtype: "corridor",
      geometry: line([
        [1, 1],
        [2, 2],
      ]),
      access: "public",
      status: "active",
      confidence: "high",
    });
    const { connectionSchema } = await import("@/lib/domain/schema");
    const conn = {
      id: crypto.randomUUID(),
      projectId: project.id,
      fromFeatureId: feature.id,
      toFeatureId: otherFeature.id,
      kind: "path" as const,
      createdAt: Date.now(),
    };
    await getDb().connections.add(connectionSchema.parse(conn));

    await floorRepo.remove(floor.id);
    expect(await floorRepo.get(floor.id)).toBeUndefined();
    expect(await featureRepo.listByFloor(floor.id)).toHaveLength(0);
    expect((await getDb().connections.toArray()).map((c) => c.id)).not.toContain(conn.id);
    // The untouched floor survives with its feature.
    expect(await featureRepo.listByFloor(other.id)).toHaveLength(1);
  });
});

describe("featureRepo undo support", () => {
  it("restore re-inserts with the original id (undo of a delete)", async () => {
    freshDb();
    const { feature } = await seedFloorWithFeature();
    await featureRepo.remove(feature.id);
    expect(await getDb().features.get(feature.id)).toBeUndefined();
    await featureRepo.restore(feature);
    const restored = await getDb().features.get(feature.id);
    expect(restored?.subtype).toBe("corridor");
    expect(restored?.geometry).toEqual(feature.geometry);
    // Restore is idempotent (redo after undo).
    await expect(featureRepo.restore(feature)).resolves.toBeUndefined();
  });

  it("remove cleans dangling connection endpoints", async () => {
    freshDb();
    const { project, floor, feature } = await seedFloorWithFeature();
    const other = await featureRepo.create({
      id: crypto.randomUUID(),
      projectId: project.id,
      floorId: floor.id,
      type: "path",
      subtype: "corridor",
      geometry: line([
        [5, 5],
        [6, 6],
      ]),
      access: "public",
      status: "active",
      confidence: "high",
    });
    await getDb().connections.add({
      id: crypto.randomUUID(),
      projectId: project.id,
      fromFeatureId: feature.id,
      toFeatureId: other.id,
      kind: "path",
      createdAt: Date.now(),
    });
    await featureRepo.remove(feature.id);
    expect(await getDb().connections.toArray()).toHaveLength(0);
  });
});

describe("metaRepo settings", () => {
  it("defaults step length to 0.75 m and validates fallbacks", async () => {
    freshDb();
    expect(await metaRepo.getStepLengthM()).toBe(0.75);
    await metaRepo.setStepLengthM(0.62);
    expect(await metaRepo.getStepLengthM()).toBe(0.62);
    // Corrupt value in the table falls back to the default.
    await metaRepo.set("stepLengthM", -3);
    expect(await metaRepo.getStepLengthM()).toBe(0.75);
  });

  it("defaults theme to system and round-trips choices", async () => {
    freshDb();
    expect(await metaRepo.getTheme()).toBe("system");
    await metaRepo.setTheme("dark");
    expect(await metaRepo.getTheme()).toBe("dark");
    await metaRepo.setTheme("nonsense" as never);
    expect(await metaRepo.getTheme()).toBe("system");
  });

  it("tracks per-project backup timestamps and dismissal", async () => {
    freshDb();
    const { project } = await projectRepo.create({ name: "Mall" });
    expect(await metaRepo.getLastBackupAt(project.id)).toBeUndefined();
    await metaRepo.setLastBackupAt(project.id, 1234);
    expect(await metaRepo.getLastBackupAt(project.id)).toBe(1234);
    expect(await metaRepo.isBackupReminderDismissed(project.id)).toBe(false);
    await metaRepo.dismissBackupReminder(project.id);
    expect(await metaRepo.isBackupReminderDismissed(project.id)).toBe(true);
  });
});
