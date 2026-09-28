import { z } from "zod";
import { connectionSchema, featureSchema, floorSchema, projectSchema } from "@/lib/domain/schema";
import { SCHEMA_VERSION } from "@/lib/db/db";

// PRD 30: a backup is full fidelity - the project and everything in it - so a
// lost or wiped phone never destroys a survey. Not GeoJSON: backup restores
// the app, GeoJSON (Phase 7) is for consumers.

export const BACKUP_APP_ID = "walk-and-plot";

export const backupSchemaV1 = z.object({
  app: z.literal(BACKUP_APP_ID),
  kind: z.literal("project-backup"),
  schemaVersion: z.literal(1),
  exportedAt: z.string(),
  project: projectSchema,
  floors: z.array(floorSchema),
  features: z.array(featureSchema),
  connections: z.array(connectionSchema),
});

export type BackupV1 = z.infer<typeof backupSchemaV1>;

export const backupFileSchema = z
  .object({
    app: z.string(),
    kind: z.string(),
    schemaVersion: z.number(),
  })
  .passthrough();

export const CURRENT_BACKUP_VERSION = SCHEMA_VERSION;
