import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { WalkAndPlotDB, getDb, setDb } from "@/lib/db/db";
import { featureRepo, floorRepo, projectRepo } from "@/lib/db/repositories";

// PRD 16/17/21: detail-sheet edits - name, props (conditional fields), retype,
// photo-in-props - round-trip through the repo with validation and history
// support (restore returns the pre-edit record).

function freshDb(): WalkAndPlotDB {
  const db = new WalkAndPlotDB(`test-${crypto.randomUUID()}`);
  setDb(db);
  return db;
}

async function seedPlace(subtype: string, geometry: Parameters<typeof featureRepo.create>[0]["geometry"]) {
  freshDb();
  const { project, floor } = await projectRepo.create({ name: "Mall" });
  void floor;
  const floorId = (await floorRepo.listByProject(project.id))[0].id;
  return featureRepo.create({
    id: crypto.randomUUID(),
    projectId: project.id,
    floorId,
    type: "place",
    subtype,
    geometry,
    access: "public",
    status: "active",
    confidence: "high",
  });
}

const point = { type: "Point" as const, coordinates: [5, 5] as [number, number] };
const polygon = {
  type: "Polygon" as const,
  coordinates: [
    [
      [0, 0],
      [4, 0],
      [4, 3],
    ] as [number, number][],
  ],
};

describe("detail sheet edits", () => {
  it("saves name, number and access for a shop (PRD 21)", async () => {
    const shop = await seedPlace("shop", polygon);
    await featureRepo.update(shop.id, {
      name: "ABC Fashion",
      access: "public",
      props: { shopNumber: "304" },
    });
    const saved = await getDb().features.get(shop.id);
    expect(saved?.name).toBe("ABC Fashion");
    expect(saved?.props).toEqual({ shopNumber: "304" });
    expect(saved?.access).toBe("public");
  });

  it("retypes a place within its capture kind", async () => {
    const place = await seedPlace("restaurant", polygon);
    await featureRepo.update(place.id, { subtype: "office" });
    expect((await getDb().features.get(place.id))?.subtype).toBe("office");
  });

  it("stores the photo data URI in props and removes it cleanly (PRD 34)", async () => {
    const toilet = await seedPlace("toilet", point);
    const uri = "data:image/jpeg;base64,fake";
    await featureRepo.update(toilet.id, { props: { photo: uri } });
    expect((await getDb().features.get(toilet.id))?.props?.photo).toBe(uri);
    await featureRepo.update(toilet.id, { props: undefined });
    expect((await getDb().features.get(toilet.id))?.props).toBeUndefined();
  });

  it("rejects an invalid polygon edit loudly (PRD 28)", async () => {
    const place = await seedPlace("room", polygon);
    await expect(
      featureRepo.update(place.id, {
        geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 1]] as [number, number][]] },
      }),
    ).rejects.toThrow();
    // The stored record is untouched by the failed write.
    expect((await getDb().features.get(place.id))?.geometry).toEqual(polygon);
  });
});
