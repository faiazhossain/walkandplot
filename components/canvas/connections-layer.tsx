"use client";

import { Group, Line } from "react-konva";
import type { Feature } from "@/lib/domain/schema";
import type { Connection } from "@/lib/domain/schema";
import { nearestPathFeature, placeAnchor } from "@/lib/domain/connections";
import type { Viewport, CanvasTheme } from "@/components/canvas/canvas-layers";

// PRD 18 doors: places adjacent to a path show a dashed link. Path-to-path
// connections render nothing (the lines already join); vertical connectors
// link across floors, so they never appear on a single-floor canvas.

export function ConnectionsLayer({
  connections,
  featuresById,
  viewport,
  theme,
}: {
  connections: Connection[];
  featuresById: Map<string, Feature>;
  viewport: Viewport;
  theme: CanvasTheme;
}) {
  const s = viewport.scale;
  const px = 1 / s;
  const links: { a: { x: number; y: number }; b: { x: number; y: number } }[] = [];

  for (const conn of connections) {
    if (conn.kind !== "door") continue;
    const a = featuresById.get(conn.fromFeatureId);
    const b = featuresById.get(conn.toFeatureId);
    if (!a || !b) continue;
    const place = a.geometry.type === "LineString" ? b : a;
    const path = a.geometry.type === "LineString" ? a : b;
    if (place.geometry.type === "LineString" || path.geometry.type !== "LineString") continue;
    const nearest = nearestPathFeature(place, [path], Number.POSITIVE_INFINITY);
    if (!nearest) continue;
    links.push({ a: placeAnchor(place), b: nearest.point });
  }

  if (!links.length) return null;

  return (
    <Group listening={false}>
      {links.map((l, i) => (
        <Line
          key={i}
          points={[l.a.x * s, l.a.y * s, l.b.x * s, l.b.y * s]}
          stroke={theme.gridMajor}
          strokeWidth={1.5 * px}
          dash={[4 * px, 4 * px]}
          opacity={0.9}
        />
      ))}
    </Group>
  );
}
