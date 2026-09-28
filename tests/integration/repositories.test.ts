import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { projectSchema } from "@/lib/domain/schema";
import { WalkAndPlotDB, getDb, setDb } from "@/lib/db/db";
import { ValidationError, featureRepo, floorRepo, projectRepo } from "@/lib/db/repositories";

// PRD 37 integration layer: repositories against real Dexie semantics via
// fake-indexeddb. Each test gets a fresh, isolated database.
function freshDb(): WalkAndPlotDB {
  const db = new WalkAndPlotDB(`test-${crypto.randomUUID()}`);
  setDb(db);
  return db;
}

const point = {
  type: "Point" as const,
  coordinates: [2.5, 17.2] as [number, number],
};

describe("projectRepo", () => {
  it("creates a project with its first floor atomically", async () => {
    const db = freshDb();
    const { project, floor } = await projectRepo.create({
      name: "ABC Shopping Mall",
      firstFloorName: "Ground",
    });
    expect(project.name).toBe("ABC Shopping Mall");
    expect(floor.displayName).toBe("Ground");
    // both records actually persisted
    expect((await db.projects.get(project.id))?.name).toBe("ABC Shopping Mall");
    expect((await db.floors.get(floor.id))?.order).toBe(0);
  });

  it("lists projects newest-first", async () => {
    freshDb();
    await projectRepo.create({ name: "First" });
    await new Promise((r) => setTimeout(r, 5));
    await projectRepo.create({ name: "Second" });
    const list = await projectRepo.list();
    expect(list.map((p) => p.name)).toEqual(["Second", "First"]);
  });

  it("deleting a project removes its floors and features", async () => {
    freshDb();
    const { project, floor } = await projectRepo.create({ name: "Doomed" });
    await featureRepo.create({
      id: crypto.randomUUID(),
      projectId: project.id,
      floorId: floor.id,
      type: "place",
      subtype: "shop",
      geometry: point,
      access: "public",
      status: "active",
      confidence: "high",
    });
    await projectRepo.remove(project.id);
    expect(await dbProjectCount()).toBe(0);
    expect(await getDb().floors.count()).toBe(0);
    expect(await getDb().features.count()).toBe(0);
  });
});

async function dbProjectCount(): Promise<number> {
  return getDb().projects.count();
}

describe("floorRepo", () => {
  it("creates floors with increasing order and lists sorted (PRD 11)", async () => {
    freshDb();
    const { project } = await projectRepo.create({ name: "Mall" });
    await floorRepo.create({ projectId: project.id, displayName: "Floor 1" });
    await floorRepo.create({ projectId: project.id, displayName: "Floor 2" });
    const floors = await floorRepo.listByProject(project.id);
    expect(floors.map((f) => f.displayName)).toEqual(["Ground", "Floor 1", "Floor 2"]);
    expect(floors.map((f) => f.order)).toEqual([0, 1, 2]);
  });

  it("calibration rescales features and marks the floor (AC-03)", async () => {
    freshDb();
    const { project, floor } = await projectRepo.create({ name: "Mall" });
    const feature = await featureRepo.create({
      id: crypto.randomUUID(),
      projectId: project.id,
      floorId: floor.id,
      type: "place",
      subtype: "entrance",
      geometry: { type: "Point", coordinates: [4, 8] },
      access: "public",
      status: "active",
      confidence: "high",
    });
    // traced line was 2 units, the real wall is 12.5 m -> multiplier 6.25
    await floorRepo.applyCalibration(floor.id, 2, 12.5);
    const saved = await featureRepo.listByFloor(floor.id);
    expect(saved[0].geometry.coordinates).toEqual([25, 50]);
    expect(saved[0].id).toBe(feature.id);
    const calibrated = await floorRepo.get(floor.id);
    expect(calibrated?.scale).toEqual({ calibrated: true, metersPerUnit: 1 });
  });
});

describe("featureRepo", () => {
  it("rejects a 2-corner polygon at the schema level (AC-04)", async () => {
    freshDb();
    const { project, floor } = await projectRepo.create({ name: "Mall" });
    await expect(
      featureRepo.create({
        id: crypto.randomUUID(),
        projectId: project.id,
        floorId: floor.id,
        type: "place",
        subtype: "shop",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [0, 0],
              [4, 0],
            ],
          ],
        },
        access: "public",
        status: "active",
        confidence: "high",
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("round-trips a feature through schema validation", async () => {
    freshDb();
    const { project, floor } = await projectRepo.create({ name: "Mall" });
    const created = await featureRepo.create({
      id: crypto.randomUUID(),
      projectId: project.id,
      floorId: floor.id,
      type: "path",
      subtype: "corridor",
      geometry: {
        type: "LineString",
        coordinates: [
          [0, 0],
          [0, 6.5],
        ],
      },
      access: "public",
      status: "active",
      confidence: "high",
    });
    const updated = await featureRepo.update(created.id, { name: "Main corridor" });
    expect(updated?.name).toBe("Main corridor");
    expect(updated?.updatedAt).toBeGreaterThanOrEqual(created.updatedAt);
    // the stored record validates against the domain schema
    expect(projectSchema.safeParse(await getProject(project.id)).success).toBe(true);
  });
});

async function getProject(id: string) {
  const p = await getDb().projects.get(id);
  if (!p) throw new Error("project missing");
  return p;
}
