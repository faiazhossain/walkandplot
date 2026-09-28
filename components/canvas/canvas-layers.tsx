"use client";

import { useEffect, useState } from "react";
import { Circle, Group, Line } from "react-konva";
import { gridStepForZoom } from "@/lib/domain/grid";
import type { Point } from "@/lib/domain/geometry";
import type { Feature } from "@/lib/domain/schema";

// Konva draws on canvas and cannot read CSS variables, so colors are resolved
// from the html theme class. The hook re-renders the layers when it flips.
export function useCanvasTheme() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const update = () => setDark(root.classList.contains("dark"));
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return dark
    ? {
        grid: "#3f3f46",
        gridMajor: "#52525b",
        path: "#818cf8",
        pathSelected: "#2dd4bf",
        fill: "rgba(129, 140, 248, 0.10)",
        fillSelected: "rgba(45, 212, 191, 0.14)",
        handleFill: "#27272a",
      }
    : {
        grid: "#d4d4d8",
        gridMajor: "#c4c4cd",
        path: "#4f46e5",
        pathSelected: "#0d9488",
        fill: "rgba(79, 70, 229, 0.08)",
        fillSelected: "rgba(13, 148, 136, 0.12)",
        handleFill: "#ffffff",
      };
}
export type CanvasTheme = ReturnType<typeof useCanvasTheme>;

// Canvas rendering pieces. Everything is drawn in floor coordinates (PRD 23);
// the stage transform owns zoom/pan, so screen size never leaks into data.

export interface Viewport {
  x: number;
  y: number;
  scale: number;
}

export function screenToWorld(v: Viewport, p: Point): Point {
  return { x: (p.x - v.x) / v.scale, y: (p.y - v.y) / v.scale };
}

export function worldToScreen(v: Viewport, p: Point): Point {
  return { x: p.x * v.scale + v.x, y: p.y * v.scale + v.y };
}

