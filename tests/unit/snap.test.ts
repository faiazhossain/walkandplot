import { describe, expect, it } from "vitest";
import { constrainToAngle, findSnap } from "@/lib/domain/snap";
import { gridStepForZoom } from "@/lib/domain/grid";
import type { Point } from "@/lib/domain/geometry";

// PRD 13: endpoint > segment > grid priority, visible-before-release snapping.
// PRD 37: pure domain logic unit-tested in Node.

const eps = 1e-9;
function expectPoint(p: Point, x: number, y: number) {
  expect(Math.abs(p.x - x)).toBeLessThan(eps);
  expect(Math.abs(p.y - y)).toBeLessThan(eps);
}

describe("findSnap", () => {
  const endpoints = [
    { featureId: "f1", vertexIndex: 0, point: { x: 10, y: 10 } },
    { featureId: "f2", vertexIndex: 3, point: { x: 30, y: 30 } },
  ];
  const segments = [
    {
      featureId: "f1",
      segmentIndex: 0,
      a: { x: 0, y: 0 },
      b: { x: 20, y: 0 },
    },
  ];

  it("snaps to the nearest endpoint within its magnet radius", () => {
    const result = findSnap({ raw: { x: 10.8, y: 10.3 }, endpoints, segments, gridStep: 1, radius: 0.5, endpointRadius: 1.5 });
    expect(result?.kind).toBe("endpoint");
    if (result?.kind === "endpoint") {
      expect(result.featureId).toBe("f1");
      expect(result.vertexIndex).toBe(0);
      expectPoint(result.point, 10, 10);
    }
  });

  it("endpoint wins even when a segment is closer (PRD 13 priority)", () => {
    // Raw is 0.5 from the segment (y=0 line) and 1.4 from the endpoint.
    const result = findSnap({
      raw: { x: 10, y: 0.5 },
      endpoints: [{ featureId: "f1", vertexIndex: 0, point: { x: 10, y: 2 } }],
      segments,
      gridStep: 1,
      radius: 0.9,
      endpointRadius: 1.5,
    });
    expect(result?.kind).toBe("endpoint");
  });

  it("snaps onto a segment middle for junctions (PRD 18)", () => {
    const result = findSnap({ raw: { x: 7.4, y: 0.4 }, endpoints, segments, gridStep: 1, radius: 0.5, endpointRadius: 1 });
    expect(result?.kind).toBe("segment");
    if (result?.kind === "segment") {
      expect(result.featureId).toBe("f1");
      expectPoint(result.point, 7.4, 0);
    }
  });

  it("falls back to the grid lattice inside the magnet radius", () => {
    const result = findSnap({ raw: { x: 2.3, y: 3.9 }, endpoints: [], segments: [], gridStep: 1, radius: 0.5 });
    expect(result?.kind).toBe("grid");
    if (result?.kind === "grid") expectPoint(result.point, 2, 4);
  });

  it("returns null outside every radius: the tap lands where drawn (P3)", () => {
    // (2.5, 3.5) sits ~0.71 from every lattice point - outside the magnet.
    const result = findSnap({ raw: { x: 2.5, y: 3.5 }, endpoints, segments, gridStep: 1, radius: 0.5, endpointRadius: 1.5 });
    expect(result).toBeNull();
  });

  it("grid does not hijack when disabled", () => {
    const result = findSnap({ raw: { x: 2.3, y: 3.9 }, endpoints: [], segments: [], gridStep: null, radius: 0.5 });
    expect(result).toBeNull();
  });
});

describe("constrainToAngle (PRD 13 right-angle lock)", () => {
  it("keeps the raw distance but locks direction to 0/45/90", () => {
    // Distance is preserved; only the direction quantizes.
    const l1 = Math.hypot(3, 0.2);
    expectPoint(constrainToAngle({ x: 0, y: 0 }, { x: 3, y: 0.2 }), l1, 0);
    const l2 = Math.hypot(1, 1.4);
    expectPoint(constrainToAngle({ x: 0, y: 0 }, { x: 1, y: 1.4 }), l2 / Math.SQRT2, l2 / Math.SQRT2);
    const l3 = Math.hypot(-5, -1);
    expectPoint(constrainToAngle({ x: 0, y: 0 }, { x: -5, y: -1 }), -l3, 0);
    // 60 degrees is closer to 45 than 90.
    const l4 = Math.hypot(1, Math.sqrt(3));
    const p = constrainToAngle({ x: 0, y: 0 }, { x: 1, y: Math.sqrt(3) });
    expect(p.x).toBeCloseTo(l4 / Math.SQRT2, 6);
    expect(p.y).toBeCloseTo(l4 / Math.SQRT2, 6);
  });
});

describe("gridStepForZoom (PRD 13 adaptive density)", () => {
  it("keeps on-screen spacing in the legible band", () => {
    for (const worldPerPx of [0.002, 0.01, 0.02, 0.05, 0.2, 1, 4]) {
      const step = gridStepForZoom(worldPerPx);
      const px = step / worldPerPx;
      expect(px).toBeGreaterThanOrEqual(36);
      expect(px).toBeLessThan(96); // 1/2/5 progression keeps the first qualifying step under the max
    }
  });

  it("grows without bound for extreme zoom-out", () => {
    expect(gridStepForZoom(1000)).toBeGreaterThan(1000);
  });

  it("survives degenerate input", () => {
    expect(gridStepForZoom(0)).toBeGreaterThan(0);
    expect(gridStepForZoom(Number.NaN)).toBeGreaterThan(0);
  });
});
