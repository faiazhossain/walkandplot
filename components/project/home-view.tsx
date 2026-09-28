"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import {
  AlertCircle,
  ChevronRight,
  CopyPlus,
  Ellipsis,
  Map as MapIcon,
  Plus,
  Settings,
  Trash2,
} from "lucide-react";
import { AppBar } from "@/components/common/app-bar";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { MapThumbnail } from "@/components/common/map-thumbnail";
import { FirstRunHero } from "@/components/project/first-run-hero";
import { InstallBanner } from "@/components/common/install-banner";
import { QuotaBanner } from "@/components/common/quota-banner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { projectRepo, type ProjectSummary } from "@/lib/db/repositories";
import { exportProjectBackup } from "@/lib/backup/export";
import { downloadJson } from "@/lib/backup/filename";
import { importProjectBackup, ImportRejectedError } from "@/lib/backup/import";
import { relativeTime } from "@/lib/utils/relative-time";

// PRD 9: returning users land on the project list; first-run users see the
// intro hero. Everything on this screen is local - no account, no network.

export function HomeView() {
  const router = useRouter();
  // useLiveQuery stays undefined until the first query resolves.
  const summaries = useLiveQuery(() => projectRepo.listSummaries(), []);

  if (summaries === undefined) {
    // PRD 24: no spinner without text.
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading your projects...</p>
      </div>
    );
  }

  if (summaries.length === 0) {
    return <FirstRunHero />;
  }

  return (
    <div className="flex flex-1 flex-col">
      <AppBar
        title="My Projects"
        subtitle="No account - everything on this device"
        right={
          <>
            <ImportBackupButton onImported={(id) => router.push(`/projects/view?id=${id}`)} />
            <Button
              variant="ghost"
              size="icon-lg"
              aria-label="Settings"
              render={<Link href="/settings" />}
            >
              <Settings className="size-5" aria-hidden />
            </Button>
          </>
        }
      />
      {summaries === undefined ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">Loading your projects...</p>
        </div>
      ) : (
        <div className="mx-auto w-full max-w-md flex-1 px-4 pt-4 pb-10">
          <Button
            render={<Link href="/projects/new" />}
            className="h-12 w-full rounded-lg text-base"
          >
            <Plus className="size-5" aria-hidden />
            New Project
          </Button>

          <h2 className="mt-6 text-xs font-bold tracking-[0.14em] text-muted-foreground uppercase">
            Your projects
          </h2>
          <ul className="mt-2 flex flex-col gap-2">
            {summaries.map((s) => (
              <ProjectRow key={s.project.id} summary={s} />
            ))}
          </ul>

          <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
            Projects are stored locally on this device.
            <br />
            Download a backup file to keep them safe.
          </p>
        </div>
      )}
    </div>
  );
}

function ProjectRow({ summary }: { summary: ProjectSummary }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { project, floors, features, featureCountByFloor } = summary;

  const floorCount = floors.length;
  const mappedCount = floors.filter((f) => (featureCountByFloor.get(f.id) ?? 0) > 0).length;
  const thumbFeatures = pickThumbFeatures(floors, featureCountByFloor, features);

  async function downloadBackup() {
    const backup = await exportProjectBackup(project.id);
    downloadJson(backup.filename, backup.json);
  }

  async function deleteProject() {
    await projectRepo.remove(project.id);
  }

  return (
    <li>
      <div className="flex items-stretch overflow-hidden rounded-xl border bg-card transition-colors hover:bg-muted/40">
        <Link
          href={`/projects/view?id=${project.id}`}
          className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3"
        >
          <span className="grid size-13 shrink-0 place-items-center rounded-lg bg-primary/5 text-primary">
            {thumbFeatures.length > 0 ? (
              <MapThumbnail features={thumbFeatures} className="size-11" />
            ) : (
              <MapIcon className="size-5 text-muted-foreground" aria-hidden />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{project.name}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {floorCount} floor{floorCount === 1 ? "" : "s"} - {mappedCount} mapped - edited{" "}
              {relativeTime(project.updatedAt)}
            </span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </Link>
        <Button
          variant="ghost"
          size="icon-lg"
          className="my-auto mr-1 shrink-0"
          aria-label={`More actions for ${project.name}`}
          onClick={() => setMenuOpen(true)}
        >
          <Ellipsis className="size-5" aria-hidden />
        </Button>
      </div>

      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogContent showCloseButton={false} className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="truncate">{project.name}</DialogTitle>
            <DialogDescription>Project actions</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1">
            <MenuAction
              icon={CopyPlus}
              label="Download Backup"
              onClick={() => {
                setMenuOpen(false);
                void downloadBackup();
              }}
            />
            <MenuAction
              icon={Trash2}
              label="Delete Project"
              destructive
              onClick={() => {
                setMenuOpen(false);
                setDeleteOpen(true);
              }}
            />
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete ${project.name}?`}
        description="This removes the project and all of its floors from this device. It cannot be undone."
        confirmLabel="Delete project"
        destructive
        typedConfirmation={
          mappedCount > 0
            ? {
                target: project.name,
                label: "This project has mapped floors. Type DELETE to confirm",
              }
            : undefined
        }
        onConfirm={deleteProject}
      >
        <button
          type="button"
          className="text-sm font-medium text-primary underline-offset-2 hover:underline"
          onClick={() => void downloadBackup().catch(() => undefined)}
        >
          Download a backup first
        </button>
      </ConfirmDialog>
    </li>
  );
}

function MenuAction({
  icon: Icon,
  label,
  destructive = false,
  onClick,
}: {
  icon: typeof CopyPlus;
  label: string;
  destructive?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant="ghost"
      className={`h-12 justify-start px-3 text-sm ${
        destructive ? "text-destructive hover:bg-destructive/10 hover:text-destructive" : ""
      }`}
      onClick={onClick}
    >
      <Icon className="size-4" aria-hidden />
      {label}
    </Button>
  );
}

function ImportBackupButton({ onImported }: { onImported: (projectId: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    try {
      const text = await file.text();
      const projectId = await importProjectBackup(text);
      onImported(projectId);
    } catch (err) {
      // PRD 32: plain language, one next action, no dead end.
      setError(
        err instanceof ImportRejectedError
          ? err.message
          : "That file could not be imported. Check that it is a Walk & Plot backup and try again.",
      );
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon-lg"
        aria-label="Import backup"
        onClick={() => inputRef.current?.click()}
      >
        <CopyPlus className="size-5" aria-hidden />
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json,.walkandplot.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = "";
        }}
      />
      {error && (
        <div
          role="alert"
          className="fixed inset-x-4 bottom-4 z-40 flex items-start gap-2 rounded-xl border border-destructive/30 bg-card p-4 text-sm shadow-lg"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          <span className="flex-1">{error}</span>
          <Button variant="ghost" size="sm" onClick={() => setError(null)}>
            Dismiss
          </Button>
        </div>
      )}
    </>
  );
}

// Thumbnail source: the floor with the most features, like the prototype.
function pickThumbFeatures(
  floors: ProjectSummary["floors"],
  countByFloor: Map<string, number>,
  features: ProjectSummary["features"],
) {
  let bestFloor: string | null = null;
  let bestCount = 0;
  for (const f of floors) {
    const c = countByFloor.get(f.id) ?? 0;
    if (c > bestCount) {
      bestCount = c;
      bestFloor = f.id;
    }
  }
  if (!bestFloor) return [];
  return features.filter((f) => f.floorId === bestFloor);
}