export const MIN_SCALE = 0.04;
export const MAX_SCALE = 200;

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/** Initial or reset view: fit every plotted point, or a sensible default. */
export function fitViewport(
  features: Pick<Feature, "geometry">[],
  width: number,
  height: number,
): Viewport {
  const coords: Point[] = [];
  for (const f of features) {
    const g = f.geometry;
    if (g.type === "Point") coords.push({ x: g.coordinates[0], y: g.coordinates[1] });
    else if (g.type === "LineString")
      for (const c of g.coordinates) coords.push({ x: c[0], y: c[1] });
    else for (const ring of g.coordinates) for (const c of ring) coords.push({ x: c[0], y: c[1] });
  }
  if (coords.length === 0) {
    // Default: origin at center, 1 unit ~ 48 screen px so the grid reads well.
    return { x: width / 2, y: height / 2, scale: 48 };
  }
  const xs = coords.map((c) => c.x);
  const ys = coords.map((c) => c.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const pad = Math.max(maxX - minX, maxY - minY) * 0.15 + 1;
  const scale = clampScale(
    Math.min(width / (maxX - minX + pad * 2), height / (maxY - minY + pad * 2)),
  );
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return { x: width / 2 - cx * scale, y: height / 2 - cy * scale, scale };
}

// ---------------------------------------------------------------- grid layer

export function GridLayer({
  viewport,
  width,
  height,
  theme,
}: {
  viewport: Viewport;
  width: number;
  height: number;
  theme: CanvasTheme;
}) {
  const step = gridStepForZoom(1 / viewport.scale);
  const startX = Math.floor(screenToWorld(viewport, { x: 0, y: 0 }).x / step) * step;
  const endX = screenToWorld(viewport, { x: width, y: 0 }).x;
  const startY = Math.floor(screenToWorld(viewport, { x: 0, y: 0 }).y / step) * step;
  const endY = screenToWorld(viewport, { x: 0, y: height }).y;

  const verticals: number[] = [];
  for (let wx = startX; wx <= endX; wx += step)
    verticals.push(worldToScreen(viewport, { x: wx, y: 0 }).x);
  const horizontals: number[] = [];
  for (let wy = startY; wy <= endY; wy += step)
    horizontals.push(worldToScreen(viewport, { x: 0, y: wy }).y);

  // Bail out if zooming out would draw thousands of lines.
  if (verticals.length + horizontals.length > 400) return null;

  const majorEvery = 5;
  const firstV = Math.round(startX / step);
  const firstH = Math.round(startY / step);

  return (
    <Group listening={false}>
      {verticals.map((sx, i) => (
        <Line
          key={`v${i}`}
          points={[sx, 0, sx, height]}
          stroke={(firstV + i) % majorEvery === 0 ? theme.gridMajor : theme.grid}
          strokeWidth={(firstV + i) % majorEvery === 0 ? 1.5 : 0.75}
          opacity={(firstV + i) % majorEvery === 0 ? 0.7 : 0.4}
          listening={false}
        />
      ))}
      {horizontals.map((sy, i) => (
        <Line
          key={`h${i}`}
          points={[0, sy, width, sy]}
          stroke={(firstH + i) % majorEvery === 0 ? theme.gridMajor : theme.grid}
          strokeWidth={(firstH + i) % majorEvery === 0 ? 1.5 : 0.75}
          opacity={(firstH + i) % majorEvery === 0 ? 0.7 : 0.4}
          listening={false}
        />
      ))}
    </Group>
  );
}

// ------------------------------------------------------------ features layer

function featureVertices(feature: Feature): Point[] {
  const g = feature.geometry;
  if (g.type === "Point") return [{ x: g.coordinates[0], y: g.coordinates[1] }];
  if (g.type === "LineString") return g.coordinates.map((c) => ({ x: c[0], y: c[1] }));
  return g.coordinates[0].map((c) => ({ x: c[0], y: c[1] }));
}

interface FeaturesLayerProps {
  features: Feature[];
  viewport: Viewport;
  theme: CanvasTheme;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onMoveVertex: (featureId: string, vertexIndex: number, point: Point) => void;
  onAddVertex: (featureId: string, segmentIndex: number, point: Point) => void;
  onRemoveVertex: (featureId: string, vertexIndex: number) => void;
}

export function FeaturesLayer({
  features,
  viewport,
  theme,
  selectedId,
  onSelect,
  onMoveVertex,
  onAddVertex,
  onRemoveVertex,
}: FeaturesLayerProps) {
  const s = viewport.scale;
  // Stroke widths are screen-constant: the stage scale multiplies whatever we
  // draw, so divide it out.
  const px = 1 / s;
  return (
    <Group>
      {features.map((feature) => {
        const vs = featureVertices(feature);
        const flat = vs.flatMap((p) => {
          const sp = worldToScreen(viewport, p);
          return [sp.x, sp.y];
        });
        const selected = feature.id === selectedId;
        const closed = feature.geometry.type === "Polygon";

        return (
          <Group key={feature.id} featureId={feature.id}>
            <Line
              points={flat}
              closed={closed}
              stroke={selected ? theme.pathSelected : theme.path}
              strokeWidth={(selected ? 3 : 2) * px}
              fill={closed && selected ? theme.fillSelected : closed ? theme.fill : undefined}
              hitStrokeWidth={14 * px}
              tension={0}
              lineCap="round"
              lineJoin="round"
              onTap={(e) => {
                e.cancelBubble = true;
                onSelect(feature.id);
              }}
              onClick={(e) => {
                e.cancelBubble = true;
                onSelect(feature.id);
              }}
            />
            {feature.geometry.type === "Point" && (
              <Circle
                x={flat[0]}
                y={flat[1]}
                radius={7 * px}
                fill={selected ? theme.pathSelected : theme.path}
                onTap={(e) => {
                  e.cancelBubble = true;
                  onSelect(feature.id);
                }}
                onClick={(e) => {
                  e.cancelBubble = true;
                  onSelect(feature.id);
                }}
              />
            )}
            {selected && vs.length > 1 && (
              <HandleGroup
                featureId={feature.id}
                vertices={vs}
                viewport={viewport}
                theme={theme}
                closed={!!closed}
                onMoveVertex={onMoveVertex}
                onAddVertex={onAddVertex}
                onRemoveVertex={onRemoveVertex}
              />
            )}
          </Group>
        );
      })}
    </Group>
  );
}

function HandleGroup({
  featureId,
  vertices,
  viewport,
  theme,
  closed,
  onMoveVertex,
  onAddVertex,
  onRemoveVertex,
}: {
  featureId: string;
  vertices: Point[];
  viewport: Viewport;
  theme: CanvasTheme;
  closed: boolean;
  onMoveVertex: (featureId: string, vertexIndex: number, point: Point) => void;
  onAddVertex: (featureId: string, segmentIndex: number, point: Point) => void;
  onRemoveVertex: (featureId: string, vertexIndex: number) => void;
}) {
  const s = viewport.scale;
  const handleR = 9 / s;

  return (
    <Group>
      {vertices.map((p, i) => {
        const sp = worldToScreen(viewport, p);
        return (
          <Circle
            key={`c${i}`}
            name="handle"
            x={sp.x}
            y={sp.y}
            radius={handleR}
            fill={theme.handleFill}
            stroke={theme.pathSelected}
            strokeWidth={2.5}
            draggable
            onDragEnd={(e) => {
              onMoveVertex(
                featureId,
                i,
                screenToWorld(viewport, { x: e.target.x(), y: e.target.y() }),
              );
            }}
            onDblClick={() => onRemoveVertex(featureId, i)}
            onDblTap={() => onRemoveVertex(featureId, i)}
          />
        );
      })}
      {(closed ? vertices.length : vertices.length - 1) > 0 &&
        Array.from({ length: closed ? vertices.length : vertices.length - 1 }, (_, i) => {
          const a = worldToScreen(viewport, vertices[i]);
          const b = worldToScreen(viewport, vertices[(i + 1) % vertices.length]);
          return (
            <Circle
              key={`m${i}`}
              name="handle"
              x={(a.x + b.x) / 2}
              y={(a.y + b.y) / 2}
              radius={handleR * 0.62}
              fill={theme.handleFill}
              stroke={theme.pathSelected}
              strokeWidth={1.5 / s}
              dash={[3 / s, 3 / s]}
              onTap={(e) => {
                e.cancelBubble = true;
                onAddVertex(
                  featureId,
                  i,
                  screenToWorld(viewport, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }),
                );
              }}
              onClick={(e) => {
                e.cancelBubble = true;
                onAddVertex(
                  featureId,
                  i,
                  screenToWorld(viewport, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }),
                );
              }}
            />
          );
        })}
    </Group>
  );
}
