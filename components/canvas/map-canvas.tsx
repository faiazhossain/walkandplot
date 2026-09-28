"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

export type { Viewport };
import { TracePreview } from "@/components/canvas/trace-preview";
import { ConnectionsLayer } from "@/components/canvas/connections-layer";
import { useBasemap } from "@/components/canvas/basemap";
import {
  DEFAULT_ANCHOR,
  localToLngLat,
  lngLatToLocal,
  scaleToZoom,
  zoomToScale,
  type GeoAnchor,
} from "@/lib/domain/geo";
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
  /** Basemap center, for the align-origin action (null when basemap off). */
  getMapCenter: () => { lng: number; lat: number } | null;
}

export interface MapCanvasProps {
  features: Feature[];
  connections: import("@/lib/domain/schema").Connection[];
  floorScale: FloorScale;
  /** Optional reference basemap under the canvas (local origin -> anchor). */
  basemapAnchor: GeoAnchor | null;
  /** PRD 31: restored camera for this floor; used once instead of auto-fit. */
  initialViewport?: Viewport | null;
  /** Camera reporting so the workspace can persist it per floor (PRD 31). */
  onViewportChange?: (viewport: Viewport) => void;
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
  connections,
  floorScale,
  basemapAnchor,
  initialViewport,
  onViewportChange,
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
  const featuresById = useMemo(() => new Map(features.map((f) => [f.id, f])), [features]);

  // Basemap sync: canvas -> map on viewport change; map -> canvas when the
  // user moves the map. Echoes of our own pushes are recognized by value.
  const basemapDivRef = useRef<HTMLDivElement>(null);
  const anchor = basemapAnchor ?? DEFAULT_ANCHOR;
  const basemapRef = useBasemap(basemapDivRef, basemapAnchor !== null, anchor, () => {
    if (!basemapAnchor) return;
    const bridge = basemapRef.current;
    const center = bridge?.getCenter();
    const zoom = bridge?.getZoom();
    if (!center || zoom === undefined) return;
    const pushed = lastPushed.current;
    if (
      pushed &&
      Math.abs(pushed.lng - center.lng) < 1e-7 &&
      Math.abs(pushed.lat - center.lat) < 1e-7 &&
      Math.abs(pushed.zoom - zoom) < 1e-4
    ) {
      return; // our own echo
    }
    const local = lngLatToLocal(basemapAnchor, center);
    const scale = zoomToScale(basemapAnchor, zoom);
    setViewport((v) => ({
      scale,
      x: size.width / 2 - local.x * scale,
      y: size.height / 2 - local.y * scale,
    }));
  });
  const lastPushed = useRef<{ lng: number; lat: number; zoom: number } | null>(null);

  useEffect(() => {
    if (!basemapAnchor) return;
    const bridge = basemapRef.current;
    if (!bridge) return;
    const center = screenToWorld(viewport, { x: size.width / 2, y: size.height / 2 });
    const ll = localToLngLat(basemapAnchor, center);
    const zoom = scaleToZoom(basemapAnchor, viewport.scale);
    lastPushed.current = { lng: ll.lng, lat: ll.lat, zoom };
    bridge.setView(ll.lng, ll.lat, zoom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport, basemapAnchor, size.width, size.height, basemapRef.current !== null]);

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

  const savedViewportRef = useRef<Viewport | null>(initialViewport ?? null);
  useEffect(() => {
    if (!didFit.current && size.width > 0 && size.height > 0) {
      const saved = savedViewportRef.current;
      // PRD 31: restore this floor's camera when present; fit otherwise.
      setViewport(
        saved && Number.isFinite(saved.scale) && saved.scale > 0
          ? saved
          : fitViewport(features, size.width, size.height),
      );
      didFit.current = true;
    }
    // Fit exactly once, on the first measured size. Deliberately not keyed on
    // `features`: new plots must not yank the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size]);

  const onViewportChangeRef = useRef(onViewportChange);
  useEffect(() => {
    onViewportChangeRef.current = onViewportChange;
  }, [onViewportChange]);
  useEffect(() => {
    onViewportChangeRef.current?.(viewport);
  }, [viewport]);

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
      getMapCenter: () => (basemapAnchor ? (basemapRef.current?.getCenter() ?? null) : null),
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
      <div
        ref={basemapDivRef}
        aria-hidden
        className="absolute inset-0 z-0 bg-muted"
        style={{ display: basemapAnchor ? "block" : "none" }}
      />
      <div className="relative z-10 h-full w-full">
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
        {!basemapAnchor && (
          <Layer listening={false}>
            <GridLayer viewport={viewport} width={size.width} height={size.height} theme={theme} />
          </Layer>
        )}
        <Layer listening={false}>
          <ConnectionsLayer
            connections={connections}
            featuresById={featuresById}
            viewport={viewport}
            theme={theme}
          />
        </Layer>
        <Layer>
          <FeaturesLayer
            features={features}
            viewport={viewport}
            theme={theme}
            captureActive={captureActive}
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
    </div>
  );
}
