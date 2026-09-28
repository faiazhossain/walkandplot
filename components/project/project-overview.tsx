"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import {
  AlertTriangle,
  Building2,
  CopyPlus,
  Ellipsis,
  FileDown,
  Layers,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { AppBar } from "@/components/common/app-bar";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FloorList, StatusChip, type FloorRowData } from "@/components/floor/floor-list";
import type { Floor } from "@/lib/domain/schema";
import { floorRepo, projectRepo } from "@/lib/db/repositories";
import { metaRepo, shouldRemindBackup } from "@/lib/db/meta-repo";
import { exportProjectBackup } from "@/lib/backup/export";
import { downloadJson } from "@/lib/backup/filename";
import { downloadFloorGeoJSON, downloadProjectGeoJSON } from "@/lib/geojson/export-service";

// PRD 9 Step 2 / PRD 26: project overview - floors, backup, delete. Reachable
// at /projects/view?id=<projectId>. Deviation from PRD 26's
// /projects/[projectId]: static export cannot prerender runtime UUIDs, so
// detail screens take the id as a query param.

export function ProjectOverview() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("id");

  // undefined = still loading; null = project does not exist.
  const bundle = useLiveQuery(
    () =>
      projectId ? projectRepo.getBundle(projectId).then((b) => b ?? null) : Promise.resolve(null),
    [projectId],
  );
  const backupMeta = useLiveQuery(
    () =>
      projectId
        ? Promise.all([
            metaRepo.getLastBackupAt(projectId),
            metaRepo.isBackupReminderDismissed(projectId),
          ]).then(([last, dismissed]) => ({ last, dismissed }))
        : Promise.resolve(undefined),
    [projectId],
  );

  const [menuOpen, setMenuOpen] = useState(false);
  const [renamingProject, setRenamingProject] = useState(false);
  const [deletingProject, setDeletingProject] = useState(false);
  const [addingFloor, setAddingFloor] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [renamingFloor, setRenamingFloor] = useState<Floor | null>(null);
  const [deletingFloor, setDeletingFloor] = useState<Floor | null>(null);

  if (bundle === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading project...</p>
      </div>
    );
  }
  if (bundle === null) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <EmptyState
          icon={AlertTriangle}
          title="Project not found"
          body="It may have been deleted on this device."
          action={
            <Button
              render={<Link href="/">Back to projects</Link>}
              className="h-12 rounded-lg px-6 text-base"
            >
              Back to projects
            </Button>
          }
        />
      </main>
    );
  }

  const { project, floors, features } = bundle;
  const rows: FloorRowData[] = floors.map((floor) => ({
    floor,
    itemCount: features.filter((f) => f.floorId === floor.id).length,
    features: features.filter((f) => f.floorId === floor.id),
  }));
  const hasMappedFloors = rows.some((r) => r.itemCount > 0);
  const allCompleted = rows.length > 0 && rows.every((r) => r.floor.status === "completed");

  async function downloadBackup() {
    const backup = await exportProjectBackup(project.id);
    downloadJson(backup.filename, backup.json);
  }

  // PRD 36: large exports build async behind a busy state, no jank.
  async function downloadMapFile(floorId?: string) {
    setExporting(true);
    try {
      if (floorId) await downloadFloorGeoJSON(floorId);
      else await downloadProjectGeoJSON(project.id);
    } catch (err) {
      console.error("GeoJSON export failed", err);
      setExportError("The map file could not be built. Try again.");
    } finally {
      setExporting(false);
    }
  }

  const remind = backupMeta && shouldRemindBackup(project, backupMeta.last, backupMeta.dismissed);

  return (
    <>
      <AppBar
        title={project.name}
        subtitle={project.description || "No address"}
        back="/"
        right={
          <>
            <Button
              variant="ghost"
              size="icon-lg"
              aria-label="Download backup"
              onClick={() => void downloadBackup()}
            >
              <CopyPlus className="size-5" aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon-lg"
              aria-label="More project actions"
              onClick={() => setMenuOpen(true)}
            >
              <Ellipsis className="size-5" aria-hidden />
            </Button>
          </>
        }
      />

      <div className="mx-auto w-full max-w-md flex-1 px-4 pt-4 pb-10">
        {remind && (
          <BackupBanner
            projectId={project.id}
            lastBackupAt={backupMeta?.last}
            onBackup={() => void downloadBackup()}
          />
        )}

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <StatusChip status={allCompleted ? "completed" : "mapping"} />
          <span>{floors.length} floors</span>
          <span aria-hidden>-</span>
          <span>
            {features.length} item{features.length === 1 ? "" : "s"} total
          </span>
        </div>

        <h2 className="mt-5 text-xs font-bold tracking-[0.14em] text-muted-foreground uppercase">
          Floors
        </h2>
        <div className="mt-2">
          {rows.length === 0 ? (
            <EmptyState
              icon={Layers}
              title="No floors yet"
              body="Create the first floor to start mapping."
            />
          ) : (
            <FloorList
              floors={rows}
              onRename={setRenamingFloor}
              onDelete={setDeletingFloor}
              onExport={(floor) => void downloadMapFile(floor.id)}
              onToggleStatus={(floor) =>
                void floorRepo.setStatus(
                  floor.id,
                  floor.status === "mapping" ? "completed" : "mapping",
                )
              }
              onReorder={(ids) => void floorRepo.reorder(ids)}
            />
          )}
        </div>

        <Button
          variant={rows.length ? "outline" : "default"}
          className="mt-3 h-12 w-full rounded-lg text-base"
          onClick={() => setAddingFloor(true)}
        >
          <Plus className="size-5" aria-hidden />
          {rows.length ? "Add floor" : "Create first floor"}
        </Button>

        <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
          Tap a floor to open the mapping workspace.
          <br />
          Floors stay editable after finishing.
        </p>
      </div>

      {/* Project actions */}
      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogContent showCloseButton={false} className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="truncate">{project.name}</DialogTitle>
            <DialogDescription>Project actions</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1">
            <MenuAction
              icon={Pencil}
              label="Rename project"
              onClick={() => {
                setMenuOpen(false);
                setRenamingProject(true);
              }}
            />
            <MenuAction
              icon={FileDown}
              label={exporting ? "Preparing..." : "Download Map File"}
              onClick={() => {
                setMenuOpen(false);
                void downloadMapFile();
              }}
            />
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
              label="Delete project"
              destructive
              onClick={() => {
                setMenuOpen(false);
                setDeletingProject(true);
              }}
            />
          </div>
        </DialogContent>
      </Dialog>

      <RenameDialog
        open={renamingProject}
        onOpenChange={setRenamingProject}
        title="Rename project"
        label="Building name"
        initial={project.name}
        onSubmit={async (name) => {
          await projectRepo.rename(project.id, name);
        }}
      />

      <ConfirmDialog
        open={deletingProject}
        onOpenChange={setDeletingProject}
        title={`Delete ${project.name}?`}
        description="This removes the project and all of its floors from this device. It cannot be undone."
        confirmLabel="Delete project"
        destructive
        typedConfirmation={
          hasMappedFloors
            ? {
                target: project.name,
                label: "This project has mapped floors. Type DELETE to confirm",
              }
            : undefined
        }
        onConfirm={async () => {
          await projectRepo.remove(project.id);
          router.push("/");
        }}
      >
        <button
          type="button"
          className="text-sm font-medium text-primary underline-offset-2 hover:underline"
          onClick={() => void downloadBackup().catch(() => undefined)}
        >
          Download a backup first
        </button>
      </ConfirmDialog>

      {/* Floor actions */}
      <AddFloorDialog
        open={addingFloor}
        onOpenChange={setAddingFloor}
        projectId={project.id}
        existingCount={floors.length}
      />

      <RenameDialog
        open={renamingFloor !== null}
        onOpenChange={(open) => !open && setRenamingFloor(null)}
        title="Rename floor"
        label="Floor name"
        initial={renamingFloor?.displayName ?? ""}
        onSubmit={async (name) => {
          if (renamingFloor) await floorRepo.rename(renamingFloor.id, name);
        }}
      />

      <ConfirmDialog
        open={deletingFloor !== null}
        onOpenChange={(open) => !open && setDeletingFloor(null)}
        title={`Delete ${deletingFloor?.displayName ?? "floor"}?`}
        description="This removes the floor and everything plotted on it. It cannot be undone."
        confirmLabel="Delete floor"
        destructive
        onConfirm={async () => {
          if (deletingFloor) await floorRepo.remove(deletingFloor.id);
        }}
      />
    </>
  );
}

