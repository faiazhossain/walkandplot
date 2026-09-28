"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Layer, Stage } from "react-konva";
import type Konva from "konva";
import {
  FeaturesLayer,
  GridLayer,
  clampScale,
  fitViewport,
  screenToWorld,
  useCanvasTheme,
  type Viewport,
} from "@/components/canvas/canvas-layers";
import { TracePreview } from "@/components/canvas/trace-preview";
import type { Point } from "@/lib/domain/geometry";
import type { SnapResult } from "@/lib/domain/snap";
import type { Feature } from "@/lib/domain/schema";
import type { FloorScale } from "@/lib/domain/units";

// PRD 12/13: full-screen canvas behind everything. Gesture model:
//   one finger, no capture tool  -> pan (tap selects)
//   one finger, capture tool     -> tap draws (tap = down+up without drag)
//   two fingers                  -> pinch zoom + pan, always
//   double tap / double click    -> reset zoom
//   wheel (desktop)              -> zoom at cursor
// Rendering stays in floor coordinates; the viewport transform owns zoom/pan.

const TAP_SLOP_PX = 8;
const DOUBLE_TAP_MS = 300;

export interface CanvasControls {
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
}

export interface MapCanvasProps {
  features: Feature[];
  floorScale: FloorScale;
  /** Capture tool active: one finger taps draw instead of panning. */
  captureActive: boolean;
  draft: Point[];
  cursor: Point | null;
  snap: SnapResult | null;
  canFinishByTap: boolean;
  selectedId: string | null;
  onTapWorld: (point: Point) => void;
  onCursorMove: (world: Point | null) => void;
  onSelect: (id: string | null) => void;
  onMoveVertex: (featureId: string, vertexIndex: number, point: Point) => void;
  onAddVertex: (featureId: string, segmentIndex: number, point: Point) => void;
  onRemoveVertex: (featureId: string, vertexIndex: number) => void;
  /** Parent reads zoom controls from this ref once the stage is live. */
  controlsRef: React.MutableRefObject<CanvasControls | null>;
  /** Reports zoom so magnet radii and grid spacing track it. */
  onScaleChange?: (scale: number) => void;
}

interface ActivePointer {
  id: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
}

