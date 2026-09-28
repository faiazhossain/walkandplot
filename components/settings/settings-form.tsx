"use client";

import { useEffect, useState } from "react";
import { HardDrive, Info, Moon, Sun, SunMoon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { DEFAULT_STEP_LENGTH_M } from "@/lib/db/meta-repo";
import { settingsStore, type ThemeSetting } from "@/lib/store/settings";
import { shouldWarnStorage, storageUsage, type StorageUsage } from "@/lib/db/storage-health";

// PRD 26: settings - step length, theme, storage usage, about.

const THEME_OPTIONS: { value: ThemeSetting; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: SunMoon },
];

export function SettingsForm() {
  const theme = settingsStore((s) => s.theme);
  const stepLengthM = settingsStore((s) => s.stepLengthM);
  const setTheme = settingsStore((s) => s.setTheme);
  const setStepLengthM = settingsStore((s) => s.setStepLengthM);

  const [stepInput, setStepInput] = useState(String(stepLengthM));
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);

  // React's documented "adjust state when a prop changes" pattern: follow the
  // store value while the field is not being edited.
  const [lastStoreValue, setLastStoreValue] = useState(stepLengthM);
  if (lastStoreValue !== stepLengthM) {
    setLastStoreValue(stepLengthM);
    setStepInput(String(stepLengthM));
  }

  useEffect(() => {
    void storageUsage()
      .then(setUsage)
      .catch(() => setUsage(null));
    void navigator.storage
      ?.persisted?.()
      .then(setPersisted)
      .catch(() => setPersisted(null));
  }, []);

  function commitStepLength(raw: string) {
    const value = parseFloat(raw);
    if (Number.isFinite(value) && value > 0) {
      void setStepLengthM(value);
    } else {
      setStepInput(String(stepLengthM));
    }
  }

  const warn = shouldWarnStorage(usage);

  return (
    <div className="mt-4 flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Step length</CardTitle>
          <CardDescription>
            Used by the +1 step helper when setting a real length. Your pace, in meters.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="step-length">Meters per step</Label>
              <Input
                id="step-length"
                inputMode="decimal"
                className="w-28"
                value={stepInput}
                onChange={(e) => setStepInput(e.target.value)}
                onBlur={(e) => commitStepLength(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
              />
            </div>
          </div>
          {stepInput !== String(stepLengthM) && (
            <p className="mt-2 text-xs text-muted-foreground">
              Default is {DEFAULT_STEP_LENGTH_M} m.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Theme</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Theme">
            {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
              <Button
                key={value}
                variant={theme === value ? "default" : "outline"}
                role="radio"
                aria-checked={theme === value}
                className="h-12 flex-col gap-1 rounded-lg text-xs"
                onClick={() => void setTheme(value)}
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Storage</CardTitle>
          <CardDescription>Projects live on this device, in your browser.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {usage ? (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <HardDrive className="size-4 text-muted-foreground" aria-hidden />
                  Space used
                </span>
                <span className="font-medium">
                  {formatBytes(usage.usage)} of {formatBytes(usage.quota)}
                </span>
              </div>
              <div
                role="progressbar"
                aria-valuenow={Math.round(usage.usage * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Storage used"
                className="h-2 overflow-hidden rounded-full bg-muted"
              >
                <div
                  className={`h-full rounded-full ${warn ? "bg-amber-500" : "bg-primary"}`}
                  style={{ width: `${Math.min(100, (usage.usage / usage.quota) * 100)}%` }}
                />
              </div>
              {warn && (
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  Storage is getting full. Download backups of your projects to keep them safe.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {persisted === null
                  ? "Persistent storage status unknown."
                  : persisted
                    ? "This browser has been asked to keep your data even when space runs low."
                    : "Back up your projects regularly - this browser may clear old data under pressure."}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Storage information is not available.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>About</CardTitle>
        </CardHeader>
        <CardContent className="flex items-start gap-3 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div>
            <p className="font-medium text-foreground">Walk &amp; Plot</p>
            <p>Walk. Map. Export. Version 2.0 - offline field mapping.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  if (mb >= 1) return `${mb.toFixed(0)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}
