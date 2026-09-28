import { z } from "zod";

// PRD 28: the single source of truth. IndexedDB (Dexie), backup files and the
// GeoJSON exporter all validate against these schemas. TypeScript types are
// derived, never hand-written.

// Local floor coordinates (PRD 23): meters when calibrated, unitless numbers
// otherwise. Never latitude/longitude (PRD 22 coordinate honesty).
const coord = z.tuple([z.number(), z.number()]);

export const pointGeometrySchema = z.object({
  type: z.literal("Point"),
  coordinates: coord,
});

export const lineGeometrySchema = z.object({
  type: z.literal("LineString"),
  // AC-04: a path needs at least 2 distinct points to be saveable.
  coordinates: z.array(coord).min(2),
});

export const polygonGeometrySchema = z.object({
  type: z.literal("Polygon"),
  // AC-04: a ring needs at least 3 corners; the closing point is appended on
  // export, so stored rings stay open.
  coordinates: z.array(z.array(coord).min(3)).min(1),
});

export const geometrySchema = z.union([
  pointGeometrySchema,
  lineGeometrySchema,
  polygonGeometrySchema,
]);

export const projectSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(["active", "completed"]).default("active"),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const floorSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  displayName: z.string().min(1),
  // Vertical ordering source of truth (PRD 11); list position is cosmetic.
  order: z.number(),
  status: z.enum(["mapping", "completed"]).default("mapping"),
  scale: z
    .object({
      calibrated: z.boolean(),
      metersPerUnit: z.number().positive(),
    })
    .nullable()
    .default(null),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const featureSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  floorId: z.uuid(),
  type: z.enum(["path", "place"]),
  // Catalog key (PRD 21). The catalog config pins allowed values per phase;
  // the schema keeps the door open for new types without migrations.
  subtype: z.string().min(1),
  name: z.string().optional(),
  geometry: geometrySchema,
  access: z.enum(["public", "staff_only", "restricted", "emergency_only"]).default("public"),
  status: z.enum(["active", "closed", "temporary"]).default("active"),
  // PRD 19: defaults to high because geometry is hand-plotted.
  confidence: z.enum(["high", "medium", "low"]).default("high"),
  notes: z.string().optional(),
  // Subtype-specific extras: shopNumber, gender, direction, ...
  props: z.record(z.string(), z.unknown()).optional(),
  connectorGroupId: z.uuid().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const connectionSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  fromFeatureId: z.uuid(),
  toFeatureId: z.uuid(),
  kind: z.enum(["door", "path", "stair", "lift", "escalator", "ramp"]),
  createdAt: z.number(),
});

export const metaEntrySchema = z.object({
  key: z.string(),
  value: z.unknown(),
});

export type PointGeometry = z.infer<typeof pointGeometrySchema>;
export type LineGeometry = z.infer<typeof lineGeometrySchema>;
export type PolygonGeometry = z.infer<typeof polygonGeometrySchema>;
export type Geometry = z.infer<typeof geometrySchema>;
export type Project = z.infer<typeof projectSchema>;
export type Floor = z.infer<typeof floorSchema>;
export type Feature = z.infer<typeof featureSchema>;
export type Connection = z.infer<typeof connectionSchema>;
export type MetaEntry = z.infer<typeof metaEntrySchema>;
