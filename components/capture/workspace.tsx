"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowLeft,
  Check,
  Flag,
  X,
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
import { TypePicker } from "@/components/capture/type-picker";
import { PlaceDetailSheet } from "@/components/capture/place-detail-sheet";
import { CalibrateSheet, type CalibrateStage } from "@/components/capture/calibrate-sheet";
import { getPlaceType, PATH_SUBTYPES, typeLabel } from "@/lib/config/place-types";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { SaveIndicator } from "@/components/common/save-indicator";
import { EmptyState } from "@/components/common/empty-state";
import { featureRepo, floorRepo, projectRepo } from "@/lib/db/repositories";
import { connectionRepo } from "@/lib/db/connection-repo";
import { nearestPathFeature } from "@/lib/domain/connections";
import { newId } from "@/lib/db/id";
import { constrainToAngle, findSnap } from "@/lib/domain/snap";
import { buildSnapUniverse } from "@/lib/domain/snap-candidates";
import { dist, type Point } from "@/lib/domain/geometry";
import { gridStepForZoom } from "@/lib/domain/grid";
import { dist as distPts } from "@/lib/domain/geometry";
import type { Feature } from "@/lib/domain/schema";
import { runSave, useSaveStateStore } from "@/lib/store/save-state";
import { useHistoryStore, type HistoryEntry } from "@/lib/store/history";
import { useToolsStore } from "@/lib/store/tools";
import { useUndoToastStore } from "@/components/common/undo-toast";

// PRD 12/15/17: the mapping workspace at /projects/map?id=<floorId>.
// Autosave on every completed gesture, undo/redo for the session, snapping
// with visible indicators, and a one-finger draw / two-finger navigate model.

