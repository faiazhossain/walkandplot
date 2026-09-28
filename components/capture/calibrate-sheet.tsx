"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Footprints, PencilLine, Route } from "lucide-react";
import { Dialog, DialogTitle, SheetContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Feature, Floor } from "@/lib/domain/schema";
import {
  checkCalibrationInput,
  pickableLines,
  stepsToMeters,
} from "@/lib/domain/calibration";
import { formatLength } from "@/lib/domain/units";
import { floorRepo } from "@/lib/db/repositories";
import { runSave } from "@/lib/store/save-state";
import { settingsStore } from "@/lib/store/settings";

// PRD 14: Set Real Length - trace a known wall or pick an existing line,
// type the real length or step it off, apply: the whole floor rescales and
// every measurement becomes real meters (AC-03). Never blocks mapping.

export type CalibrateStage =
  | { kind: "idle" }
  | { kind: "sheet"; tracedUnits: number | null }
  | { kind: "trace" };

interface CalibrateSheetProps {
  open: boolean;
  floor: Floor;
  features: Feature[];
  tracedUnits: number | null;
  onOpenChange: (open: boolean) => void;
  /** Switches the workspace into two-tap trace mode (canvas takes over). */
  onStartTrace: () => void;
  onApplied: () => void;
}

export function CalibrateSheet({
  open,
  floor,
  features,
  tracedUnits,
  onOpenChange,
  onStartTrace,
  onApplied,
}: CalibrateSheetProps) {
  const lines = useMemo(() => pickableLines(features), [features]);
  const stepLengthM = settingsStore((s) => s.stepLengthM);

  const [selected, setSelected] = useState<string | null>(null);
  const [lengthInput, setLengthInput] = useState("");
  const [stepCount, setStepCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedLine = lines.find((l) => l.featureId === selected) ?? null;
  const effectiveTraced = tracedUnits ?? selectedLine?.lengthUnits ?? 0;

  function bumpStep() {
    const count = stepCount + 1;
    setStepCount(count);
    setLengthInput(stepsToMeters(count, stepLengthM).toFixed(2));
  }

  async function apply() {
    const realMeters = parseFloat(lengthInput);
    const check = checkCalibrationInput(effectiveTraced, realMeters);
    if (!check.ok) {
      setError(check.reason ?? "Enter the real length.");
      return;
    }
    setBusy(true);
    setError(null);
    const ok = await runSave(async () => {
      await floorRepo.applyCalibration(floor.id, effectiveTraced, realMeters);
    });
    setBusy(false);
    if (!ok) {
      setError("The floor could not be rescaled. Nothing was changed - try again.");
      return;
    }
    setLengthInput("");
    setStepCount(0);
    setSelected(null);
    onApplied();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <DialogTitle className="font-heading text-base font-semibold">
          Set Real Length
        </DialogTitle>
        <p className="text-xs text-muted-foreground">
          Trace a wall you know, or pick an existing line. The whole floor
          rescales so lengths become real meters.
        </p>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label>1. The known line</Label>
          </div>
          <Button variant="outline" className="h-12 justify-start" onClick={onStartTrace}>
            <PencilLine className="size-4" aria-hidden />
            Trace it on the map
            {tracedUnits !== null && (
              <span className="ml-auto text-xs font-semibold text-primary">
                {formatLength(tracedUnits, floor.scale)}
              </span>
            )}
          </Button>
          {lines.length > 0 && (
            <div className="flex max-h-36 flex-col gap-1 overflow-y-auto">
              {lines.map((line) => (
                <button
                  key={line.featureId}
                  type="button"
                  aria-pressed={selected === line.featureId}
                  onClick={() => {
                    setSelected(line.featureId);
                    setTracedUnitsCleared();
                  }}
                  className={`flex h-11 items-center gap-2 rounded-lg border px-3 text-left text-sm ${
                    selected === line.featureId
                      ? "border-primary bg-primary/10"
                      : "border-border bg-card"
                  }`}
                >
                  <Route className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">
                    {line.name ?? "Untitled line"}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatLength(line.lengthUnits, floor.scale)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="real-length">2. Its real length (meters)</Label>
          <div className="flex items-center gap-2">
            <Input
              id="real-length"
              inputMode="decimal"
              className="h-12 flex-1"
              placeholder="e.g. 12.5"
              value={lengthInput}
              onChange={(e) => setLengthInput(e.target.value)}
              autoComplete="off"
            />
            <Button
              type="button"
              variant="outline"
              className="h-12 shrink-0 gap-1.5"
              onClick={bumpStep}
              aria-label="Count one step"
            >
              <Footprints className="size-4" aria-hidden />
              + 1 step
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {stepCount > 0
              ? `${stepCount} step${stepCount === 1 ? "" : "s"} = ${stepsToMeters(stepCount, stepLengthM).toFixed(2)} m at your ${stepLengthM} m pace.`
              : `Or count steps - each counts as your ${stepLengthM} m pace (Settings).`}
          </p>
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        {/* Bottom-anchored primary action (PRD 24) */}
        <Button
          className="h-12 w-full rounded-lg text-base"
          disabled={busy || !effectiveTraced || !lengthInput}
          onClick={() => void apply()}
        >
          {busy ? "Applying..." : "Apply to Floor"}
        </Button>
      </SheetContent>
    </Dialog>
  );

  function setTracedUnitsCleared() {
    // Picking a line supersedes a previous manual trace.
    setLengthInput("");
    setStepCount(0);
  }
}
