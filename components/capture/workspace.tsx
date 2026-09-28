"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowLeft,
  Check,
  Flag,
  Magnet,
  Map as MapIcon,
  Pencil,
  Plus,
  Redo2,
  Route,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
  Maximize,
} from "lucide-react";
import { MapCanvas, type CanvasControls } from "@/components/canvas/map-canvas";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { SaveIndicator } from "@/components/common/save-indicator";
import { EmptyState } from "@/components/common/empty-state";
import { featureRepo, floorRepo, projectRepo } from "@/lib/db/repositories";
import { newId } from "@/lib/db/id";
import { constrainToAngle, findSnap } from "@/lib/domain/snap";
import { buildSnapUniverse } from "@/lib/domain/snap-candidates";
import { dist, type Point } from "@/lib/domain/geometry";
import { gridStepForZoom } from "@/lib/domain/grid";
import type { Feature } from "@/lib/domain/schema";
import { runSave, useSaveStateStore } from "@/lib/store/save-state";
import { useHistoryStore, type HistoryEntry } from "@/lib/store/history";
import { useToolsStore } from "@/lib/store/tools";
import { useUndoToastStore } from "@/components/common/undo-toast";

// PRD 12/15/17: the mapping workspace at /projects/map?id=<floorId>.
// Autosave on every completed gesture, undo/redo for the session, snapping
// with visible indicators, and a one-finger draw / two-finger navigate model.

const SNAP_RADIUS_PX = 22;
const ENDPOINT_RADIUS_PX = 30;
const FINISH_TAP_PX = 26;

