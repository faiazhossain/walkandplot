"use client";

import { retryLastFailedSave, useSaveStateStore } from "@/lib/store/save-state";

// PRD 17: the save dot beside the floor name - Saved (green, default),
// Saving, and an error state that offers Retry now (PRD 32).

export function SaveIndicator() {
  const status = useSaveStateStore((s) => s.status);

  if (status === "saved") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
        <span className="size-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400" aria-hidden />
        Saved
      </span>
    );
  }
  if (status === "saving") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground" aria-hidden />
        Saving
      </span>
    );
  }
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1.5 rounded-md text-xs font-semibold text-destructive underline-offset-2 hover:underline"
      onClick={() => retryLastFailedSave()}
    >
      <span className="size-1.5 rounded-full bg-destructive" aria-hidden />
      Not saved - tap to retry
    </button>
  );
}
