import { describe, expect, it } from "vitest";
import {
  buildFloorGeoJSON,
  buildProjectGeoJSON,
  exportFilename,
  ExportValidationError,
} from "@/lib/geojson/export";
import type { Connection, Feature, Floor, Project } from "@/lib/domain/schema";

// PRD 22/37: golden fixtures for the primary output. Deterministic ids and
// timestamps; coordinate honesty asserted explicitly (no WGS84 lies).

const NOW = Date.parse("2026-09-28T10:00:00.000Z");

const project: Project = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "ABC Shopping Mall",
  status: "active",
  createdAt: NOW - 1_000,
  updatedAt: NOW - 500,
};

const ground: Floor = {
  id: "22222222-2222-4222-8222-222222222222",
  projectId: project.id,
  displayName: "Ground",
  order: 0,
  status: "completed",
  scale: { calibrated: true, metersPerUnit: 1 },
  createdAt: NOW - 900,
  updatedAt: NOW - 400,
};

const floor1: Floor = {
  ...ground,
  id: "33333333-3333-4333-8333-333333333333",
  displayName: "Floor 3",
  order: 3,
};

const pathA: Feature = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  projectId: project.id,
  floorId: ground.id,
  type: "path",
  subtype: "corridor",
  name: "Main corridor",
  geometry: {
    type: "LineString",
    coordinates: [
      [0, 0],
      [12.5, 0],
    ],
  },
  access: "public",
  status: "active",
  confidence: "high",
  createdAt: NOW - 800,
  updatedAt: NOW - 300,
};

// Junction split: the right half of Main corridor (PRD 18).
const pathARight: Feature = {
  ...pathA,
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  name: undefined,
  geometry: {
    type: "LineString",
    coordinates: [
      [6.25, 0],
      [12.5, 0],
    ],
  },
  createdAt: NOW - 300,
  updatedAt: NOW - 300,
};

const shop: Feature = {
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  projectId: project.id,
  floorId: ground.id,
  type: "place",
  subtype: "shop",
  name: "ABC Fashion",
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [0, 0],
        [4.2, 0],
        [4.2, 3.1],
      ],
    ],
  },
  access: "public",
  status: "active",
  confidence: "high",
  props: { shopNumber: "304" },
  createdAt: NOW - 700,
  updatedAt: NOW - 200,
};

const stairs: Feature = {
  id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  projectId: project.id,
  floorId: ground.id,
  type: "place",
  subtype: "stairs",
  geometry: { type: "Point", coordinates: [6.25, 0] },
  access: "public",
  status: "active",
  confidence: "high",
  props: { direction: "up", fromFloor: ground.id, toFloor: floor1.id },
  connectorGroupId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  createdAt: NOW - 600,
  updatedAt: NOW - 100,
};

const stairsTwin: Feature = {
  ...stairs,
  id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
  floorId: floor1.id,
  props: { direction: "up", fromFloor: floor1.id, toFloor: ground.id },
  createdAt: NOW - 600,
  updatedAt: NOW - 100,
};

const doorConnection: Connection = {
  id: "12345678-1234-4123-8123-123456789012",
  projectId: project.id,
  fromFeatureId: shop.id,
  toFeatureId: pathA.id,
  kind: "door",
  createdAt: NOW - 250,
};

const junctionConnection: Connection = {
  ...doorConnection,
  id: "23456789-2345-4234-8234-234567890123",
  fromFeatureId: pathARight.id,
  toFeatureId: pathA.id,
  kind: "path",
  createdAt: NOW - 300,
};

