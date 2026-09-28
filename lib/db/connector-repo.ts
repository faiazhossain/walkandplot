import { getDb } from "@/lib/db/db";
import { newId } from "@/lib/db/id";
import { featureRepo, floorRepo } from "@/lib/db/repositories";
import { connectionRepo } from "@/lib/db/connection-repo";
import type { Connection, Feature } from "@/lib/domain/schema";

// PRD 18 vertical connectors: stairs, lifts and escalators are navigation
// connections. Linking creates a twin point on the target floor (shared
// connectorGroupId) plus one connection record, so each floor's export stays
// self-describing and the graph is ready for future routing.

export type ConnectorDirection = "up" | "down" | "both";

export const CONNECTOR_SUBTYPES = ["stairs", "lift", "escalator"] as const;
export type ConnectorSubtype = (typeof CONNECTOR_SUBTYPES)[number];

export function isConnectorSubtype(subtype: string): subtype is ConnectorSubtype {
  return (CONNECTOR_SUBTYPES as readonly string[]).includes(subtype);
}

export function connectorConnectionKind(subtype: string): Connection["kind"] {
  return subtype === "stairs" ? "stair" : subtype === "lift" ? "lift" : "escalator";
}

export interface LinkFloorsInput {
  feature: Feature;
  /** Floor the connector sits on (the feature's own floor). */
  direction: ConnectorDirection;
  targetFloorId?: string;
  /** Forward declaration (PRD 18): create the floor, then link to it. */
  newFloorName?: string;
}

export interface LinkResult {
  twin: Feature;
  connection: Connection;
  floorName: string;
}

export const connectorRepo = {
  /** The twin point of this connector on the other floor, if linked. */
  async findTwin(feature: Feature): Promise<Feature | undefined> {
    if (!feature.connectorGroupId) return undefined;
    const db = getDb();
    const siblings = await db.features
      .where("projectId")
      .equals(feature.projectId)
      .filter((f) => f.connectorGroupId === feature.connectorGroupId && f.id !== feature.id)
      .toArray();
    return siblings[0];
  },

  async linkFloors({
    feature,
    direction,
    targetFloorId,
    newFloorName,
  }: LinkFloorsInput): Promise<LinkResult> {
    const db = getDb();
    const floor =
      targetFloorId !== undefined
        ? await floorRepo.get(targetFloorId)
        : await floorRepo.create({
            projectId: feature.projectId,
            displayName: newFloorName?.trim() || "New floor",
          });
    if (!floor) throw new Error("Target floor not found");
    if (floor.id === feature.floorId) throw new Error("A connector cannot link a floor to itself");
    // Connectors are point places; polygon connectors do not exist.
    if (feature.geometry.type !== "Point") throw new Error("Only point places can link floors");

    const connectorGroupId = feature.connectorGroupId ?? newId();

    // A previous link (re-linking) is replaced, never duplicated.
    const previousTwin = await this.findTwin({ ...feature, connectorGroupId });
    const previousConnections = previousTwin
      ? (await connectionRepo.listByFeature(feature.id)).filter(
          (c) => c.fromFeatureId === previousTwin.id || c.toFeatureId === previousTwin.id,
        )
      : [];

    const coords: [number, number] = feature.geometry.coordinates;
    const twin = await featureRepo.create({
      id: newId(),
      projectId: feature.projectId,
      floorId: floor.id,
      type: "place",
      subtype: feature.subtype,
      name: feature.name,
      geometry: { type: "Point", coordinates: coords },
      access: feature.access,
      status: "active",
      confidence: feature.confidence,
      props: { direction, fromFloor: floor.id, toFloor: feature.floorId },
      connectorGroupId,
    });

    const connection = await connectionRepo.create({
      projectId: feature.projectId,
      fromFeatureId: feature.id,
      toFeatureId: twin.id,
      kind: connectorConnectionKind(feature.subtype),
    });

    await featureRepo.update(feature.id, {
      connectorGroupId,
      props: { ...(feature.props ?? {}), direction, fromFloor: feature.floorId, toFloor: floor.id },
    });

    if (previousTwin && previousConnections.length) {
      await db.transaction("rw", db.features, db.connections, async () => {
        await db.features.delete(previousTwin.id);
        for (const c of previousConnections) await db.connections.delete(c.id);
      });
    }

    return { twin, connection, floorName: floor.displayName };
  },

  async unlink(featureRef: Feature): Promise<void> {
    // Re-read: the caller's snapshot may predate the link itself.
    const feature = await getDb().features.get(featureRef.id);
    if (!feature?.connectorGroupId) return;
    const twin = await this.findTwin(feature);
    const db = getDb();
    if (twin) {
      await db.transaction("rw", db.features, db.connections, async () => {
        await db.features.delete(twin.id);
        for (const c of await connectionRepo.listByFeature(twin.id)) {
          await db.connections.delete(c.id);
        }
      });
    }
    const props = { ...(feature.props ?? {}) };
    delete props.fromFloor;
    delete props.toFloor;
    await featureRepo.update(feature.id, {
      connectorGroupId: undefined,
      props: Object.keys(props).length ? props : undefined,
    });
  },
};
