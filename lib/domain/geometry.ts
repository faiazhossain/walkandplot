// Pure geometry over local floor coordinates (PRD 23). No React, no browser
// APIs - fully unit-testable in Node (PRD 26 lib/domain rule).

export interface Point {
  x: number;
  y: number;
}

export function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function pathLength(vs: Point[]): number {
  let sum = 0;
  for (let i = 1; i < vs.length; i++) {
    sum += dist(vs[i - 1], vs[i]);
  }
  return sum;
}

export function pointSegmentDistance(p: Point, a: Point, b: Point): number {
  return dist(p, nearestOnSegment(p, a, b).point);
}

// Closest point on the closed segment ab, with the interpolation factor so
// callers can tell endpoints from the middle (junction snapping, PRD 18).
export function nearestOnSegment(p: Point, a: Point, b: Point): { point: Point; t: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return { point: a, t: 0 };
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return { point: { x: a.x + t * dx, y: a.y + t * dy }, t };
}

// Ray casting; used by duplicate-area checks and canvas hit tests.
export function pointInPolygon(p: Point, vs: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i].x;
    const yi = vs[i].y;
    const xj = vs[j].x;
    const yj = vs[j].y;
    const intersects = yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}
