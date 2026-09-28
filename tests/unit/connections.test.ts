import { describe, expect, it } from "vitest";
import { nearestPathFeature, placeAnchor, splitLineString } from "@/lib/domain/connections";
import type { Feature } from "@/lib/domain/schema";

// PRD 18: junction splitting and door-adjacency math, in Node (PRD 37).

const line = (pts: [number, number][]): {
  type: "LineString";
  coordinates: [number, number][];
} => ({ type: "LineString", coordinates: pts });

function makeFeature(partial: Partial<Feature> & { id: string; geometry: Feature["geometry"] }): Feature {
  return {
    projectId: "p1",
    floorId: "f1",
    type: "place",
    subtype: "shop",
    access: "public",
    status: "active",
    confidence: "high",
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  } as Feature;
}

describe("splitLineString (PRD 18 junction splitting)", () => {
  it("splits into two segments sharing the exact junction node", () => {
    const geometry = line([
      [0, 0],
      [10, 0],
      [10, 10],
    ]);
    const { left, right } = splitLineString(geometry, 0, { x: 4, y: 0 });
    expect(left.coordinates).toEqual([
      [0, 0],
      [4, 0],
    ]);
    expect(right.coordinates).toEqual([
      [4, 0],
      [10, 0],
      [10, 10],
    ]);
    // Shared node: last of left equals first of right.
    expect(left.coordinates[left.coordinates.length - 1]).toEqual(right.coordinates[0]);
  });

  it("clamps out-of-range segment indices", () => {
    const geometry = line([
      [0, 0],
      [2, 0],
    ]);
    const { left, right } = splitLineString(geometry, 99, { x: 1, y: 0 });
    expect(left.coordinates.length).toBe(2);
    expect(right.coordinates.length).toBe(2);
  });
});

describe("placeAnchor", () => {
  it("is the point itself for points, centroid for rings", () => {
    const p = makeFeature({ id: "a", geometry: { type: "Point", coordinates: [3, 7] } });
    expect(placeAnchor(p)).toEqual({ x: 3, y: 7 });
    const poly = makeFeature({
      id: "b",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [4, 0],
            [0, 4],
          ] as [number, number][],
        ],
      },
    });
    const anchor = placeAnchor(poly);
    expect(anchor.x).toBeCloseTo(4 / 3);
    expect(anchor.y).toBeCloseTo(4 / 3);
  });
});

describe("nearestPathFeature (PRD 18 doors)", () => {
  const pathA = makeFeature({
    id: "pathA",
    type: "path",
    subtype: "corridor",
    name: "Main corridor",
    geometry: line([
      [0, 0],
      [10, 0],
    ]),
  });
  const pathB = makeFeature({
    id: "pathB",
    type: "path",
    subtype: "corridor",
    name: "Side corridor",
    geometry: line([
      [0, 1],
      [10, 1],
    ]),
  });

  it("finds the nearest path within the threshold", () => {
    const shop = makeFeature({ id: "shop", geometry: { type: "Point", coordinates: [5, 0.4] } });
    const nearest = nearestPathFeature(shop, [pathA, pathB], 3);
    expect(nearest?.featureId).toBe("pathA");
    expect(nearest?.name).toBe("Main corridor");
    expect(nearest?.point).toEqual({ x: 5, y: 0 });
  });

  it("returns null beyond the threshold", () => {
    const shop = makeFeature({ id: "shop", geometry: { type: "Point", coordinates: [5, 9] } });
    expect(nearestPathFeature(shop, [pathA, pathB], 3)).toBeNull();
  });

  it("ignores non-LineString entries and the place itself", () => {
    const shop = makeFeature({ id: "shop", geometry: { type: "Point", coordinates: [5, 0.4] } });
    expect(nearestPathFeature(shop, [shop, pathA], 3)?.featureId).toBe("pathA");
  });
});
