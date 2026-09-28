// PRD 14 / AC-03: calibrated floors show real meters; uncalibrated floors
// honestly say "units" and never claim meters.

export type FloorScale = {
  calibrated: boolean;
  metersPerUnit: number;
} | null;

export function formatLength(units: number, scale: FloorScale): string {
  const rounded = Math.round(units * 10) / 10;
  if (scale?.calibrated) {
    return `${rounded.toFixed(1)} m`;
  }
  return `${rounded.toFixed(1)} units`;
}

// Export multiplies local coordinates by this so calibrated floors export
// real meters (PRD 22 coordinate honesty).
export function calibrationMultiplier(scale: FloorScale): number {
  return scale?.calibrated ? scale.metersPerUnit : 1;
}
