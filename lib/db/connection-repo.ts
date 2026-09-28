import { z } from "zod";
import { getDb } from "@/lib/db/db";
import { newId } from "@/lib/db/id";
import { connectionSchema } from "@/lib/domain/schema";
import type { Connection } from "@/lib/domain/schema";

// PRD 28: connection records ARE the graph; future routing consumes them
// directly. lib/db is the only module that knows IndexedDB exists.

export interface CreateConnectionInput {
  projectId: string;
  fromFeatureId: string;
  toFeatureId: string;
  kind: Connection["kind"];
}

function parseOrThrow(value: unknown): Connection {
  const result = connectionSchema.safeParse(value);
  if (!result.success) throw new z.ZodError(result.error.issues);
  return result.data;
}

export const connectionRepo = {
  async listByProject(projectId: string): Promise<Connection[]> {
    return getDb().connections.where("projectId").equals(projectId).toArray();
  },

  async listByFeature(featureId: string): Promise<Connection[]> {
    const db = getDb();
    const [from, to] = await Promise.all([
      db.connections.where("fromFeatureId").equals(featureId).toArray(),
      db.connections.where("toFeatureId").equals(featureId).toArray(),
    ]);
    return [...from, ...to];
  },

  async create(input: CreateConnectionInput): Promise<Connection> {
    const record = parseOrThrow({
      id: newId(),
      projectId: input.projectId,
      fromFeatureId: input.fromFeatureId,
      toFeatureId: input.toFeatureId,
      kind: input.kind,
      createdAt: Date.now(),
    });
    // Idempotent for undo/redo: identical records never duplicate.
    const existing = await getDb().connections.get(record.id);
    if (existing) return existing;
    await getDb().connections.add(record);
    return record;
  },

  // Undo/redo re-inserts a connection that may or may not still exist.
  async restore(record: Connection): Promise<void> {
    await getDb().connections.put(parseOrThrow(record));
  },

  async remove(id: string): Promise<void> {
    await getDb().connections.delete(id);
  },

  /** Direct put for seed/import paths; validates like every write. */
  async put(record: Connection): Promise<void> {
    await getDb().connections.put(parseOrThrow(record));
  },
};