export function Workspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const floorId = searchParams.get("id");

  // undefined = loading; null = record missing (distinguishes the two).
  const floor = useLiveQuery(
    () => (floorId ? floorRepo.get(floorId).then((f) => f ?? null) : Promise.resolve(null)),
    [floorId],
  );
  const project = useLiveQuery(
    () => (floor ? projectRepo.get(floor.projectId).then((p) => p ?? null) : Promise.resolve(null)),
    [floor],
  );
  const featureQuery = useLiveQuery(
    () => (floorId ? featureRepo.listByFloor(floorId) : Promise.resolve([])),
    [floorId],
  );
  const features = useMemo(() => featureQuery ?? [], [featureQuery]);

  const tool = useToolsStore((s) => s.tool);
  const setTool = useToolsStore((s) => s.setTool);
  const snapping = useToolsStore((s) => s.snapping);
  const toggleSnapping = useToolsStore((s) => s.toggleSnapping);
  const angleLock = useToolsStore((s) => s.angleLock);
  const toggleAngleLock = useToolsStore((s) => s.toggleAngleLock);
  const hydrateTools = useToolsStore((s) => s.hydrate);

  const history = useHistoryStore();
  const saveStatus = useSaveStateStore((s) => s.status);
  const showUndoToast = useUndoToastStore((s) => s.show);

  const [draft, setDraft] = useState<Point[]>([]);
  const [rawCursor, setRawCursor] = useState<Point | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [inlineHint, setInlineHint] = useState<string | null>(null);
  const controlsRef = useRef<CanvasControls | null>(null);

  // Per-floor session reset using React's adjust-during-render pattern
  // (state that must not survive a floor change).
  const [lastFloorId, setLastFloorId] = useState(floorId);
  if (lastFloorId !== floorId) {
    setLastFloorId(floorId);
    setDraft([]);
    setSelectedId(null);
    setRawCursor(null);
  }

  useEffect(() => {
    // External stores: session tool prefs and the per-floor undo stack.
    hydrateTools();
    history.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floorId]);

  // PRD 25: capture tools are mobile-only; desktop edits with the Select tool.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1025px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const tracing = tool === "trace-path";
  const selected = features.find((f) => f.id === selectedId) ?? null;

  // ---------------------------------------------------------- point pipeline

  const snapUniverse = useMemo(() => buildSnapUniverse(features), [features]);

  const effectivePoint = useCallback(
    (
      raw: Point,
      opts: { excludeFeatureId?: string; from?: Point; angleLock: boolean; snapping: boolean },
    ) => {
      let constrained = raw;
      if (opts.angleLock && opts.from) constrained = constrainToAngle(opts.from, raw);
      if (!opts.snapping) return { point: constrained, snap: null };
      const radius = SNAP_RADIUS_PX / scaleRef.current;
      const snap = findSnap({
        raw: constrained,
        endpoints: snapUniverse.endpoints,
        segments: snapUniverse.segments,
        gridStep: gridStepRef.current,
        radius,
        endpointRadius: ENDPOINT_RADIUS_PX / scaleRef.current,
      });
      return { point: snap ? snap.point : constrained, snap };
    },
    [snapUniverse],
  );

  // The zoom scale lives inside MapCanvas; it reports back so magnet radii
  // and the adaptive grid track the current zoom.
  const scaleRef = useRef(48);
  const handleScaleChange = useCallback((scale: number) => {
    scaleRef.current = scale;
    gridStepRef.current = gridStepForZoom(1 / scale);
  }, []);
  const gridStepRef = useRef<number | null>(null);

  const computeCursor = useCallback(
    (raw: Point | null): { cursor: Point | null; snap: ReturnType<typeof findSnap> } => {
      if (!raw || !tracing || draft.length === 0) {
        return { cursor: raw, snap: null };
      }
      const from = draft[draft.length - 1];
      const result = effectivePoint(raw, { from, angleLock, snapping });
      return { cursor: result.point, snap: result.snap };
    },
    [draft, tracing, effectivePoint, angleLock, snapping],
  );

  const cursorState = computeCursor(rawCursor);

  // ------------------------------------------------------------- tap actions

  function handleTapWorld(world: Point) {
    setInlineHint(null);
    if (tracing) {
      // Tap the first point again (or Done) to finish (PRD 15).
      if (draft.length >= 2) {
        const firstScreenDist = dist(world, draft[0]) * scaleRef.current;
        if (firstScreenDist <= FINISH_TAP_PX) {
          commitDraft(draft);
          return;
        }
      }
      const { point } = effectivePoint(world, {
        from: draft.length > 0 ? draft[draft.length - 1] : undefined,
        angleLock,
        snapping,
      });
      // AC-04: points must be distinct - ignore a tap on the previous corner.
      const last = draft[draft.length - 1];
      if (last && dist(last, point) * scaleRef.current < 1) return;
      setDraft((d) => [...d, point]);
      return;
    }
    // Select tool: tap on empty space - selection clearing happens in canvas.
    setSelectedId(null);
  }

  function handleCursorMove(world: Point | null) {
    if (!tracing) {
      setRawCursor(null);
      return;
    }
    setRawCursor(world);
  }

  // ------------------------------------------------------------ data actions

  function commitDraft(points: Point[]) {
    if (!floorId || !floor || !project) return;
    if (points.length < 2) return;
    // AC-04: "2 distinct points" - a path of identical corners is not a path.
    const distinct = points.filter((p, i) => i === 0 || dist(p, points[i - 1]) > 1e-6);
    if (distinct.length < 2) {
      setInlineHint("A path needs at least 2 different points");
      return;
    }
    const now = Date.now();
    const feature: Feature = {
      id: newId(),
      projectId: project.id,
      floorId,
      type: "path",
      subtype: "corridor",
      geometry: { type: "LineString", coordinates: points.map((p) => [p.x, p.y]) },
      access: "public",
      status: "active",
      confidence: "high",
      createdAt: now,
      updatedAt: now,
    };
    // PRD 15: save immediately; the tool stays active for the next path.
    void runSave(async () => {
      await featureRepo.create(feature);
    });
    pushFeatureHistory("Add path", feature);
    setDraft([]);
    setRawCursor(null);
  }

  function pushFeatureHistory(label: string, feature: Feature) {
    const entry: HistoryEntry = {
      label,
      undo: async () => {
        await featureRepo.remove(feature.id);
      },
      redo: async () => {
        await featureRepo.restore(feature);
      },
    };
    history.push(entry);
  }

  function handleMoveVertex(featureId: string, vertexIndex: number, raw: Point) {
    const feature = features.find((f) => f.id === featureId);
    if (!feature) return;
    const { point } = effectivePoint(raw, {
      excludeFeatureId: featureId,
      angleLock: false,
      snapping,
    });
    const before = feature.geometry;
    const after = replaceVertex(before, vertexIndex, point);
    if (!after) return;
    void runSave(async () => {
      await featureRepo.update(featureId, { geometry: after });
    });
    history.push({
      label: "Move corner",
      undo: async () => {
        await featureRepo.update(featureId, { geometry: before });
      },
      redo: async () => {
        await featureRepo.update(featureId, { geometry: after });
      },
    });
  }

  function handleAddVertex(featureId: string, segmentIndex: number, raw: Point) {
    const feature = features.find((f) => f.id === featureId);
    if (!feature) return;
    const { point } = effectivePoint(raw, {
      excludeFeatureId: featureId,
      angleLock: false,
      snapping,
    });
    const before = feature.geometry;
    const after = insertVertex(before, segmentIndex + 1, point);
    if (!after) return;
    void runSave(async () => {
      await featureRepo.update(featureId, { geometry: after });
    });
    history.push({
      label: "Add corner",
      undo: async () => {
        await featureRepo.update(featureId, { geometry: before });
      },
      redo: async () => {
        await featureRepo.update(featureId, { geometry: after });
      },
    });
  }

  function handleRemoveVertex(featureId: string, vertexIndex: number) {
    const feature = features.find((f) => f.id === featureId);
    if (!feature) return;
    // AC-04: a path keeps at least 2 points, a ring at least 3 corners.
    const min = feature.geometry.type === "Polygon" ? 3 : 2;
    const before = feature.geometry;
    const after = removeVertex(before, vertexIndex);
    if (!after || countVertices(after) < min) {
      setInlineHint(
        `A ${feature.geometry.type === "Polygon" ? "shape needs at least 3 corners" : "path needs at least 2 points"}`,
      );
      return;
    }
    void runSave(async () => {
      await featureRepo.update(featureId, { geometry: after });
    });
    history.push({
      label: "Remove corner",
      undo: async () => {
        await featureRepo.update(featureId, { geometry: before });
      },
      redo: async () => {
        await featureRepo.update(featureId, { geometry: after });
      },
    });
  }

  function handleDeleteFeature() {
    if (!selected) return;
    const feature = selected;
    void runSave(async () => {
      await featureRepo.remove(feature.id);
    });
    const entry: HistoryEntry = {
      label: `Delete ${feature.name ?? feature.subtype}`,
      undo: async () => {
        await featureRepo.restore(feature);
      },
      redo: async () => {
        await featureRepo.remove(feature.id);
      },
    };
    history.push(entry);
    setSelectedId(null);
    // PRD 17: undo toast, no confirmation dialog. Toast-undo restores the
    // feature and drops the delete from the stack so a later appbar undo
    // cannot re-delete the restored feature.
    showUndoToast(`Deleted ${feature.name ?? "shape"}`, async () => {
      await runSave(async () => {
        await featureRepo.restore(feature);
      });
      history.dropEntry(entry);
    });
  }

  // ------------------------------------------------------------------ render

  if (!floorId || floor === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading floor...</p>
      </div>
    );
  }
  if (project === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading floor...</p>
      </div>
    );
  }
  if (floor === null || project === null) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <EmptyState
          icon={MapIcon}
          title="Floor not found"
          body="It may have been deleted on this device."
          action={
            <Button
              render={<Link href="/">Back to projects</Link>}
              className="h-12 rounded-lg px-6 text-base"
            >
              Back to projects
            </Button>
          }
        />
      </main>
    );
  }

  const canFinish = draft.length >= 2;
  const selectedLabel = selected ? (selected.name ?? "Unnamed") : null;

  return (
    <main className="fixed inset-0 flex flex-col bg-background" aria-live="polite">
      <MapCanvas
        features={features}
        floorScale={floor.scale}
        captureActive={tracing && !isDesktop}
        draft={tracing ? draft : []}
        cursor={cursorState.cursor}
        snap={cursorState.snap}
        canFinishByTap={canFinish}
        selectedId={selectedId}
        onTapWorld={handleTapWorld}
        onCursorMove={handleCursorMove}
        onSelect={setSelectedId}
        onMoveVertex={handleMoveVertex}
        onAddVertex={handleAddVertex}
        onRemoveVertex={handleRemoveVertex}
        controlsRef={controlsRef}
        onScaleChange={handleScaleChange}
      />

      {/* Top bar overlays the canvas */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 pt-[env(safe-area-inset-top)]">
        <div className="pointer-events-auto flex h-14 items-center gap-1 bg-background/90 px-2 backdrop-blur">
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label="Back to project"
            onClick={() => router.push(`/projects/view?id=${floor.projectId}`)}
          >
            <ArrowLeft className="size-5" aria-hidden />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-heading text-base leading-tight font-semibold">
              {floor.displayName}
            </h1>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="truncate">{project.name}</span>
              <SaveIndicator />
            </div>
          </div>
          <span
            aria-label={floor.scale?.calibrated ? "Calibrated, meters" : "Not calibrated, units"}
            className="rounded-full border px-2 py-0.5 text-[11px] font-semibold text-muted-foreground"
          >
            {floor.scale?.calibrated ? "m" : "units"}
          </span>
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label="Undo"
            disabled={history.past.length === 0}
            onClick={() => void history.undo()}
          >
            <Undo2 className="size-5" aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label="Redo"
            disabled={history.future.length === 0}
            onClick={() => void history.redo()}
          >
            <Redo2 className="size-5" aria-hidden />
          </Button>
        </div>
      </div>

      {/* Floating zoom controls */}
      <div className="absolute top-20 right-2 z-20 flex flex-col gap-2">
        <Button
          variant="outline"
          size="icon-lg"
          aria-label="Zoom in"
          className="rounded-full bg-background/90 shadow"
          onClick={() => controlsRef.current?.zoomIn()}
        >
          <ZoomIn className="size-5" aria-hidden />
        </Button>
        <Button
          variant="outline"
          size="icon-lg"
          aria-label="Zoom out"
          className="rounded-full bg-background/90 shadow"
          onClick={() => controlsRef.current?.zoomOut()}
        >
          <ZoomOut className="size-5" aria-hidden />
        </Button>
        <Button
          variant="outline"
          size="icon-lg"
          aria-label="Fit map"
          className="rounded-full bg-background/90 shadow"
          onClick={() => controlsRef.current?.fit()}
        >
          <Maximize className="size-5" aria-hidden />
        </Button>
      </div>

      {/* Hint banner */}
      {(tracing || inlineHint || saveStatus === "error") && (
        <div className="pointer-events-none absolute inset-x-3 bottom-[86px] z-20 flex justify-center">
          <div
            role={saveStatus === "error" ? "alert" : "status"}
            className="pointer-events-auto max-w-full rounded-lg bg-foreground/90 px-3 py-2 text-xs font-medium text-background shadow"
          >
            {saveStatus === "error"
              ? "The last change could not be saved - check the indicator above."
              : inlineHint
                ? inlineHint
                : "Tap to add points - tap the green dot or Done to finish"}
          </div>
        </div>
      )}

      {/* Bottom tool bar (PRD 12: bottom-anchored, thumb reach) */}
      <div
        className="absolute inset-x-0 bottom-0 z-20 border-t bg-background/95 px-2 pt-2 backdrop-blur"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      >
        {tracing ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleAngleLock}
              aria-pressed={angleLock}
              aria-label="Right-angle lock"
              className={`h-12 shrink-0 rounded-lg border px-3 text-xs font-bold ${
                angleLock
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground"
              }`}
            >
              45/90
            </button>
            <Button
              className="h-12 flex-1 rounded-lg text-base"
              disabled={!canFinish}
              onClick={() => commitDraft(draft)}
            >
              <Check className="size-5" aria-hidden />
              Done
            </Button>
            <Button
              variant="outline"
              size="icon-lg"
              className="h-12 w-12 shrink-0 rounded-lg"
              aria-label="Undo last corner"
              disabled={draft.length === 0}
              onClick={() => setDraft((d) => d.slice(0, -1))}
            >
              <Undo2 className="size-5" aria-hidden />
            </Button>
          </div>
        ) : selected ? (
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold">{selectedLabel}</span>
                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                  {subtypeLabel(selected)}
                </span>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {selected.geometry.type === "Point"
                  ? "Moving point places arrives in the next build"
                  : "Drag corners - tap a dashed midpoint to add one - double-tap a corner to remove"}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon-lg"
              aria-label="Edit details"
              disabled
              title="Details arrive in the next build"
            >
              <Pencil className="size-5" aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon-lg"
              aria-label={`Delete ${selectedLabel ?? "shape"}`}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={handleDeleteFeature}
            >
              <Trash2 className="size-5" aria-hidden />
            </Button>
          </div>
        ) : isDesktop ? (
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              Capture is designed for mobile. You can edit everything here.
            </p>
            <Button
              variant="outline"
              className="h-12 shrink-0 rounded-lg"
              onClick={() => setFinishOpen(true)}
            >
              <Flag className="size-4" aria-hidden />
              Finish
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1 gap-2">
              <Button
                variant={tracing ? "default" : "outline"}
                className="h-14 flex-1 flex-col gap-0.5 rounded-lg text-xs font-semibold"
                aria-pressed={tracing}
                onClick={() => setTool("trace-path")}
              >
                <Route className="size-5" aria-hidden />
                Trace Path
              </Button>
              <Button
                variant="outline"
                className="h-14 flex-1 flex-col gap-0.5 rounded-lg text-xs font-semibold"
                disabled
                title="Add Place arrives in the next build"
              >
                <Plus className="size-5" aria-hidden />
                Add Place
              </Button>
            </div>
            <Button
              variant="outline"
              size="icon-lg"
              className={`h-14 w-12 shrink-0 rounded-lg ${snapping ? "text-primary" : "text-muted-foreground"}`}
              aria-pressed={snapping}
              aria-label={snapping ? "Snapping on" : "Snapping off"}
              onClick={toggleSnapping}
            >
              <Magnet className="size-5" aria-hidden />
            </Button>
            <Button
              variant="default"
              className="h-14 shrink-0 rounded-lg px-4"
              onClick={() => setFinishOpen(true)}
            >
              <Flag className="size-4" aria-hidden />
              Finish
            </Button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={finishOpen}
        onOpenChange={setFinishOpen}
        title={`Finish ${floor.displayName}?`}
        description="The floor is marked completed and stays editable anytime."
        confirmLabel="Finish floor"
        onConfirm={async () => {
          await floorRepo.setStatus(floor.id, "completed");
          router.push(`/projects/view?id=${floor.projectId}`);
        }}
      />
    </main>
  );
}

