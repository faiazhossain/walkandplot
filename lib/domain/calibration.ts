import { dist, type Point } from "@/lib/domain/geometry";
import type { Feature } from "@/lib/domain/schema";
import type { FloorScale } from "@/lib/domain/units";

// PRD 14: calibration is one interaction, not sensors. Pure math only.

/** PRD 14 step-count helper: taps times the user's step length. */
export function stepsToMeters(stepCount: number, stepLengthM: number): number {
  if (!Number.isFinite(stepCount) || stepCount <= 0) return 0;
  if (!Number.isFinite(stepLengthM) || stepLengthM <= 0) return 0;
  return stepCount * stepLengthM;
}

export interface PickableLine {
  featureId: string;
  name?: string;
  subtype: string;
  /** Length in current floor units (meters once calibrated, AC-03). */
  lengthUnits: number;
}

/** Existing paths the mapper can calibrate against, longest first. */
export function pickableLines(features: Feature[]): PickableLine[] {
  const lines: PickableLine[] = [];
  for (const f of features) {
    if (f.geometry.type !== "LineString") continue;
    let length = 0;
    for (let i = 1; i < f.geometry.coordinates.length; i++) {
      length += dist(
        { x: f.geometry.coordinates[i - 1][0], y: f.geometry.coordinates[i - 1][1] },
        { x: f.geometry.coordinates[i][0], y: f.geometry.coordinates[i][1] },
      );
    }
    lines.push({ featureId: f.id, name: f.name, subtype: f.subtype, lengthUnits: length });
  }
  return lines.sort((a, b) => b.lengthUnits - a.lengthUnits);
}

export interface CalibrationCheck {
  ok: boolean;
  reason?: string;
}

/** PRD 14: derived metersPerUnit = realMeters / tracedUnits; both must be positive. */
export function checkCalibrationInput(tracedUnits: number, realMeters: number): CalibrationCheck {
  if (!Number.isFinite(tracedUnits) || tracedUnits <= 0) {
    return { ok: false, reason: "Trace or pick a line first." };
  }
  if (!Number.isFinite(realMeters) || realMeters <= 0) {
    return { ok: false, reason: "Enter the real length in meters." };
  }
  return { ok: true };
}

/** Preview of what a coordinate becomes after applying the calibration. */
export function previewRescale(point: Point, tracedUnits: number, realMeters: number): Point {
  const mult = realMeters / tracedUnits;
  return { x: point.x * mult, y: point.y * mult };
}

/** PRD 14: the unit chip's honest label - meters only when calibrated. */
export function unitLabel(scale: FloorScale): "m" | "units" {
  return scale?.calibrated ? "m" : "units";
}