function BackupBanner({
  projectId,
  lastBackupAt,
  onBackup,
}: {
  projectId: string;
  lastBackupAt: number | undefined;
  onBackup: () => void;
}) {
  // Frozen once at mount: the banner describes a moment, not a live clock.
  const [now] = useState(() => Date.now());
  const days = Math.max(1, Math.round((now - (lastBackupAt ?? 0)) / 86_400_000));
  return (
    <div
      role="status"
      className="mb-4 flex items-center gap-3 rounded-xl border border-amber-300/60 bg-amber-50 p-3 text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-200"
    >
      <Building2 className="size-5 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 text-sm font-medium">
        {lastBackupAt
          ? `Last backup ${days} day${days === 1 ? "" : "s"} ago.`
          : "This project has never been backed up."}
      </span>
      <Button variant="outline" size="sm" className="h-9" onClick={onBackup}>
        Download Backup
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Dismiss backup reminder"
        onClick={() => void metaRepo.dismissBackupReminder(projectId)}
      >
        <span aria-hidden className="text-base leading-none">
          ×
        </span>
      </Button>
    </div>
  );
}

function MenuAction({
  icon: Icon,
  label,
  destructive = false,
  onClick,
}: {
  icon: typeof Pencil;
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

function RenameDialog({
  open,
  onOpenChange,
  title,
  label,
  initial,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  label: string;
  initial: string;
  onSubmit: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(initial);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setName(initial);
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const trimmed = name.trim();
            if (!trimmed) return;
            await onSubmit(trimmed);
            onOpenChange(false);
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="rename-field">{label}</Label>
            <Input
              id="rename-field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
              required
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim()}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddFloorDialog({
  open,
  onOpenChange,
  projectId,
  existingCount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  existingCount: number;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const suggested = `Floor ${existingCount + 1}`;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setName("");
          setError(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New floor</DialogTitle>
          <DialogDescription>Any name works - Ground, B1, 2, Mezzanine.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const trimmed = name.trim() || suggested;
            try {
              await floorRepo.create({ projectId, displayName: trimmed });
              onOpenChange(false);
            } catch (err) {
              console.error("Floor creation failed", err);
              setError("The floor could not be saved. Try again.");
            }
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-floor-name">Floor name</Label>
            <Input
              id="new-floor-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={suggested}
              autoComplete="off"
            />
            {error && (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">Create floor</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
