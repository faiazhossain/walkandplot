import { z } from "zod";
import { SCHEMA_VERSION } from "@/lib/db/db";
import { calibrationMultiplier } from "@/lib/domain/units";
import type { Connection, Feature, Floor, Project } from "@/lib/domain/schema";

// PRD 22: the primary output. Coordinates are local floor coordinates in
// meters (or honest uncalibrated units) - never latitude/longitude. The
// exporter validates everything against Zod before writing and refuses to
// produce invalid GeoJSON.

export class ExportValidationError extends Error {
  constructor(message = "Refusing to export invalid GeoJSON") {
    super(message);
    this.name = "ExportValidationError";
  }
}

// ------------------------------------------------------------ output schemas

const positionSchema = z.tuple([z.number(), z.number()]);

const geojsonFeatureSchema = z.object({
  type: z.literal("Feature"),
  id: z.string(),
  properties: z.record(z.string(), z.unknown()),
  geometry: z.union([
    z.object({ type: z.literal("Point"), coordinates: positionSchema }),
    z.object({ type: z.literal("LineString"), coordinates: z.array(positionSchema).min(2) }),
    z.object({
      type: z.literal("Polygon"),
      coordinates: z.array(z.array(positionSchema).min(4)).min(1),
    }),
  ]),
});

const featureCollectionSchema = z.object({
  type: z.literal("FeatureCollection"),
  properties: z.record(z.string(), z.unknown()),
  features: z.array(geojsonFeatureSchema),
});

export type GeoJSONFeatureCollection = z.infer<typeof featureCollectionSchema>;

// ------------------------------------------------------------------ building

const APP_ID = "walk-and-plot";
/** PRD 34: photos export as a count; inline only while the file stays small. */
const INLINE_PHOTO_BUDGET_BYTES = 20 * 1024 * 1024;

interface ExportInput {
  project: Project;
  floors: Floor[];
  features: Feature[];
  connections: Connection[];
  now?: number;
}

function coordinateSystem(floors: Floor[]) {
  // PRD 22 coordinate honesty: claim meters only when every exported floor
  // is calibrated; a mix is declared "mixed", never silently "meters".
  const calibrated = floors.map((f) => f.scale?.calibrated === true);
  const all = calibrated.length > 0 && calibrated.every(Boolean);
  const some = calibrated.some(Boolean);
  return {
    type: "local",
    unit: all ? "meters" : some ? "mixed" : "units",
    origin: "first-plotted-point-per-floor",
    calibrated: all,
  };
}

function scaleGeometry(
  feature: Feature,
  floorById: Map<string, Floor>,
): GeoJSONFeatureCollection["features"][number]["geometry"] {
  const floor = floorById.get(feature.floorId);
  const mult = calibrationMultiplier(floor?.scale ?? null);
  const g = feature.geometry;
  const scalePos = (c: [number, number]): [number, number] => [c[0] * mult, c[1] * mult];
  if (g.type === "Point") return { type: "Point", coordinates: scalePos(g.coordinates) };
  if (g.type === "LineString")
    return { type: "LineString", coordinates: g.coordinates.map(scalePos) };
  return { type: "Polygon", coordinates: g.coordinates.map((ring) => ring.map(scalePos)) };
}

function buildFeatureProperties(
  feature: Feature,
  floor: Floor | undefined,
  connectionIds: string[],
  inlinePhoto: boolean,
): Record<string, unknown> {
  const props = { ...(feature.props ?? {}) };
  const photo = typeof props.photo === "string" ? props.photo : null;
  delete props.photo;

  const properties: Record<string, unknown> = {
    floorId: feature.floorId,
    ...(floor ? { floorName: floor.displayName } : {}),
    type: feature.type,
    subtype: feature.subtype,
    ...(feature.name !== undefined ? { name: feature.name } : {}),
    ...props,
    access: feature.access,
    status: feature.status,
    confidence: feature.confidence,
    ...(feature.notes !== undefined ? { notes: feature.notes } : {}),
    connections: connectionIds,
    photoCount: photo ? 1 : 0,
    ...(photo && inlinePhoto ? { photo } : {}),
    createdAt: new Date(feature.createdAt).toISOString(),
    updatedAt: new Date(feature.updatedAt).toISOString(),
  };
  if (feature.connectorGroupId) properties.connectorGroupId = feature.connectorGroupId;
  return properties;
}

