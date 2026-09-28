import { describe, expect, it } from "vitest";
import { calibrationMultiplier, formatLength } from "@/lib/domain/units";

describe("formatLength", () => {
  it("shows meters only when the floor is calibrated", () => {
    const calibrated = { calibrated: true, metersPerUnit: 0.5 };
    expect(formatLength(12.34, calibrated)).toBe("12.3 m");
    expect(formatLength(12.34, null)).toBe("12.3 units");
  });

  it("never labels uncalibrated floors as meters (AC-03)", () => {
    expect(formatLength(4, { calibrated: false, metersPerUnit: 1 })).toBe("4.0 units");
  });

  it("exports real meters via the calibration multiplier", () => {
    expect(calibrationMultiplier({ calibrated: true, metersPerUnit: 0.5 })).toBe(0.5);
    expect(calibrationMultiplier(null)).toBe(1);
  });
});
