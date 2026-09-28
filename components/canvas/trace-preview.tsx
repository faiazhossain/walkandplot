"use client";

import { Circle, Group, Label, Line, Tag, Text } from "react-konva";
import { formatLength, type FloorScale } from "@/lib/domain/units";
import { dist, type Point } from "@/lib/domain/geometry";

// The in-progress trace: committed corners, the live segment under the
// finger, the snapping ring, and length labels (PRD 13/15). Screen-constant
// sizes are produced by dividing by the stage scale.

export interface TracePreviewProps {
  draft: Point[];
  /** Snapped/constrained pointer position; null on touch before release. */
  cursor: Point | null;
  snapPoint: Point | null;
  snapKind: "endpoint" | "segment" | "grid" | null;
  scale: FloorScale;
  viewport: { scale: number };
  canFinish: boolean;
}

const TRACE_COLOR = "#4f46e5";

export function TracePreview({
  draft,
  cursor,
  snapPoint,
  snapKind,
  scale,
  viewport,
  canFinish,
}: TracePreviewProps) {
  const s = viewport.scale;
  const px = 1 / s;

  const toFlat = (pts: Point[]) => pts.flatMap((p) => [p.x * s, p.y * s]);
  const first = draft[0];

  return (
    <Group listening={false}>
      {/* Committed corners + live segment */}
      {draft.length > 1 && (
        <Line points={toFlat(draft)} stroke={TRACE_COLOR} strokeWidth={2.5 * px} lineJoin="round" />
      )}
      {cursor && draft.length > 0 && (
        <Line
          points={toFlat([draft[draft.length - 1], cursor])}
          stroke={TRACE_COLOR}
          strokeWidth={2 * px}
          dash={[6 * px, 4 * px]}
        />
      )}

      {/* Corner dots */}
      {draft.map((p, i) => (
        <Circle key={i} x={p.x * s} y={p.y * s} radius={4.5 * px} fill={TRACE_COLOR} />
      ))}

      {/* First point: tap it again to finish (PRD 15) */}
      {first && draft.length > 1 && (
        <Circle
          x={first.x * s}
          y={first.y * s}
          radius={(canFinish ? 11 : 8) * px}
          stroke={canFinish ? "#15803d" : TRACE_COLOR}
          strokeWidth={2.5 * px}
        />
      )}

      {/* Snap indicator: ring + kind, never color alone (PRD 13, 35) */}
      {snapPoint && (
        <>
          <Circle
            x={snapPoint.x * s}
            y={snapPoint.y * s}
            radius={13 * px}
            stroke={snapKind === "endpoint" ? "#15803d" : "#b45309"}
            strokeWidth={2.5 * px}
            dash={snapKind === "segment" ? [5 * px, 4 * px] : undefined}
          />
          <Label x={snapPoint.x * s + 16 * px} y={snapPoint.y * s - 26 * px} opacity={0.95}>
            <Tag fill="#18181b" cornerRadius={4} />
            <Text
              text={
                snapKind === "endpoint" ? "corner" : snapKind === "segment" ? "connect" : "grid"
              }
              fill="#fafafa"
              fontSize={11 * px}
              padding={3 * px}
            />
          </Label>
        </>
      )}

      {/* Live length label under the finger (PRD 13) */}
      {cursor && draft.length > 0 && (
        <LengthLabel from={draft[draft.length - 1]} to={cursor} scale={scale} viewport={viewport} />
      )}

      {/* Per-segment labels while tracing */}
      {draft.length > 1 &&
        draft
          .slice(0, -1)
          .map((p, i) => (
            <LengthLabel key={i} from={p} to={draft[i + 1]} scale={scale} viewport={viewport} />
          ))}

      {/* Close-the-loop hint when hovering the first point */}
      {cursor && first && draft.length > 1 && dist(cursor, first) * s < 20 && (
        <Label x={cursor.x * s + 12 * px} y={cursor.y * s - 30 * px} opacity={0.95}>
          <Tag fill="#15803d" cornerRadius={4} />
          <Text text="release to finish" fill="#f0fdf4" fontSize={11 * px} padding={3 * px} />
        </Label>
      )}
    </Group>
  );
}

function LengthLabel({
  from,
  to,
  scale,
  viewport,
}: {
  from: Point;
  to: Point;
  scale: FloorScale;
  viewport: { scale: number };
}) {
  const s = viewport.scale;
  const px = 1 / s;
  const mx = ((from.x + to.x) / 2) * s;
  const my = ((from.y + to.y) / 2) * s;
  const text = formatLength(dist(from, to), scale);
  return (
    <Label x={mx} y={my - 14 * px} opacity={0.92} listening={false}>
      <Tag fill="#fafafa" cornerRadius={4 * px} stroke="#d4d4d8" strokeWidth={px} />
      <Text text={text} fill="#18181b" fontSize={11 * px} padding={3 * px} />
    </Label>
  );
}
