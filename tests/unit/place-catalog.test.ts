import { describe, expect, it } from "vitest";
import {
  getPlaceType,
  PATH_SUBTYPES,
  PLACE_TYPES,
  retypableKeys,
  typeLabel,
} from "@/lib/config/place-types";
import { scaledDimensions } from "@/lib/utils/photo";

// PRD 21: the catalog is the data-driven source of truth. PRD 34: photo
// downscale math.

describe("place type catalog (PRD 16/21)", () => {
  it("has unique keys, labels, icons and a capture kind", () => {
    const keys = new Set(PLACE_TYPES.map((t) => t.key));
    expect(keys.size).toBe(PLACE_TYPES.length);
    for (const t of PLACE_TYPES) {
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.icon).toBeTruthy();
      expect(["point", "polygon"]).toContain(t.capture);
      expect(Array.isArray(t.fields)).toBe(true);
    }
  });

  it("covers the nine first-class types (PRD 16)", () => {
    for (const key of [
      "shop",
      "room",
      "restaurant",
      "toilet",
      "stairs",
      "lift",
      "entrance",
      "escalator",
      "other",
    ]) {
      expect(getPlaceType(key), key).toBeDefined();
    }
  });

  it("matches the PRD 21 conditional-field matrix", () => {
    const fieldKeys = (key: string) => (getPlaceType(key)?.fields ?? []).map((f) => f.key);
    expect(fieldKeys("shop")).toContain("shopNumber");
    expect(fieldKeys("toilet")).toContain("gender");
    expect(fieldKeys("stairs")).toContain("direction");
    expect(fieldKeys("lift")).toContain("kind");
    expect(fieldKeys("entrance")).toContain("kind");
    expect(fieldKeys("escalator")).toContain("direction");
    expect(fieldKeys("open_area")).toEqual(["notes"]);
    // Access is exported as an enum, never stored in props.
    expect(fieldKeys("shop")).not.toContain("props-access");
  });

  it("keeps geometry consistent: areas are polygons, markers are points", () => {
    for (const key of ["shop", "room", "restaurant", "office", "storage", "open_area"]) {
      expect(getPlaceType(key)?.capture, key).toBe("polygon");
    }
    for (const key of ["toilet", "stairs", "lift", "entrance", "escalator", "other"]) {
      expect(getPlaceType(key)?.capture, key).toBe("point");
    }
  });

  it("offers retype within the same capture kind (PRD 17)", () => {
    const pointKeys = retypableKeys("point");
    expect(pointKeys).toContain("toilet");
    expect(pointKeys).not.toContain("shop");
    const polygonKeys = retypableKeys("polygon");
    expect(polygonKeys).toContain("shop");
    expect(polygonKeys).not.toContain("toilet");
  });

  it("labels path subtypes in plain language (PRD 5)", () => {
    expect(PATH_SUBTYPES.map((s) => s.value)).toEqual(["corridor", "hallway", "ramp"]);
    expect(typeLabel("corridor")).toBe("Corridor");
    expect(typeLabel("hallway")).toBe("Hallway");
    expect(typeLabel("ramp")).toBe("Ramp");
    expect(typeLabel("shop")).toBe("Shop");
    expect(typeLabel("mystery")).toBe("mystery");
  });
});

describe("photo downscale math (PRD 34)", () => {
  it("shrinks the longest edge to the cap", () => {
    expect(scaledDimensions(4000, 3000, 1280)).toEqual({ width: 1280, height: 960 });
    expect(scaledDimensions(3000, 4000, 1280)).toEqual({ width: 960, height: 1280 });
  });

  it("never upscales small photos", () => {
    expect(scaledDimensions(800, 600, 1280)).toEqual({ width: 800, height: 600 });
    expect(scaledDimensions(1280, 1280, 1280)).toEqual({ width: 1280, height: 1280 });
  });

  it("survives degenerate input", () => {
    expect(scaledDimensions(0, 0, 1280)).toEqual({ width: 0, height: 0 });
  });
});
