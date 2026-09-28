// PRD 13: subtle grid behind the geometry, density adapts to zoom. Grid steps
// use 1/2/5 progressions so screen spacing stays legible at every zoom level.

const NICE_STEPS = [
  0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000,
];

/**
 * World-unit grid step that renders at a comfortable on-screen spacing.
 * @param worldPerPx floor units per screen pixel at the current zoom
 * @param targetPx preferred on-screen spacing range
 */
export function gridStepForZoom(
  worldPerPx: number,
  targetPx: { min: number; max: number } = { min: 36, max: 96 },
): number {
  if (!Number.isFinite(worldPerPx) || worldPerPx <= 0) return 10;
  for (const step of NICE_STEPS) {
    const px = step / worldPerPx;
    if (px >= targetPx.min) return step;
  }
  // Beyond the table: keep multiplying by 10.
  const coarsest = NICE_STEPS[NICE_STEPS.length - 1];
  const factor = Math.pow(10, Math.ceil(Math.log10((worldPerPx * targetPx.min) / coarsest)));
  return coarsest * factor;
}