function toFeature(
  feature: Feature,
  floorById: Map<string, Floor>,
  connectionIds: string[],
  inlinePhoto: boolean,
): GeoJSONFeatureCollection["features"][number] {
  let geometry = scaleGeometry(feature, floorById);
  // PRD 22: place areas export as closed rings; stored rings stay open.
  if (geometry.type === "Polygon") {
    geometry = {
      type: "Polygon",
      coordinates: geometry.coordinates.map((ring) => {
        const first = ring[0];
        const last = ring[ring.length - 1];
        if (first[0] === last[0] && first[1] === last[1]) return ring;
        return [...ring, first];
      }),
    };
  }

  return {
    type: "Feature",
    id: feature.id,
    properties: buildFeatureProperties(
      feature,
      floorById.get(feature.floorId),
      connectionIds,
      inlinePhoto,
    ),
    geometry,
  };
}

function assertValid(collection: unknown): GeoJSONFeatureCollection {
  const result = featureCollectionSchema.safeParse(collection);
  if (!result.success) {
    // PRD 22: refuse to produce invalid GeoJSON - this is a bug, not a
    // user error, so the message targets the log.
    throw new ExportValidationError(
      `Export validation failed: ${result.error.issues
        .slice(0, 3)
        .map((i) => i.message)
        .join("; ")}`,
    );
  }
  return result.data;
}

export function buildFloorGeoJSON({
  project,
  floor,
  features,
  connections,
  now = Date.now(),
}: Omit<ExportInput, "floors"> & { floor: Floor }): GeoJSONFeatureCollection {
  const floorFeatures = features.filter((f) => f.floorId === floor.id);
  const featureIds = new Set(floorFeatures.map((f) => f.id));
  const connectionsByFeature = mapConnections(connections, featureIds);
  const floorById = new Map([[floor.id, floor]]);
  const inlinePhoto = estimatePhotoBytes(floorFeatures) <= INLINE_PHOTO_BUDGET_BYTES;

  return assertValid({
    type: "FeatureCollection",
    properties: {
      app: APP_ID,
      schemaVersion: 2,
      project: project.name,
      projectId: project.id,
      exportedAt: new Date(now).toISOString(),
      floors: [floorToExport(floor)],
      coordinateSystem: coordinateSystem([floor]),
    },
    features: floorFeatures.map((f) =>
      toFeature(f, floorById, connectionsByFeature.get(f.id) ?? [], inlinePhoto),
    ),
  });
}

export function buildProjectGeoJSON({
  project,
  floors,
  features,
  connections,
  now = Date.now(),
}: ExportInput): GeoJSONFeatureCollection {
  const ordered = [...floors].sort((a, b) => a.order - b.order);
  const featureIds = new Set(features.map((f) => f.id));
  const connectionsByFeature = mapConnections(connections, featureIds);
  const floorById = new Map(ordered.map((f) => [f.id, f]));
  const inlinePhoto = estimatePhotoBytes(features) <= INLINE_PHOTO_BUDGET_BYTES;

  return assertValid({
    type: "FeatureCollection",
    properties: {
      app: APP_ID,
      schemaVersion: 2,
      project: project.name,
      projectId: project.id,
      exportedAt: new Date(now).toISOString(),
      floors: ordered.map(floorToExport),
      coordinateSystem: coordinateSystem(ordered),
    },
    features: features.map((f) =>
      toFeature(f, floorById, connectionsByFeature.get(f.id) ?? [], inlinePhoto),
    ),
  });
}

// PRD 22 reserved room: the geographic anchor travels with the floor when set.
function floorToExport(floor: Floor): Record<string, unknown> {
  return {
    floorId: floor.id,
    displayName: floor.displayName,
    order: floor.order,
    ...(floor.geoAnchor ? { geoAnchor: floor.geoAnchor } : {}),
  };
}

function mapConnections(connections: Connection[], featureIds: Set<string>): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const c of connections) {
    if (!featureIds.has(c.fromFeatureId) || !featureIds.has(c.toFeatureId)) continue;
    const from = map.get(c.fromFeatureId) ?? [];
    from.push(c.toFeatureId);
    map.set(c.fromFeatureId, from);
    const to = map.get(c.toFeatureId) ?? [];
    to.push(c.fromFeatureId);
    map.set(c.toFeatureId, to);
  }
  return map;
}

function estimatePhotoBytes(features: Feature[]): number {
  let total = 0;
  for (const f of features) {
    const photo = f.props?.photo;
    if (typeof photo === "string") total += photo.length;
  }
  return total;
}

/** PRD 22 naming: ABC-Shopping-Mall.geojson / ABC-Shopping-Mall-Floor-3.geojson */
export function exportFilename(projectName: string, floorName?: string): string {
  const slug = (s: string) =>
    s
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "project";
  const base = slug(projectName);
  return floorName ? `${base}-${slug(floorName)}.geojson` : `${base}.geojson`;
}