// ------------------------------------------------------------- geometry utils
// Each editor branches explicitly on geometry kind: the LineString/Polygon
// coordinate union does not narrow through .map callbacks.

function toVertices(coords: readonly [number, number][]): Point[] {
  return coords.map((c) => ({ x: c[0], y: c[1] }));
}

function toCoords(vs: Point[]): [number, number][] {
  return vs.map((p) => [p.x, p.y]);
}

function replaceVertex(
  geometry: Feature["geometry"],
  index: number,
  point: Point,
): Feature["geometry"] | null {
  if (geometry.type === "Point") {
    return index === 0 ? { type: "Point", coordinates: [point.x, point.y] } : null;
  }
  if (geometry.type === "LineString") {
    const vs = toVertices(geometry.coordinates);
    if (index < 0 || index >= vs.length) return null;
    vs[index] = point;
    return { type: "LineString", coordinates: toCoords(vs) };
  }
  const ring = toVertices(geometry.coordinates[0]);
  if (index < 0 || index >= ring.length) return null;
  ring[index] = point;
  return { type: "Polygon", coordinates: [toCoords(ring)] };
}

function insertVertex(
  geometry: Feature["geometry"],
  index: number,
  point: Point,
): Feature["geometry"] | null {
  if (geometry.type === "LineString") {
    const vs = toVertices(geometry.coordinates);
    if (index < 0 || index > vs.length) return null;
    vs.splice(index, 0, point);
    return { type: "LineString", coordinates: toCoords(vs) };
  }
  if (geometry.type === "Polygon") {
    const ring = toVertices(geometry.coordinates[0]);
    if (index < 0 || index > ring.length) return null;
    ring.splice(index, 0, point);
    return { type: "Polygon", coordinates: [toCoords(ring)] };
  }
  return null;
}