describe("floor export (PRD 22 golden)", () => {
  const collection = buildFloorGeoJSON({
    project,
    floor: ground,
    features: [pathA, pathARight, shop, stairs],
    connections: [doorConnection, junctionConnection],
    now: NOW,
  });

  it("matches the PRD 22 envelope exactly", () => {
    expect(collection.properties).toEqual({
      app: "walk-and-plot",
      schemaVersion: 2,
      project: "ABC Shopping Mall",
      projectId: project.id,
      exportedAt: "2026-09-28T10:00:00.000Z",
      floors: [{ floorId: ground.id, displayName: "Ground", order: 0 }],
      coordinateSystem: {
        type: "local",
        unit: "meters",
        origin: "first-plotted-point-per-floor",
        calibrated: true,
      },
    });
  });

  it("exports the shop as a closed-ring Polygon with its number", () => {
    const exported = collection.features.find((f) => f.id === shop.id);
    expect(exported?.geometry).toEqual({
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [4.2, 0],
          [4.2, 3.1],
          [0, 0],
        ],
      ],
    });
    expect(exported?.properties).toMatchObject({
      type: "place",
      subtype: "shop",
      name: "ABC Fashion",
      shopNumber: "304",
      floorName: "Ground",
      access: "public",
      status: "active",
      confidence: "high",
      connections: [pathA.id],
      photoCount: 0,
      createdAt: "2026-09-28T09:59:59.300Z",
    });
  });

  it("carries junction graph and vertical connector metadata (AC-08)", () => {
    const right = collection.features.find((f) => f.id === pathARight.id);
    expect(right?.properties.connections).toEqual(expect.arrayContaining([pathA.id]));
    const stairsExported = collection.features.find((f) => f.id === stairs.id);
    expect(stairsExported?.properties).toMatchObject({
      direction: "up",
      fromFloor: ground.id,
      toFloor: floor1.id,
      connectorGroupId: stairs.connectorGroupId,
    });
  });

  it("parses with standard GeoJSON tooling shape (AC-09)", () => {
    const round = JSON.parse(JSON.stringify(collection));
    expect(round.type).toBe("FeatureCollection");
    for (const f of round.features) {
      expect(["Point", "LineString", "Polygon"]).toContain(f.geometry.type);
    }
  });
});

describe("project export (PRD 22)", () => {
  it("includes both floors and both connector copies (same connectorGroupId)", () => {
    const collection = buildProjectGeoJSON({
      project,
      floors: [floor1, ground],
      features: [stairs, stairsTwin, pathA],
      connections: [],
      now: NOW,
    });
    expect(collection.properties.floors).toEqual([
      { floorId: ground.id, displayName: "Ground", order: 0 },
      { floorId: floor1.id, displayName: "Floor 3", order: 3 },
    ]);
    const twins = collection.features.filter(
      (f) => f.properties.connectorGroupId === stairs.connectorGroupId,
    );
    expect(twins).toHaveLength(2);
  });

  it("declares honest units for uncalibrated and mixed floors (AC-03)", () => {
    const uncalibrated: Floor = { ...ground, scale: null };
    const only = buildFloorGeoJSON({
      project,
      floor: uncalibrated,
      features: [pathA],
      connections: [],
      now: NOW,
    });
    expect(only.properties.coordinateSystem).toMatchObject({ unit: "units", calibrated: false });

    const mixed = buildProjectGeoJSON({
      project,
      floors: [ground, uncalibrated],
      features: [pathA],
      connections: [],
      now: NOW,
    });
    expect(mixed.properties.coordinateSystem).toMatchObject({ unit: "mixed", calibrated: false });
  });
});

describe("export refusal (PRD 22 validation)", () => {
  it("refuses a polygon that cannot close into a valid ring", () => {
    const broken: Feature = {
      ...shop,
      geometry: { type: "Polygon", coordinates: [] },
    };
    expect(() =>
      buildFloorGeoJSON({ project, floor: ground, features: [broken], connections: [], now: NOW }),
    ).toThrow(ExportValidationError);
  });
});

describe("exportFilename (PRD 22)", () => {
  it("qualifies floor exports with the project name", () => {
    expect(exportFilename("ABC Shopping Mall")).toBe("ABC-Shopping-Mall.geojson");
    expect(exportFilename("ABC Shopping Mall", "Floor 3")).toBe("ABC-Shopping-Mall-Floor-3.geojson");
    expect(exportFilename("___")).toBe("project.geojson");
  });
});
