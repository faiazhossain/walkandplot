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

// Keeps "Edited 2 hours ago" honest on the dashboard: any floor or feature
// change bumps the parent project.
async function touchProject(projectId: string): Promise<void> {
  await getDb().projects.update(projectId, { updatedAt: Date.now() });
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  firstFloorName?: string;
}

/** Dashboard/overview payload: a project with its floors and feature counts. */
export interface ProjectSummary {
  project: Project;
  /** Ordered floors (order field is the source of truth, PRD 11). */
  floors: Floor[];
  features: Feature[];
  featureCountByFloor: Map<string, number>;
}

export const projectRepo = {
  async list(): Promise<Project[]> {
    const projects = await getDb().projects.toArray();
    return projects.sort((a, b) => b.updatedAt - a.updatedAt);
  },

  // Everything the dashboard and project overview render, in one read each.
  // Tables are small (local-only app), so whole-table scans are fine.
  async listSummaries(): Promise<ProjectSummary[]> {
    const db = getDb();
    const [projects, floors, features] = await Promise.all([
      db.projects.toArray(),
      db.floors.toArray(),
      db.features.toArray(),
    ]);
    const floorsByProject = new Map<string, Floor[]>();
    for (const f of floors) {
      const list = floorsByProject.get(f.projectId) ?? [];
      list.push(f);
      floorsByProject.set(f.projectId, list);
    }
    const featuresByProject = new Map<string, Feature[]>();
    for (const f of features) {
      const list = featuresByProject.get(f.projectId) ?? [];
      list.push(f);
      featuresByProject.set(f.projectId, list);
    }
    return projects
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((project) => {
        const projectFloors = (floorsByProject.get(project.id) ?? []).sort(
          (a, b) => a.order - b.order,
        );
        const projectFeatures = featuresByProject.get(project.id) ?? [];
        const countByFloor = new Map<string, number>();
        for (const f of projectFeatures) {
          countByFloor.set(f.floorId, (countByFloor.get(f.floorId) ?? 0) + 1);
        }
        return {
          project,
          floors: projectFloors,
          featureCountByFloor: countByFloor,
          features: projectFeatures,
        };
      });
  },

  // Project overview payload: the project, its ordered floors, its features.
  async getBundle(
    projectId: string,
  ): Promise<{ project: Project; floors: Floor[]; features: Feature[] } | undefined> {
    const db = getDb();
    const project = await db.projects.get(projectId);
    if (!project) return undefined;
    const [floors, features] = await Promise.all([
      floorRepo.listByProject(projectId),
      db.features.where("projectId").equals(projectId).toArray(),
    ]);
    return { project, floors, features };
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
    await touchProject(input.projectId);
    return floor;
  },

  async setStatus(id: string, status: Floor["status"]): Promise<void> {
    const db = getDb();
    const floor = await db.floors.get(id);
    if (!floor) return;
    await db.transaction("rw", db.floors, async () => {
      await db.floors.put(parseOrThrow(floorSchema, { ...floor, status, updatedAt: Date.now() }));
    });
    await touchProject(floor.projectId);
  },

  async rename(id: string, displayName: string): Promise<void> {
    const db = getDb();
    const floor = await db.floors.get(id);
    if (!floor || !displayName.trim()) return;
    await db.transaction("rw", db.floors, async () => {
      await db.floors.put(
        parseOrThrow(floorSchema, {
          ...floor,
          displayName: displayName.trim(),
          updatedAt: Date.now(),
        }),
      );
    });
    await touchProject(floor.projectId);
  },

  // Deleting a floor takes its features (and their connections) with it;
  // callers own the confirmation dialog (PRD 17).
  async remove(id: string): Promise<void> {
    const db = getDb();
    const floor = await db.floors.get(id);
    await db.transaction("rw", db.floors, db.features, db.connections, async () => {
      const features = await db.features.where("floorId").equals(id).toArray();
      const featureIds = new Set(features.map((f) => f.id));
      await db.features.where("floorId").equals(id).delete();
      for (const fid of featureIds) {
        await db.connections.where("fromFeatureId").equals(fid).delete();
        await db.connections.where("toFeatureId").equals(fid).delete();
      }
      await db.floors.delete(id);
    });
    if (floor) await touchProject(floor.projectId);
  },

  // PRD 11: `order` (not list position) is the source of truth. Caller sends
  // the full floor list in its new order; orders are renumbered densely.
  async reorder(orderedIds: string[]): Promise<void> {
    const db = getDb();
    const first = orderedIds.length ? await db.floors.get(orderedIds[0]) : undefined;
    if (!first) return;
    await db.transaction("rw", db.floors, async () => {
      // Index iteration order is not insertion order - sort by the current
      // order field so unlisted floors keep their relative position.
      const all = await db.floors.where("projectId").equals(first.projectId).toArray();
      all.sort((a, b) => a.order - b.order);
      const listed = new Set(orderedIds);
      const rest = all.filter((f) => !listed.has(f.id)).map((f) => f.id);
      const finalOrder = [...orderedIds, ...rest];
      for (let i = 0; i < finalOrder.length; i++) {
        const floor = await db.floors.get(finalOrder[i]);
        if (!floor || floor.order === i) continue;
        await db.floors.put(
          parseOrThrow(floorSchema, { ...floor, order: i, updatedAt: Date.now() }),
        );
      }
    });
    await touchProject(first.projectId);
  },

  // PRD 14: applying Set Real Length scales every feature coordinate so the
  // floor's units become real meters. Runs in one transaction with the scale
  // update so a crash mid-way cannot half-rescale a floor (PRD P1).
  async applyCalibration(floorId: string, tracedUnits: number, realMeters: number): Promise<void> {
    const db = getDb();
    const floor = await db.floors.get(floorId);
    if (!floor) return;
    await db.transaction("rw", db.floors, db.features, async () => {
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
    await touchProject(floor.projectId);
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
    await touchProject(feature.projectId);
    return saved;
  },

  // PRD 17: every completed gesture writes within 1s; this is the write.
  async update(id: string, patch: Partial<Feature>): Promise<Feature | undefined> {
    const db = getDb();
    return db
      .transaction("rw", db.features, async () => {
        const existing = await db.features.get(id);
        if (!existing) return undefined;
        const updated = parseOrThrow(featureSchema, {
          ...existing,
          ...patch,
          updatedAt: Date.now(),
        });
        await db.features.put(updated);
        return updated;
      })
      .then(async (result) => {
        if (result) await touchProject(result.projectId);
        return result;
      });
  },

  // Undo/redo re-inserts a feature that may or may not still exist, so this
  // is an upsert with the original id and timestamps preserved (PRD 17).
  async restore(feature: Feature): Promise<void> {
    const db = getDb();
    await db.transaction("rw", db.features, async () => {
      await db.features.put(parseOrThrow(featureSchema, feature));
    });
    await touchProject(feature.projectId);
  },

  async remove(id: string): Promise<void> {
    const db = getDb();
    const feature = await db.features.get(id);
    await db.features.delete(id);
    if (feature) {
      await db.connections.where("fromFeatureId").equals(id).delete();
      await db.connections.where("toFeatureId").equals(id).delete();
      await touchProject(feature.projectId);
    }
  },
};
