import { describe, expect, it } from "vitest";
import {
  checkCalibrationInput,
  pickableLines,
  previewRescale,
  stepsToMeters,
  unitLabel,
} from "@/lib/domain/calibration";
import type { Feature } from "@/lib/domain/schema";

// PRD 14: calibration math - step counting, pickable lines, rescale preview.

function makeFeature(partial: Partial<Feature> & { id: string; geometry: Feature["geometry"] }): Feature {
  return {
    projectId: "p1",
    floorId: "f1",
    type: "path",
    subtype: "corridor",
    access: "public",
    status: "active",
    confidence: "high",
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  } as Feature;
}

const line = (pts: [number, number][]): {
  type: "LineString";
  coordinates: [number, number][];
} => ({ type: "LineString", coordinates: pts });

describe("stepsToMeters (PRD 14 step-count helper)", () => {
  it("multiplies steps by the user's pace", () => {
    expect(stepsToMeters(12, 0.75)).toBeCloseTo(9);
    expect(stepsToMeters(1, 0.8)).toBeCloseTo(0.8);
  });

  it("refuses nonsense input", () => {
    expect(stepsToMeters(0, 0.75)).toBe(0);
    expect(stepsToMeters(-3, 0.75)).toBe(0);
    expect(stepsToMeters(5, 0)).toBe(0);
    expect(stepsToMeters(Number.NaN, 0.75)).toBe(0);
  });
});

describe("pickableLines (PRD 14: pick an existing line)", () => {
  it("lists lines with lengths, longest first, ignoring other geometry", () => {
    const short = makeFeature({
      id: "short",
      name: "Short wall",
      geometry: line([
        [0, 0],
        [3, 0],
      ]),
    });
    const long = makeFeature({
      id: "long",
      subtype: "hallway",
      geometry: line([
        [0, 0],
        [0, 12],
      ]),
    });
    const point = makeFeature({ id: "pt", geometry: { type: "Point", coordinates: [1, 1] } });
    const polygon = makeFeature({
      id: "pg",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [2, 0],
            [2, 2],
          ] as [number, number][],
        ],
      },
    });
    const lines = pickableLines([point, polygon, short, long]);
    expect(lines.map((l) => l.featureId)).toEqual(["long", "short"]);
    expect(lines[0].lengthUnits).toBeCloseTo(12);
    expect(lines[1].lengthUnits).toBeCloseTo(3);
  });
});

describe("checkCalibrationInput (PRD 14 / AC-03)", () => {
  it("requires a traced line and a positive real length", () => {
    expect(checkCalibrationInput(0, 12.5).reason).toMatch(/Trace or pick/);
    expect(checkCalibrationInput(5, 0).reason).toMatch(/real length/);
    expect(checkCalibrationInput(5, Number.NaN).ok).toBe(false);
    expect(checkCalibrationInput(2, 12.5).ok).toBe(true);
  });
});

describe("previewRescale", () => {
  it("scales coordinates by real/traced", () => {
    const p = previewRescale({ x: 2, y: 4 }, 2, 12.5);
    expect(p.x).toBeCloseTo(12.5);
    expect(p.y).toBeCloseTo(25);
  });
});

describe("unitLabel (PRD 14 coordinate honesty)", () => {
  it("never claims meters for uncalibrated floors", () => {
    expect(unitLabel(null)).toBe("units");
    expect(unitLabel({ calibrated: false, metersPerUnit: 1 })).toBe("units");
    expect(unitLabel({ calibrated: true, metersPerUnit: 1 })).toBe("m");
  });
});