export function MapCanvas({
  features,
  floorScale,
  captureActive,
  draft,
  cursor,
  snap,
  canFinishByTap,
  selectedId,
  onTapWorld,
  onCursorMove,
  onSelect,
  onMoveVertex,
  onAddVertex,
  onRemoveVertex,
  controlsRef,
  onScaleChange,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, scale: 48 });
  const didFit = useRef(false);

  const pointers = useRef(new Map<number, ActivePointer>());
  const pinchStart = useRef<{ dist: number; viewport: Viewport; mid: Point } | null>(null);
  const panned = useRef(false);
  const lastTap = useRef<{ time: number; x: number; y: number } | null>(null);
  const stateRef = useRef({ viewport, captureActive });
  useEffect(() => {
    stateRef.current = { viewport, captureActive };
  }, [viewport, captureActive]);

  const theme = useCanvasTheme();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      setSize({ width: rect.width, height: rect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!didFit.current && size.width > 0 && size.height > 0) {
      setViewport(fitViewport(features, size.width, size.height));
      didFit.current = true;
    }
    // Fit exactly once, on the first measured size. Deliberately not keyed on
    // `features`: new plots must not yank the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size]);

  const fit = useCallback(() => {
    if (size.width > 0 && size.height > 0) setViewport(fitViewport(features, size.width, size.height));
  }, [features, size]);

  const zoomAt = useCallback((screenX: number, screenY: number, factor: number) => {
    setViewport((v) => {
      const scale = clampScale(v.scale * factor);
      const world = screenToWorld(v, { x: screenX, y: screenY });
      return { scale, x: screenX - world.x * scale, y: screenY - world.y * scale };
    });
  }, []);

  useEffect(() => {
    onScaleChange?.(viewport.scale);
  }, [viewport.scale, onScaleChange]);

  useEffect(() => {
    controlsRef.current = {
      zoomIn: () => {
        const st = stageRef.current;
        if (st) zoomAt(st.width() / 2, st.height() / 2, 1.25);
      },
      zoomOut: () => {
        const st = stageRef.current;
        if (st) zoomAt(st.width() / 2, st.height() / 2, 0.8);
      },
      fit,
    };
    return () => {
      controlsRef.current = null;
    };
  }, [controlsRef, zoomAt, fit]);

  function localPos(): Point | null {
    const pos = stageRef.current?.getPointerPosition();
    return pos ? { x: pos.x, y: pos.y } : null;
  }

  function handlePointerDown(e: Konva.KonvaEventObject<PointerEvent>) {
    const pos = localPos();
    if (!pos) return;
    // Dragging a selection handle is Konva's job; pan must not fight it and
    // the lift must not count as a tap.
    if (e.target.name() === "handle") return;
    pointers.current.set(e.evt.pointerId, {
      id: e.evt.pointerId,
      startX: pos.x,
      startY: pos.y,
      lastX: pos.x,
      lastY: pos.y,
    });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchStart.current = {
        dist: Math.max(1, Math.hypot(a.lastX - b.lastX, a.lastY - b.lastY)),
        viewport: stateRef.current.viewport,
        mid: { x: (a.lastX + b.lastX) / 2, y: (a.lastY + b.lastY) / 2 },
      };
    }
    if (pointers.current.size === 1) panned.current = false;
  }

  function handlePointerMove(e: Konva.KonvaEventObject<PointerEvent>) {
    const pos = localPos();
    if (!pos) return;
    const active = pointers.current.get(e.evt.pointerId);

    // Two fingers: pinch zoom and pan together (PRD 13). The world point
    // under the gesture-start midpoint stays under the live midpoint.
    if (pointers.current.size >= 2 && pinchStart.current && active) {
      if (active) {
        active.lastX = pos.x;
        active.lastY = pos.y;
      }
      const [a, b] = [...pointers.current.values()];
      const mid = { x: (a.lastX + b.lastX) / 2, y: (a.lastY + b.lastY) / 2 };
      const start = pinchStart.current;
      const scale = clampScale(
        start.viewport.scale *
          (Math.max(1, Math.hypot(a.lastX - b.lastX, a.lastY - b.lastY)) / start.dist),
      );
      const world0 = screenToWorld(start.viewport, start.mid);
      setViewport({ scale, x: mid.x - world0.x * scale, y: mid.y - world0.y * scale });
      panned.current = true;
      return;
    }

    // One finger, capture off: pan.
    if (active && pointers.current.size === 1 && !stateRef.current.captureActive) {
      const dx = pos.x - active.lastX;
      const dy = pos.y - active.lastY;
      active.lastX = pos.x;
      active.lastY = pos.y;
      if (dx !== 0 || dy !== 0) {
        setViewport((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
      }
      if (Math.hypot(pos.x - active.startX, pos.y - active.startY) > TAP_SLOP_PX) {
        panned.current = true;
      }
    }

    // Live cursor for the trace preview (desktop hover, or finger during tap).
    if (stateRef.current.captureActive) {
      onCursorMove(screenToWorld(stateRef.current.viewport, pos));
    }
  }

  function handlePointerUp(e: Konva.KonvaEventObject<PointerEvent>) {
    const active = pointers.current.get(e.evt.pointerId);
    pointers.current.delete(e.evt.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
    if (!active) return;

    const pos = localPos();
    const moved = pos ? Math.hypot(pos.x - active.startX, pos.y - active.startY) : 0;
    // Another finger is still down: this lift is part of a gesture, not a tap.
    if (moved > TAP_SLOP_PX || panned.current || pointers.current.size > 0 || !pos) return;

    const now = performance.now();
    const isDoubleTap =
      lastTap.current !== null &&
      now - lastTap.current.time < DOUBLE_TAP_MS &&
      Math.hypot(pos.x - lastTap.current.x, pos.y - lastTap.current.y) < TAP_SLOP_PX * 2;
    lastTap.current = { time: now, x: pos.x, y: pos.y };

    if (isDoubleTap) {
      fit();
      onCursorMove(null);
      return;
    }

    const world = screenToWorld(stateRef.current.viewport, pos);
    if (stateRef.current.captureActive) {
      onTapWorld(world);
    } else {
      // Select tool: only clear when the tap is on empty canvas; feature
      // shapes run their own tap handlers for selection.
      const stage = stageRef.current;
      const intersection = stage ? stage.getIntersection(pos) : null;
      let hitFeature: string | undefined;
      let node: Konva.Node | null = intersection;
      while (node && !hitFeature) {
        hitFeature = node.getAttr("featureId");
        node = node.getParent();
      }
      if (!hitFeature) {
        onTapWorld(world);
        onSelect(null);
      }
    }
  }

  function handleWheel(e: Konva.KonvaEventObject<WheelEvent>) {
    e.evt.preventDefault();
    const pos = localPos();
    if (!pos) return;
    zoomAt(pos.x, pos.y, e.evt.deltaY > 0 ? 0.9 : 1.1);
  }

  return (
    <div ref={containerRef} className="absolute inset-0" style={{ touchAction: "none" }}>
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        x={viewport.x}
        y={viewport.y}
        scaleX={viewport.scale}
        scaleY={viewport.scale}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
      >
        <Layer listening={false}>
          <GridLayer viewport={viewport} width={size.width} height={size.height} theme={theme} />
        </Layer>
        <Layer>
          <FeaturesLayer
            features={features}
            viewport={viewport}
            theme={theme}
            selectedId={selectedId}
            onSelect={(id) => {
              if (!captureActive) onSelect(id);
            }}
            onMoveVertex={onMoveVertex}
            onAddVertex={onAddVertex}
            onRemoveVertex={onRemoveVertex}
          />
          {draft.length > 0 && (
            <TracePreview
              draft={draft}
              cursor={cursor}
              snapPoint={snap?.point ?? null}
              snapKind={snap?.kind ?? null}
              scale={floorScale}
              viewport={viewport}
              canFinish={canFinishByTap}
            />
          )}
        </Layer>
      </Stage>
    </div>
  );
}