const DOOR_LINK_THRESHOLD_UNITS = 3;
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
  const connectionQuery = useLiveQuery(
    () => (project ? connectionRepo.listByProject(project.id) : Promise.resolve([])),
    [project?.id],
  );
  // Only links where both ends sit on this floor can render (PRD 18).
  const floorConnections = useMemo(() => {
    const conns = connectionQuery ?? [];
    const ids = new Set(features.map((f) => f.id));
    return conns.filter((c) => ids.has(c.fromFeatureId) && ids.has(c.toFeatureId));
  }, [connectionQuery, features]);

  const tool = useToolsStore((s) => s.tool);
  const setTool = useToolsStore((s) => s.setTool);
  const placeType = useToolsStore((s) => s.placeType);
  const startPlacing = useToolsStore((s) => s.startPlacing);
  const snapping = useToolsStore((s) => s.snapping);
  const toggleSnapping = useToolsStore((s) => s.toggleSnapping);
  const angleLock = useToolsStore((s) => s.angleLock);
  const toggleAngleLock = useToolsStore((s) => s.toggleAngleLock);
  const hydrateTools = useToolsStore((s) => s.hydrate);

  const history = useHistoryStore();
  const saveStatus = useSaveStateStore((s) => s.status);
  const showUndoToast = useUndoToastStore((s) => s.show);

  const [draft, setDraft] = useState<Point[]>([]);
  // Snap result per draft corner: first/last drive junctions (PRD 18).
  const [draftSnaps, setDraftSnaps] = useState<(ReturnType<typeof findSnap> | null)[]>([]);
  const [rawCursor, setRawCursor] = useState<Point | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [inlineHint, setInlineHint] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sheetFeatureId, setSheetFeatureId] = useState<string | null>(null);
  // PRD 15: post-capture chip retags the most recent path.
  const [lastPathId, setLastPathId] = useState<string | null>(null);
  // PRD 14: Set Real Length flow.
  const [calibStage, setCalibStage] = useState<CalibrateStage>({ kind: "idle" });
  const [calibPoints, setCalibPoints] = useState<Point[]>([]);
  const [calTipDismissed, setCalTipDismissed] = useState(false);
  const controlsRef = useRef<CanvasControls | null>(null);

  const sheetFeature = features.find((f) => f.id === sheetFeatureId) ?? null;

  // Per-floor session reset using React's adjust-during-render pattern
  // (state that must not survive a floor change).
  const [lastFloorId, setLastFloorId] = useState(floorId);
  if (lastFloorId !== floorId) {
    setLastFloorId(floorId);
    setDraft([]);
    setDraftSnaps([]);
    setSelectedId(null);
    setRawCursor(null);
    setCalibStage({ kind: "idle" });
    setCalibPoints([]);
    try {
      setCalTipDismissed(sessionStorage.getItem(`wap-cal-tip:${floorId}`) === "1");
    } catch {
      setCalTipDismissed(false);
    }
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
  const calibrating = calibStage.kind === "trace";
  const placing = tool === "add-place" && placeType !== null;
  const placingPoint = placing && getPlaceType(placeType)?.capture === "point";
  const placingPolygon = placing && getPlaceType(placeType)?.capture === "polygon";
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
      if (!raw || !(tracing || placingPolygon || calibrating) || draft.length === 0) {
        return { cursor: raw, snap: null };
      }
      const from = draft[draft.length - 1];
      const result = effectivePoint(raw, { from, angleLock, snapping });
      return { cursor: result.point, snap: result.snap };
    },
    [draft, tracing, placingPolygon, calibrating, effectivePoint, angleLock, snapping],
  );

  const cursorState = computeCursor(rawCursor);

  // ------------------------------------------------------------- tap actions

  function handleTapWorld(world: Point) {
    setInlineHint(null);
    setLastPathId(null);
    if (calibrating) {
      // Two taps define the known length; the sheet reopens with the result.
      if (calibPoints.length >= 2) return;
      const next = [...calibPoints, world];
      setCalibPoints(next);
      if (next.length === 2) {
        setCalibStage({ kind: "sheet", tracedUnits: distPts(next[0], next[1]) });
      }
      return;
    }
    if (placing && placingPoint) {
      placePoint(world);
      return;
    }
    if (placing && placingPolygon) {
      const { point } = effectivePoint(world, {
        from: draft.length > 0 ? draft[draft.length - 1] : undefined,
        angleLock: false,
        snapping,
      });
      // AC-04: corners must be distinct.
      const last = draft[draft.length - 1];
      if (last && dist(last, point) * scaleRef.current < 1) return;
      setDraft((d) => [...d, point]);
      setDraftSnaps((sn) => [...sn, null]);
      return;
    }
    if (tracing) {
      // Tap the first point again (or Done) to finish (PRD 15).
      if (draft.length >= 2) {
        const firstScreenDist = dist(world, draft[0]) * scaleRef.current;
        if (firstScreenDist <= FINISH_TAP_PX) {
          commitDraft(draft);
          return;
        }
      }
      const { point, snap: snapResult } = effectivePoint(world, {
        from: draft.length > 0 ? draft[draft.length - 1] : undefined,
        angleLock,
        snapping,
      });
      // AC-04: points must be distinct - ignore a tap on the previous corner.
      const last = draft[draft.length - 1];
      if (last && dist(last, point) * scaleRef.current < 1) return;
      setDraft((d) => [...d, point]);
      setDraftSnaps((sn) => [...sn, snapResult]);
      return;
    }
    // Select tool: tap on empty space - selection clearing happens in canvas.
    setSelectedId(null);
  }

  function handleCursorMove(world: Point | null) {
    if (!tracing && !calibrating && !placingPolygon) {
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
    setDraft([]);
    setDraftSnaps([]);
    setRawCursor(null);
    setLastPathId(feature.id);
    commitDraftWithConnections(feature, draftSnaps);
  }

  // PRD 18: the path just saved connects where its ends snapped. Endpoint
  // snaps record a connection; segment snaps split the target into two
  // linked segments with a junction at the shared point.
  function commitDraftWithConnections(
    feature: Feature,
    snaps: (ReturnType<typeof findSnap> | null)[],
  ) {
    const first = snaps[0] ?? null;
    const last = snaps.length > 1 ? (snaps[snaps.length - 1] ?? null) : null;

    void runSave(async () => {
      const extraConnections: import("@/lib/domain/schema").Connection[] = [];
      // rightId mutates when redo re-splits (a fresh segment id) so undo
      // always removes the segment that currently exists.
      const splits: {
        targetId: string;
        targetBefore: Feature["geometry"];
        junction: Point;
        rightId: string;
      }[] = [];

      for (const snap of [first, last]) {
        if (!snap) continue;
        if (snap.kind === "endpoint") {
          if (snap.featureId === feature.id) continue;
          extraConnections.push(
            await connectionRepo.create({
              projectId: feature.projectId,
              fromFeatureId: feature.id,
              toFeatureId: snap.featureId,
              kind: "path",
            }),
          );
        } else if (snap.kind === "segment") {
          const target = await featureRepo.get(snap.featureId);
          if (!target || target.geometry.type !== "LineString") continue;
          const result = await featureRepo.splitPathAtPoint(snap.featureId, snap.point, feature.id);
          if (result) {
            splits.push({
              targetId: target.id,
              targetBefore: target.geometry,
              junction: snap.point,
              rightId: result.right.id,
            });
          }
        }
      }

      if (!extraConnections.length && !splits.length) return;

      history.push({
        label: "Connect path",
        undo: async () => {
          // Removing the new path cascades every connection touching it;
          // each split restores the target and drops its right segment.
          await featureRepo.remove(feature.id);
          for (const split of splits) {
            await featureRepo.remove(split.rightId);
            await featureRepo.update(split.targetId, { geometry: split.targetBefore });
          }
        },
        redo: async () => {
          await featureRepo.restore(feature);
          for (const c of extraConnections) await connectionRepo.restore(c);
          for (const split of splits) {
            await featureRepo.update(split.targetId, { geometry: split.targetBefore });
            const result = await featureRepo.splitPathAtPoint(
              split.targetId,
              split.junction,
              feature.id,
            );
            if (result) split.rightId = result.right.id;
          }
        },
      });
    });
  }

  // PRD 16: a point place is one tap - it saves immediately, then the
  // dismissible detail sheet offers enrichment.
  function placePoint(raw: Point) {
    if (!floorId || !floor || !project || !placeType) return;
    const { point } = effectivePoint(raw, { angleLock: false, snapping });
    const now = Date.now();
    const feature: Feature = {
      id: newId(),
      projectId: project.id,
      floorId,
      type: "place",
      subtype: placeType,
      geometry: { type: "Point", coordinates: [point.x, point.y] },
      access: "public",
      status: "active",
      confidence: "high",
      createdAt: now,
      updatedAt: now,
    };
    void runSave(async () => {
      await featureRepo.create(feature);
      const door = await maybeLinkDoor(feature);
      pushFeatureHistory(`Add ${typeLabel(placeType)}`, feature, door ? [door] : []);
    });
    setSheetFeatureId(feature.id);
    setTool("select");
  }

  // PRD 16: an area place saves on Done (>= 3 corners, AC-04) and opens the
  // detail sheet; the tool returns to Select.
  function commitPlaceDraft(points: Point[]) {
    if (!floorId || !floor || !project || !placeType) return;
    const distinct = points.filter((p, i) => i === 0 || dist(p, points[i - 1]) > 1e-6);
    if (distinct.length < 3) {
      setInlineHint("A shape needs at least 3 corners");
      return;
    }
    const now = Date.now();
    const feature: Feature = {
      id: newId(),
      projectId: project.id,
      floorId,
      type: "place",
      subtype: placeType,
      geometry: { type: "Polygon", coordinates: [distinct.map((p) => [p.x, p.y])] },
      access: "public",
      status: "active",
      confidence: "high",
      createdAt: now,
      updatedAt: now,
    };
    void runSave(async () => {
      await featureRepo.create(feature);
    });
    pushFeatureHistory(`Add ${typeLabel(placeType)}`, feature);
    setDraft([]);
    setRawCursor(null);
    setSheetFeatureId(feature.id);
    setTool("select");
  }

  // PRD 15: retag the most recent path; tapping anywhere else dismisses.
  function retagLastPath(subtype: string) {
    if (!lastPathId) return;
    const feature = features.find((f) => f.id === lastPathId);
    if (!feature || feature.subtype === subtype) return;
    const before = feature.subtype;
    void runSave(async () => {
      await featureRepo.update(lastPathId, { subtype });
    });
    history.push({
      label: "Tag path",
      undo: async () => {
        await featureRepo.update(lastPathId, { subtype: before });
      },
      redo: async () => {
        await featureRepo.update(lastPathId, { subtype });
      },
    });
  }

  function pushFeatureHistory(
    label: string,
    feature: Feature,
    extraConnections: import("@/lib/domain/schema").Connection[] = [],
  ) {
    const entry: HistoryEntry = {
      label,
      undo: async () => {
        // Cascade removes every connection that touches the feature,
        // including any recorded here.
        await featureRepo.remove(feature.id);
      },
      redo: async () => {
        await featureRepo.restore(feature);
        for (const c of extraConnections) await connectionRepo.restore(c);
      },
    };
    history.push(entry);
  }

  // PRD 18 doors: a place inside or adjacent to a path records the link
  // automatically; the sheet confirms it and the canvas dashes it.
  async function maybeLinkDoor(place: Feature) {
    const paths = features.filter((f) => f.geometry.type === "LineString");
    const nearest = nearestPathFeature(place, paths, DOOR_LINK_THRESHOLD_UNITS);
    if (!nearest) return null;
    return connectionRepo.create({
      projectId: place.projectId,
      fromFeatureId: place.id,
      toFeatureId: nearest.featureId,
      kind: "door",
    });
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

  const canFinish = draft.length >= (placingPolygon ? 3 : 2);
  const selectedLabel = selected ? (selected.name ?? "Unnamed") : null;

  return (
    <main className="fixed inset-0 flex flex-col bg-background" aria-live="polite">
      <MapCanvas
        features={features}
        connections={floorConnections}
        floorScale={floor.scale}
        captureActive={(tracing || placingPolygon || calibrating) && !isDesktop}
        draft={tracing || placingPolygon || calibrating ? draft : []}
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
          <button
            type="button"
            aria-label={
              floor.scale?.calibrated
                ? "Calibrated, meters - tap to recalibrate"
                : "Not calibrated, units - tap to set real length"
            }
            onClick={() => setCalibStage({ kind: "sheet", tracedUnits: null })}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-semibold text-muted-foreground hover:bg-muted"
          >
            <span
              aria-hidden
              className={`size-1.5 rounded-full ${
                floor.scale?.calibrated ? "bg-emerald-600 dark:bg-emerald-400" : "bg-amber-500"
              }`}
            />
            {floor.scale?.calibrated ? "m" : "units"}
          </button>
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

      {/* Hint banner / post-capture subtype chip (PRD 15) / calibration (PRD 14) */}
      {(tracing ||
        placingPolygon ||
        calibrating ||
        inlineHint ||
        lastPathId ||
        (!floor.scale?.calibrated && !calTipDismissed && !tracing && !placing && !selected) ||
        saveStatus === "error") && (
        <div className="pointer-events-none absolute inset-x-3 bottom-[86px] z-20 flex justify-center">
          {saveStatus === "error" || inlineHint ? (
            <div
              role={saveStatus === "error" ? "alert" : "status"}
              className="pointer-events-auto max-w-full rounded-lg bg-foreground/90 px-3 py-2 text-xs font-medium text-background shadow"
            >
              {saveStatus === "error"
                ? "The last change could not be saved - check the indicator above."
                : inlineHint}
            </div>
          ) : calibrating ? (
            <div
              role="status"
              className="pointer-events-auto rounded-lg bg-foreground/90 px-3 py-2 text-xs font-medium text-background shadow"
            >
              {calibPoints.length === 0
                ? "Tap the start of the known length"
                : "Tap the end of the known length"}
            </div>
          ) : !floor.scale?.calibrated && !calTipDismissed && !tracing && !placing && !selected ? (
            <div
              role="status"
              className="pointer-events-auto flex max-w-full items-center gap-2 rounded-lg bg-amber-500/95 px-3 py-2 text-xs font-medium text-amber-950 shadow"
            >
              <span className="min-w-0 flex-1">
                Tip: use Set Real Length to get real measurements.
              </span>
              <button
                type="button"
                onClick={() => setCalibStage({ kind: "sheet", tracedUnits: null })}
                className="h-8 shrink-0 rounded-md bg-amber-950/15 px-2.5 text-xs font-bold hover:bg-amber-950/25"
              >
                Set length
              </button>
              <button
                type="button"
                aria-label="Dismiss calibration tip"
                onClick={() => {
                  setCalTipDismissed(true);
                  try {
                    sessionStorage.setItem(`wap-cal-tip:${floorId}`, "1");
                  } catch {
                    // Session-only hint; dropping it is fine.
                  }
                }}
                className="grid size-8 shrink-0 place-items-center rounded-full text-amber-950/80 hover:bg-amber-950/15"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
          ) : lastPathId ? (
            <div
              role="status"
              className="pointer-events-auto flex max-w-full items-center gap-2 rounded-lg bg-foreground/90 px-3 py-1.5 text-background shadow"
            >
              <span className="text-xs font-medium">Tag:</span>
              {PATH_SUBTYPES.map((st) => (
                <button
                  key={st.value}
                  type="button"
                  onClick={() => retagLastPath(st.value)}
                  className="h-8 rounded-full bg-background/15 px-2.5 text-xs font-semibold text-background hover:bg-background/25"
                >
                  {st.label}
                </button>
              ))}
              <button
                type="button"
                aria-label="Dismiss tag suggestions"
                onClick={() => setLastPathId(null)}
                className="grid size-8 place-items-center rounded-full text-background/80 hover:bg-background/15"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
          ) : (
            <div
              role="status"
              className="pointer-events-auto max-w-full rounded-lg bg-foreground/90 px-3 py-2 text-xs font-medium text-background shadow"
            >
              {placingPolygon
                ? "Trace the area boundary - tap each corner"
                : "Tap to add points - tap the green dot or Done to finish"}
            </div>
          )}
        </div>
      )}

      {/* Bottom tool bar (PRD 12: bottom-anchored, thumb reach) */}
      <div
        className="absolute inset-x-0 bottom-0 z-20 border-t bg-background/95 px-2 pt-2 backdrop-blur"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      >
        {placing && placingPoint ? (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon-lg"
              className="h-12 w-12 shrink-0 rounded-lg"
              aria-label="Cancel placing"
              onClick={() => setTool("select")}
            >
              <X className="size-5" aria-hidden />
            </Button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{typeLabel(placeType ?? "")}</p>
              <p className="truncate text-xs text-muted-foreground">
                Tap the map to place it - saves now, details after
              </p>
            </div>
          </div>
        ) : placing && placingPolygon ? (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon-lg"
              className="h-12 w-12 shrink-0 rounded-lg"
              aria-label="Cancel placing"
              onClick={() => {
                setDraft([]);
                setTool("select");
              }}
            >
              <X className="size-5" aria-hidden />
            </Button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{typeLabel(placeType ?? "")}</p>
              <p className="truncate text-xs text-muted-foreground">
                Trace the area boundary - tap each corner
              </p>
            </div>
            <Button
              variant="outline"
              size="icon-lg"
              className="h-12 w-12 shrink-0 rounded-lg"
              aria-label="Undo last corner"
              disabled={draft.length === 0}
              onClick={() => {
                setDraft((d) => d.slice(0, -1));
                setDraftSnaps((sn) => sn.slice(0, -1));
              }}
            >
              <Undo2 className="size-5" aria-hidden />
            </Button>
            <Button
              className="h-12 shrink-0 rounded-lg px-5"
              disabled={!canFinish}
              onClick={() => commitPlaceDraft(draft)}
            >
              <Check className="size-5" aria-hidden />
              Done
            </Button>
          </div>
        ) : tracing ? (
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
              onClick={() => {
                setDraft((d) => d.slice(0, -1));
                setDraftSnaps((sn) => sn.slice(0, -1));
              }}
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
                  ? "Drag it to move - details via the pencil"
                  : "Drag corners - tap a dashed midpoint to add one - double-tap a corner to remove"}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon-lg"
              aria-label="Edit details"
              onClick={() => setSheetFeatureId(selected.id)}
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
                onClick={() => setPickerOpen(true)}
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

      <TypePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={(key) => {
          startPlacing(key);
          setDraft([]);
          setLastPathId(null);
        }}
      />

      <PlaceDetailSheet
        feature={sheetFeature}
        onOpenChange={(open) => {
          if (!open) setSheetFeatureId(null);
        }}
      />

      <CalibrateSheet
        open={calibStage.kind === "sheet"}
        floor={floor}
        features={features}
        tracedUnits={calibStage.kind === "sheet" ? calibStage.tracedUnits : null}
        onOpenChange={(open) => {
          if (!open) {
            setCalibStage({ kind: "idle" });
            setCalibPoints([]);
          }
        }}
        onStartTrace={() => {
          setCalibPoints([]);
          setCalibStage({ kind: "trace" });
        }}
        onApplied={() => {
          setCalibStage({ kind: "idle" });
          setCalibPoints([]);
          controlsRef.current?.fit();
        }}
      />

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
