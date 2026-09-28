import { describe, expect, it } from "vitest";
import { dist, pathLength, pointInPolygon, pointSegmentDistance } from "@/lib/domain/geometry";

describe("geometry", () => {
  it("measures distance and path length", () => {
    expect(dist({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(
      pathLength([
        { x: 0, y: 0 },
        { x: 3, y: 0 },
        { x: 3, y: 4 },
      ]),
    ).toBe(7);
    expect(pathLength([{ x: 1, y: 1 }])).toBe(0);
  });

  it("measures point to segment distance", () => {
    expect(pointSegmentDistance({ x: 2, y: 1 }, { x: 0, y: 0 }, { x: 4, y: 0 })).toBe(1);
    // nearest point is the endpoint when the projection falls outside
    expect(pointSegmentDistance({ x: 5, y: 0 }, { x: 0, y: 0 }, { x: 4, y: 0 })).toBe(1);
  });

  it("detects points inside polygons", () => {
    const square = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
    ];
    expect(pointInPolygon({ x: 2, y: 2 }, square)).toBe(true);
    expect(pointInPolygon({ x: 5, y: 2 }, square)).toBe(false);
    // junction test from the prototype: endpoint landing mid-segment
    expect(pointInPolygon({ x: 9, y: 10.5 }, square)).toBe(false);
  });
});