function removeVertex(geometry: Feature["geometry"], index: number): Feature["geometry"] | null {
  if (geometry.type === "LineString") {
    const vs = toVertices(geometry.coordinates);
    if (index < 0 || index >= vs.length) return null;
    vs.splice(index, 1);
    return { type: "LineString", coordinates: toCoords(vs) };
  }
  if (geometry.type === "Polygon") {
    const ring = toVertices(geometry.coordinates[0]);
    if (index < 0 || index >= ring.length) return null;
    ring.splice(index, 1);
    return { type: "Polygon", coordinates: [toCoords(ring)] };
  }
  return null;
}

function countVertices(geometry: Feature["geometry"]): number {
  if (geometry.type === "Point") return 1;
  return geometry.coordinates.length;
}

function subtypeLabel(feature: Feature): string {
  const labels: Record<string, string> = {
    corridor: "Corridor",
    hallway: "Hallway",
    open_area: "Open Area",
    ramp: "Ramp",
    shop: "Shop",
    room: "Room",
    restaurant: "Restaurant",
    office: "Office",
    toilet: "Toilet",
    stairs: "Stairs",
    lift: "Lift",
    escalator: "Escalator",
    entrance: "Entrance",
    storage: "Storage",
    other: "Other",
  };
  return labels[feature.subtype] ?? feature.subtype;
}
