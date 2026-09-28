import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { WalkAndPlotDB, getDb, setDb } from "@/lib/db/db";
import { featureRepo, floorRepo, projectRepo } from "@/lib/db/repositories";
import { connectionRepo } from "@/lib/db/connection-repo";
import { connectorRepo } from "@/lib/db/connector-repo";
import { nearestPathFeature } from "@/lib/domain/connections";

// PRD 18 integration: junction splitting writes atomically with connection
// records; vertical connectors create cross-floor twins sharing
// connectorGroupId; door links ride the same graph.

function freshDb(): WalkAndPlotDB {
  const db = new WalkAndPlotDB(`test-${crypto.randomUUID()}`);
  setDb(db);
  return db;
}

const line = (pts: [number, number][]): { type: "LineString"; coordinates: [number, number][] } => ({
  type: "LineString",
  coordinates: pts,
});

async function seedTwoPaths() {
  freshDb();
  const { project } = await projectRepo.create({ name: "Mall" });
  const floorId = (await floorRepo.listByProject(project.id))[0].id;
  const pathA = await featureRepo.create({
    id: crypto.randomUUID(),
    projectId: project.id,
    floorId,
    type: "path",
    subtype: "corridor",
    name: "Main corridor",
    geometry: line([
      [0, 0],
      [10, 0],
    ]),
    access: "public",
    status: "active",
    confidence: "high",
  });
  const pathB = await featureRepo.create({
    id: crypto.randomUUID(),
    projectId: project.id,
    floorId,
    type: "path",
    subtype: "corridor",
    name: "Entrance corridor",
    geometry: line([
      [4, 8],
      [4, 0.001],
    ]),
    access: "public",
    status: "active",
    confidence: "high",
  });
  return { project, floorId, pathA, pathB };
}

describe("junction splitting (PRD 18)", () => {
  it("splits the target into two linked segments plus source connections", async () => {
    const { pathA, pathB } = await seedTwoPaths();
    const result = await featureRepo.splitPathAtPoint(pathA.id, { x: 4, y: 0 }, pathB.id);
    expect(result).toBeDefined();

    const features = await getDb().features.where("floorId").equals((await floorRepo.listByProject((await projectRepo.list())[0].id))[0].id).toArray();
    const lines = features.filter((f) => f.geometry.type === "LineString");
    // pathA + pathB + the new right segment.
    expect(lines).toHaveLength(3);

    const right = result!.right;
    expect(right.geometry.coordinates[0]).toEqual([4, 0]);
    const updatedA = await featureRepo.get(pathA.id);
    expect(updatedA?.geometry.coordinates).toEqual([
      [0, 0],
      [4, 0],
    ]);

    // Graph: A<->right, source<->A, source<->right - all kind "path".
    const conns = await getDb().connections.toArray();
    expect(conns).toHaveLength(3);
    const ids = new Set([pathA.id, pathB.id, right.id]);
    for (const c of conns) {
      expect(c.kind).toBe("path");
      expect(ids.has(c.fromFeatureId)).toBe(true);
      expect(ids.has(c.toFeatureId)).toBe(true);
    }
  });

  it("returns undefined for non-line targets", async () => {
    const { pathA } = await seedTwoPaths();
    await expect(featureRepo.splitPathAtPoint(pathA.id, { x: 0, y: 0 })).resolves.toBeDefined();
    const point = await featureRepo.create({
      id: crypto.randomUUID(),
      projectId: (await projectRepo.list())[0].id,
      floorId: (await floorRepo.listByProject((await projectRepo.list())[0].id))[0].id,
      type: "place",
      subtype: "toilet",
      geometry: { type: "Point", coordinates: [1, 1] },
      access: "public",
      status: "active",
      confidence: "high",
    });
    await expect(featureRepo.splitPathAtPoint(point.id, { x: 1, y: 1 })).resolves.toBeUndefined();
  });

  it("undo removes the right segment and restores the original geometry", async () => {
    const { pathA } = await seedTwoPaths();
    const before = (await featureRepo.get(pathA.id))!.geometry;
    const { right } = (await featureRepo.splitPathAtPoint(pathA.id, { x: 6, y: 0 }, undefined))!;

    // Simulate history undo (workspace closure semantics).
    await featureRepo.remove(right.id);
    await featureRepo.update(pathA.id, { geometry: before });

    expect(await featureRepo.get(right.id)).toBeUndefined();
    expect((await featureRepo.get(pathA.id))?.geometry).toEqual(before);
    expect(await getDb().connections.toArray()).toHaveLength(0);
  });
});

