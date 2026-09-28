"use client";

import { useEffect, useState } from "react";
import { HardDriveDownload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { shouldWarnStorage, storageUsage, type StorageUsage } from "@/lib/db/storage-health";

// PRD 29: non-blocking storage health warning above 80% usage, checked on
// app start and workspace entry. Shows what happened and one next action
// (download backups) without ever interrupting plotting (PRD 32).

export function QuotaBanner() {
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    void storageUsage()
      .then((u) => {
        if (shouldWarnStorage(u)) setUsage(u);
      })
      .catch(() => undefined);
  }, []);

  if (!usage || dismissed) return null;

  return (
    <div
      role="status"
      className="mb-4 flex items-center gap-3 rounded-xl border border-amber-300/60 bg-amber-50 p-3 text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-200"
    >
      <HardDriveDownload className="size-5 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 text-sm">
        Storage is getting full ({percent(usage)}% used). Download backups of your
        projects so nothing is lost if the browser clears space.
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Dismiss storage warning"
        className="shrink-0"
        onClick={() => setDismissed(true)}
      >
        <span aria-hidden className="text-base leading-none">
          ×
        </span>
      </Button>
    </div>
  );
}

function percent(usage: StorageUsage): number {
  return Math.min(100, Math.round((usage.usage / usage.quota) * 100));
}
