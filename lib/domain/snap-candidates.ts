import type { Point } from "@/lib/domain/geometry";
import type { EndpointCandidate, SegmentCandidate } from "@/lib/domain/snap";
import type { Feature } from "@/lib/domain/schema";

// Builds the snapping universe from the floor's saved features (PRD 13):
// every corner and every segment of every feature is a candidate.

export interface SnapUniverse {
  endpoints: EndpointCandidate[];
  segments: SegmentCandidate[];
}

export function buildSnapUniverse(features: Feature[], excludeFeatureId?: string): SnapUniverse {
  const endpoints: EndpointCandidate[] = [];
  const segments: SegmentCandidate[] = [];

  for (const feature of features) {
    if (feature.id === excludeFeatureId) continue;
    const g = feature.geometry;
    if (g.type === "Point") {
      endpoints.push({
        featureId: feature.id,
        vertexIndex: 0,
        point: { x: g.coordinates[0], y: g.coordinates[1] },
      });
      continue;
    }
    let vs: Point[];
    let closed: boolean;
    if (g.type === "LineString") {
      vs = g.coordinates.map((c) => ({ x: c[0], y: c[1] }));
      closed = false;
    } else {
      vs = g.coordinates[0].map((c) => ({ x: c[0], y: c[1] }));
      closed = true;
    }
    vs.forEach((p, i) => endpoints.push({ featureId: feature.id, vertexIndex: i, point: p }));
    const segmentCount = closed ? vs.length : vs.length - 1;
    for (let i = 0; i < segmentCount; i++) {
      const a = vs[i];
      const b = vs[(i + 1) % vs.length];
      segments.push({ featureId: feature.id, segmentIndex: i, a, b });
    }
  }

  return { endpoints, segments };
}
