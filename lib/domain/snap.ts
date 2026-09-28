import { dist, nearestOnSegment, type Point } from "@/lib/domain/geometry";

// PRD 13 snapping: grid adapts to zoom, existing corners and path endpoints
// snap with the strongest priority and a larger magnet, and snapping onto a
// segment records a junction connection later (PRD 18). Priority is always
// endpoint > segment > grid.

export interface EndpointCandidate {
  featureId: string;
  vertexIndex: number;
  point: Point;
}

export interface SegmentCandidate {
  featureId: string;
  /** Index of the segment's start vertex within the feature's vertex list. */
  segmentIndex: number;
  a: Point;
  b: Point;
}

export type SnapResult =
  | { kind: "endpoint"; point: Point; featureId: string; vertexIndex: number }
  | { kind: "segment"; point: Point; featureId: string; segmentIndex: number }
  | { kind: "grid"; point: Point }
  | null;

export interface SnapOptions {
  raw: Point;
  endpoints?: EndpointCandidate[];
  segments?: SegmentCandidate[];
  /** World-units spacing of the current adaptive grid; null disables grid. */
  gridStep: number | null;
  /** Magnet radius in world units (screen radius / zoom). */
  radius: number;
  /** Larger radius for endpoints (PRD 13: strongest priority, larger magnet). */
  endpointRadius?: number;
}

export function findSnap({
  raw,
  endpoints = [],
  segments = [],
  gridStep,
  radius,
  endpointRadius,
}: SnapOptions): SnapResult {
  const er = endpointRadius ?? radius;

  let bestEndpoint: { d: number; c: EndpointCandidate } | null = null;
  for (const c of endpoints) {
    const d = dist(raw, c.point);
    if (d <= er && (!bestEndpoint || d < bestEndpoint.d)) bestEndpoint = { d, c };
  }
  if (bestEndpoint) {
    return {
      kind: "endpoint",
      point: bestEndpoint.c.point,
      featureId: bestEndpoint.c.featureId,
      vertexIndex: bestEndpoint.c.vertexIndex,
    };
  }

  let bestSegment: { d: number; c: SegmentCandidate; point: Point } | null = null;
  for (const c of segments) {
    const { point } = nearestOnSegment(raw, c.a, c.b);
    const d = dist(raw, point);
    if (d <= radius && (!bestSegment || d < bestSegment.d)) {
      bestSegment = { d, c, point };
    }
  }
  if (bestSegment) {
    return {
      kind: "segment",
      point: bestSegment.point,
      featureId: bestSegment.c.featureId,
      segmentIndex: bestSegment.c.segmentIndex,
    };
  }

  if (gridStep && gridStep > 0) {
    const gx = Math.round(raw.x / gridStep) * gridStep;
    const gy = Math.round(raw.y / gridStep) * gridStep;
    const p = { x: gx, y: gy };
    // Grid only wins when its lattice point is inside the magnet; otherwise
    // the tap lands exactly where the finger was (P3 - what you draw is what
    // you get).
    if (dist(raw, p) <= radius) return { kind: "grid", point: p };
  }

  return null;
}

// PRD 13 right-angle lock: constrain the next segment to 0/45/90 degrees
// relative to the previous one, at the raw pointer's distance from `from`.
export function constrainToAngle(from: Point, raw: Point): Point {
  const dx = raw.x - from.x;
  const dy = raw.y - from.y;
  const angle = Math.atan2(dy, dx);
  const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
  const len = Math.hypot(dx, dy);
  return { x: from.x + len * Math.cos(snapped), y: from.y + len * Math.sin(snapped) };
}
