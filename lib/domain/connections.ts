import { dist, nearestOnSegment, type Point } from "@/lib/domain/geometry";
import type { Feature, LineGeometry } from "@/lib/domain/schema";

// PRD 18: connections and junctions. Pure math - no React, no browser APIs.

/**
 * Splits a line at `point` (assumed to lie on segment `segmentIndex`) into
 * two linked segments: the left keeps the original vertex order up to the
 * junction, the right continues from it. Both include the junction point so
 * the graph shares an exact node.
 */
export function splitLineString(
  geometry: LineGeometry,
  segmentIndex: number,
  point: Point,
): { left: LineGeometry; right: LineGeometry } {
  const vs = geometry.coordinates.map((c) => ({ x: c[0], y: c[1] }));
  const i = Math.max(0, Math.min(segmentIndex, vs.length - 2));
  const left = [...vs.slice(0, i + 1), point];
  const right = [point, ...vs.slice(i + 1)];
  const toCoords = (pts: Point[]): [number, number][] => pts.map((p) => [p.x, p.y]);
  return {
    left: { type: "LineString", coordinates: toCoords(left) },
    right: { type: "LineString", coordinates: toCoords(right) },
  };
}

/** Anchor used for link rendering and door-distance checks. */
export function placeAnchor(feature: Feature): Point {
  const g = feature.geometry;
  if (g.type === "Point") return { x: g.coordinates[0], y: g.coordinates[1] };
  const ring = g.type === "LineString" ? g.coordinates : g.coordinates[0];
  let x = 0;
  let y = 0;
  for (const c of ring) {
    x += c[0];
    y += c[1];
  }
  return { x: x / ring.length, y: y / ring.length };
}

export interface NearestPath {
  featureId: string;
  name?: string;
  distance: number;
  /** Closest point on the path - one end of the dotted door link. */
  point: Point;
}

/**
 * PRD 18 doors: the nearest path within a threshold of a place. Distance is
 * measured from every path segment to the place's anchor (center for
 * polygons), which is honest enough for adjacency in local floor units.
 */
export function nearestPathFeature(
  place: Feature,
  paths: Feature[],
  threshold: number,
): NearestPath | null {
  const anchor = placeAnchor(place);
  let best: NearestPath | null = null;
  for (const path of paths) {
    if (path.id === place.id || path.geometry.type !== "LineString") continue;
    const vs = path.geometry.coordinates.map((c) => ({ x: c[0], y: c[1] }));
    for (let i = 0; i < vs.length - 1; i++) {
      const { point } = nearestOnSegment(anchor, vs[i], vs[i + 1]);
      const d = dist(anchor, point);
      if (d <= threshold && (!best || d < best.distance)) {
        best = { featureId: path.id, name: path.name, distance: d, point };
      }
    }
  }
  return best;
}