describe("vertical connectors (PRD 18)", () => {
  it("links floors with a twin point sharing connectorGroupId", async () => {
    freshDb();
    const { project } = await projectRepo.create({ name: "Mall" });
    const ground = (await floorRepo.listByProject(project.id))[0];
    const floor1 = await floorRepo.create({ projectId: project.id, displayName: "Floor 1" });
    const stairs = await featureRepo.create({
      id: crypto.randomUUID(),
      projectId: project.id,
      floorId: ground.id,
      type: "place",
      subtype: "stairs",
      geometry: { type: "Point", coordinates: [2, 2] },
      access: "public",
      status: "active",
      confidence: "high",
    });

    const result = await connectorRepo.linkFloors({
      feature: stairs,
      direction: "up",
      targetFloorId: floor1.id,
    });

    const updated = await featureRepo.get(stairs.id);
    expect(updated?.props).toMatchObject({ direction: "up", fromFloor: ground.id, toFloor: floor1.id });
    expect(updated?.connectorGroupId).toBeTruthy();
    expect(result.twin.connectorGroupId).toBe(updated?.connectorGroupId);
    expect(result.twin.floorId).toBe(floor1.id);
    expect(result.twin.geometry).toEqual(stairs.geometry);

    const conns = await getDb().connections.toArray();
    expect(conns).toHaveLength(1);
    expect(conns[0].kind).toBe("stair");
    expect(new Set([conns[0].fromFeatureId, conns[0].toFeatureId])).toEqual(
      new Set([stairs.id, result.twin.id]),
    );
  });

  it("forward-declares a new floor by name (PRD 18)", async () => {
    freshDb();
    const { project } = await projectRepo.create({ name: "Mall" });
    const ground = (await floorRepo.listByProject(project.id))[0];
    const lift = await featureRepo.create({
      id: crypto.randomUUID(),
      projectId: project.id,
      floorId: ground.id,
      type: "place",
      subtype: "lift",
      geometry: { type: "Point", coordinates: [1, 1] },
      access: "public",
      status: "active",
      confidence: "high",
    });

    const result = await connectorRepo.linkFloors({
      feature: lift,
      direction: "both",
      newFloorName: "Floor 4",
    });
    expect(result.floorName).toBe("Floor 4");
    const floors = await floorRepo.listByProject(project.id);
    expect(floors.map((f) => f.displayName)).toEqual(["Ground", "Floor 4"]);
  });

  it("refuses self-links and non-point connectors", async () => {
    freshDb();
    const { project } = await projectRepo.create({ name: "Mall" });
    const ground = (await floorRepo.listByProject(project.id))[0];
    const stairs = await featureRepo.create({
      id: crypto.randomUUID(),
      projectId: project.id,
      floorId: ground.id,
      type: "place",
      subtype: "stairs",
      geometry: { type: "Point", coordinates: [0, 0] },
      access: "public",
      status: "active",
      confidence: "high",
    });
    await expect(
      connectorRepo.linkFloors({ feature: stairs, direction: "up", targetFloorId: ground.id }),
    ).rejects.toThrow(/itself/);

    const corridor = await featureRepo.create({
      id: crypto.randomUUID(),
      projectId: project.id,
      floorId: ground.id,
      type: "path",
      subtype: "corridor",
      geometry: line([
        [0, 0],
        [1, 0],
      ]),
      access: "public",
      status: "active",
      confidence: "high",
    });
    const other = await floorRepo.create({ projectId: project.id, displayName: "1" });
    await expect(
      connectorRepo.linkFloors({ feature: corridor, direction: "up", targetFloorId: other.id }),
    ).rejects.toThrow(/point/);
  });

  it("unlink removes the twin and connection, clears the link fields", async () => {
    freshDb();
    const { project } = await projectRepo.create({ name: "Mall" });
    const ground = (await floorRepo.listByProject(project.id))[0];
    const floor1 = await floorRepo.create({ projectId: project.id, displayName: "1" });
    const escalator = await featureRepo.create({
      id: crypto.randomUUID(),
      projectId: project.id,
      floorId: ground.id,
      type: "place",
      subtype: "escalator",
      geometry: { type: "Point", coordinates: [3, 3] },
      access: "public",
      status: "active",
      confidence: "high",
    });
    const { twin } = await connectorRepo.linkFloors({
      feature: escalator,
      direction: "up",
      targetFloorId: floor1.id,
    });

    await connectorRepo.unlink(escalator);
    expect(await featureRepo.get(twin.id)).toBeUndefined();
    expect(await getDb().connections.toArray()).toHaveLength(0);
    const cleared = await featureRepo.get(escalator.id);
    expect(cleared?.connectorGroupId).toBeUndefined();
    expect(cleared?.props?.toFloor).toBeUndefined();
  });
});

describe("door connections (PRD 18)", () => {
  it("auto-adjacency finds the corridor and the record lands in the graph", async () => {
    const { project, floorId, pathA } = await seedTwoPaths();
    const shop = await featureRepo.create({
      id: crypto.randomUUID(),
      projectId: project.id,
      floorId,
      type: "place",
      subtype: "shop",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [6, 0],
            [8, 0],
            [8, -2],
            [6, -2],
          ] as [number, number][],
        ],
      },
      access: "public",
      status: "active",
      confidence: "high",
    });

    const paths = [await featureRepo.get(pathA.id!), await featureRepo.get((await getDb().features.get(shop.id))!.id)];
    const nearest = nearestPathFeature(shop, paths.filter((p): p is NonNullable<typeof p> => !!p), 3);
    expect(nearest?.featureId).toBe(pathA.id);

    const conn = await connectionRepo.create({
      projectId: project.id,
      fromFeatureId: shop.id,
      toFeatureId: nearest!.featureId,
      kind: "door",
    });
    expect((await connectionRepo.listByFeature(shop.id)).map((c) => c.id)).toContain(conn.id);

    // Deleting the shop cascades the door record (PRD 28 graph hygiene).
    await featureRepo.remove(shop.id);
    expect(await connectionRepo.listByFeature(shop.id)).toHaveLength(0);
  });
});
