import { z } from "zod";
import { getDb } from "@/lib/db/db";
import { newId } from "@/lib/db/id";
import { featureSchema, floorSchema, projectSchema } from "@/lib/domain/schema";
import type { Feature, Floor, Project } from "@/lib/domain/schema";

// PRD 29: repositories are the only writers. Every persisted record is
// validated against Zod on write; multi-record writes run in a transaction.
// Components never touch Dexie directly.

export class ValidationError extends Error {
  constructor(public readonly issues: z.ZodError) {
    super("Record failed schema validation");
    this.name = "ValidationError";
  }
}

// PRD 28: a validation failure is a bug, surfaced loudly - never silently
// dropped. Callers persist only schema-valid records.
function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ValidationError(result.error);
  return result.data;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  firstFloorName?: string;
}

export const projectRepo = {
  async list(): Promise<Project[]> {
    const projects = await getDb().projects.toArray();
    return projects.sort((a, b) => b.updatedAt - a.updatedAt);
  },

  async get(id: string): Promise<Project | undefined> {
    return getDb().projects.get(id);
  },

  // Creates the project and its first floor atomically (PRD 10, 29).
  async create(input: CreateProjectInput): Promise<{ project: Project; floor: Floor }> {
    const now = Date.now();
    const project: Project = parseOrThrow(projectSchema, {
      id: newId(),
      name: input.name,
      description: input.description,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    const floor: Floor = parseOrThrow(floorSchema, {
      id: newId(),
      projectId: project.id,
      displayName: input.firstFloorName ?? "Ground",
      order: 0,
      status: "mapping",
      scale: null,
      createdAt: now,
      updatedAt: now,
    });
    await getDb().transaction("rw", getDb().projects, getDb().floors, async () => {
      await getDb().projects.add(project);
      await getDb().floors.add(floor);
    });
    return { project, floor };
  },

  async rename(id: string, name: string): Promise<void> {
    const db = getDb();
    await db.transaction("rw", db.projects, async () => {
      const project = await db.projects.get(id);
      if (!project) return;
      const updated: Project = parseOrThrow(projectSchema, {
        ...project,
        name,
        updatedAt: Date.now(),
      });
      await db.projects.put(updated);
    });
  },

  async remove(id: string): Promise<void> {
    // Deleting a project takes its floors and features with it (PRD 17:
    // callers own the confirmation dialog and the pre-delete backup offer).
    const db = getDb();
    await db.transaction("rw", db.projects, db.floors, db.features, db.connections, async () => {
      await db.features.where("projectId").equals(id).delete();
      await db.connections.where("projectId").equals(id).delete();
      await db.floors.where("projectId").equals(id).delete();
      await db.projects.delete(id);
    });
  },
};

export interface CreateFloorInput {
  projectId: string;
  displayName: string;
}

export const floorRepo = {
  async listByProject(projectId: string): Promise<Floor[]> {
    const floors = await getDb().floors.where("projectId").equals(projectId).toArray();
    return floors.sort((a, b) => a.order - b.order);
  },

  async get(id: string): Promise<Floor | undefined> {
    return getDb().floors.get(id);
  },

  async create(input: CreateFloorInput): Promise<Floor> {
    const db = getDb();
    const existing = await db.floors.where("projectId").equals(input.projectId).toArray();
    const now = Date.now();
    const floor: Floor = parseOrThrow(floorSchema, {
      id: newId(),
      projectId: input.projectId,
      displayName: input.displayName,
      order: existing.length ? Math.max(...existing.map((f) => f.order)) + 1 : 0,
      status: "mapping",
      scale: null,
      createdAt: now,
      updatedAt: now,
    });
    await db.floors.add(floor);
    return floor;
  },

  async setStatus(id: string, status: Floor["status"]): Promise<void> {
    const db = getDb();
    await db.transaction("rw", db.floors, async () => {
      const floor = await db.floors.get(id);
      if (!floor) return;
      await db.floors.put(parseOrThrow(floorSchema, { ...floor, status, updatedAt: Date.now() }));
    });
  },

  // PRD 14: applying Set Real Length scales every feature coordinate so the
  // floor's units become real meters. Runs in one transaction with the scale
  // update so a crash mid-way cannot half-rescale a floor (PRD P1).
  async applyCalibration(floorId: string, tracedUnits: number, realMeters: number): Promise<void> {
    const db = getDb();
    await db.transaction("rw", db.floors, db.features, async () => {
      const floor = await db.floors.get(floorId);
      if (!floor) return;
      if (tracedUnits <= 0 || realMeters <= 0) {
        throw new Error("Calibration needs positive traced and real lengths");
      }
      const mult = realMeters / tracedUnits;
      const features = await db.features.where("floorId").equals(floorId).toArray();
      for (const f of features) {
        const scaled = scaleFeature(f, mult);
        await db.features.put(parseOrThrow(featureSchema, { ...scaled, updatedAt: Date.now() }));
      }
      await db.floors.put(
        parseOrThrow(floorSchema, {
          ...floor,
          scale: { calibrated: true, metersPerUnit: 1 },
          updatedAt: Date.now(),
        }),
      );
    });
  },
};

function scaleFeature(f: Feature, mult: number): Feature {
  const g = f.geometry;
  const geometry: Feature["geometry"] =
    g.type === "Point"
      ? {
          type: "Point",
          coordinates: [g.coordinates[0] * mult, g.coordinates[1] * mult],
        }
      : g.type === "LineString"
        ? {
            type: "LineString",
            coordinates: g.coordinates.map((c) => [c[0] * mult, c[1] * mult]),
          }
        : {
            type: "Polygon",
            coordinates: g.coordinates.map((ring) => ring.map((c) => [c[0] * mult, c[1] * mult])),
          };
  return { ...f, geometry };
}

export const featureRepo = {
  async listByFloor(floorId: string): Promise<Feature[]> {
    return getDb().features.where("floorId").equals(floorId).toArray();
  },

  async create(
    feature: Omit<Feature, "createdAt" | "updatedAt"> & { createdAt?: number },
  ): Promise<Feature> {
    const now = Date.now();
    const saved = parseOrThrow(featureSchema, { ...feature, createdAt: now, updatedAt: now });
    await getDb().features.add(saved);
    return saved;
  },

  // PRD 17: every completed gesture writes within 1s; this is the write.
  async update(id: string, patch: Partial<Feature>): Promise<Feature | undefined> {
    const db = getDb();
    return db.transaction("rw", db.features, async () => {
      const existing = await db.features.get(id);
      if (!existing) return undefined;
      const updated = parseOrThrow(featureSchema, { ...existing, ...patch, updatedAt: Date.now() });
      await db.features.put(updated);
      return updated;
    });
  },

  async remove(id: string): Promise<void> {
    await getDb().features.delete(id);
  },
};
