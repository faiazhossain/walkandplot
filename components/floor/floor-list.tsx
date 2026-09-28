"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  Ellipsis,
  GripVertical,
  Map as MapIcon,
  Pencil,
  Trash2,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { MapThumbnail } from "@/components/common/map-thumbnail";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Feature, Floor } from "@/lib/domain/schema";

// PRD 11: the floor list supports reordering by drag; the `order` field, not
// list position, is the source of truth. Dragging uses a grip handle and
// pointer events so it works with touch as well as a mouse.

export interface FloorRowData {
  floor: Floor;
  itemCount: number;
  features: Feature[];
}

interface FloorListProps {
  floors: FloorRowData[];
  onRename: (floor: Floor) => void;
  onDelete: (floor: Floor) => void;
  onToggleStatus: (floor: Floor) => void;
  /** Persists the new order once a drag settles. */
  onReorder: (orderedIds: string[]) => void;
}

export function FloorList({
  floors,
  onRename,
  onDelete,
  onToggleStatus,
  onReorder,
}: FloorListProps) {
  const [order, setOrder] = useState<string[] | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const ordered = order ?? floors.map((f) => f.floor.id);
  const byId = new Map(floors.map((r) => [r.floor.id, r]));
  const rows = ordered.map((id) => byId.get(id)).filter((r): r is FloorRowData => !!r);

  function handlePointerDown(e: React.PointerEvent, floorId: string) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const grip = e.currentTarget as HTMLElement;
    grip.setPointerCapture(e.pointerId);
    setDragId(floorId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragId || !listRef.current) return;
    const items = Array.from(listRef.current.querySelectorAll<HTMLElement>("[data-floor-row]"));
    const dragged = items.find((el) => el.dataset.floorRow === dragId);
    if (!dragged) return;

    let targetIndex = rows.findIndex((r) => r.floor.id === dragId);
    for (let i = 0; i < items.length; i++) {
      const el = items[i];
      if (el.dataset.floorRow === dragId) continue;
      const rect = el.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (e.clientY < mid) {
        targetIndex = rows.findIndex((r) => r.floor.id === el.dataset.floorRow);
        break;
      }
      targetIndex = rows.findIndex((r) => r.floor.id === el.dataset.floorRow) + 1;
    }
    targetIndex = Math.max(0, Math.min(rows.length - 1, targetIndex));
    setDragOverIndex(targetIndex);

    const currentIndex = rows.findIndex((r) => r.floor.id === dragId);
    if (targetIndex !== currentIndex) {
      const next = rows.map((r) => r.floor.id);
      next.splice(currentIndex, 1);
      next.splice(targetIndex, 0, dragId);
      setOrder(next);
    }
  }

  function handlePointerUp() {
    if (dragId && order) onReorder(order);
    setDragId(null);
    setDragOverIndex(null);
  }

  function move(id: string, delta: number) {
    const ids = rows.map((r) => r.floor.id);
    const i = ids.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setOrder(ids);
    onReorder(ids);
  }

  return (
    <ul ref={listRef} className="flex flex-col gap-2">
      {rows.map((row, index) => (
        <FloorRow
          key={row.floor.id}
          row={row}
          index={index}
          isLast={index === rows.length - 1}
          dragging={dragId === row.floor.id}
          dropTarget={dragOverIndex === index && dragId !== null && dragId !== row.floor.id}
          onPointerDownGrip={(e) => handlePointerDown(e, row.floor.id)}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onRename={() => onRename(row.floor)}
          onDelete={() => onDelete(row.floor)}
          onToggleStatus={() => onToggleStatus(row.floor)}
          onMoveUp={() => move(row.floor.id, -1)}
          onMoveDown={() => move(row.floor.id, 1)}
        />
      ))}
    </ul>
  );
}

function FloorRow({
  row,
  index,
  isLast,
  dragging,
  dropTarget,
  onPointerDownGrip,
  onPointerMove,
  onPointerUp,
  onRename,
  onDelete,
  onToggleStatus,
  onMoveUp,
  onMoveDown,
}: {
  row: FloorRowData;
  index: number;
  isLast: boolean;
  dragging: boolean;
  dropTarget: boolean;
  onPointerDownGrip: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
  onRename: () => void;
  onDelete: () => void;
  onToggleStatus: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { floor, itemCount, features } = row;

  return (
    <li
      data-floor-row={floor.id}
      onPointerMove={dragging ? onPointerMove : undefined}
      onPointerUp={dragging ? onPointerUp : undefined}
      onPointerCancel={dragging ? onPointerUp : undefined}
      className={`flex items-stretch overflow-hidden rounded-xl border bg-card transition-shadow ${
        dragging ? "z-10 shadow-lg" : ""
      } ${dropTarget ? "border-primary" : ""}`}
    >
      <button
        type="button"
        aria-label={`Reorder ${floor.displayName} - drag the grip or use the row menu`}
        onPointerDown={onPointerDownGrip}
        className="grid w-8 shrink-0 cursor-grab touch-none place-items-center text-muted-foreground active:cursor-grabbing"
      >
        <GripVertical className="size-4" aria-hidden />
      </button>

      <Link
        href={`/projects/map?id=${floor.id}`}
        className="flex min-w-0 flex-1 items-center gap-3 py-3 pr-1"
        draggable={false}
      >
        <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-primary/5 text-primary">
          {features.length > 0 ? (
            <MapThumbnail features={features} className="size-10" />
          ) : (
            <MapIcon className="size-5 text-muted-foreground" aria-hidden />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{floor.displayName}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {itemCount} item{itemCount === 1 ? "" : "s"}
            {floor.scale?.calibrated ? " - calibrated" : ""}
          </span>
        </span>
        <StatusChip status={floor.status} />
        <ChevronRight className="mr-1 size-4 shrink-0 text-muted-foreground" aria-hidden />
      </Link>

      <Button
        variant="ghost"
        size="icon-lg"
        className="my-auto mr-1 shrink-0"
        aria-label={`More actions for ${floor.displayName}`}
        onClick={() => setMenuOpen(true)}
      >
        <Ellipsis className="size-5" aria-hidden />
      </Button>

      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogContent showCloseButton={false} className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="truncate">{floor.displayName}</DialogTitle>
            <DialogDescription>Floor actions</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1">
            <MenuAction
              icon={Pencil}
              label="Rename"
              onClick={() => {
                setMenuOpen(false);
                onRename();
              }}
            />
            <MenuAction
              icon={floor.status === "mapping" ? CheckCircle2 : CircleDashed}
              label={floor.status === "mapping" ? "Mark completed" : "Reopen for mapping"}
              onClick={() => {
                setMenuOpen(false);
                onToggleStatus();
              }}
            />
            <MenuAction
              icon={ArrowUp}
              label="Move up"
              disabled={index === 0}
              onClick={() => {
                setMenuOpen(false);
                onMoveUp();
              }}
            />
            <MenuAction
              icon={ArrowDown}
              label="Move down"
              disabled={isLast}
              onClick={() => {
                setMenuOpen(false);
                onMoveDown();
              }}
            />
            <MenuAction
              icon={Trash2}
              label="Delete floor"
              destructive
              onClick={() => {
                setMenuOpen(false);
                onDelete();
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </li>
  );
}

function MenuAction({
  icon: Icon,
  label,
  destructive = false,
  disabled = false,
  onClick,
}: {
  icon: typeof Pencil;
  label: string;
  destructive?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant="ghost"
      disabled={disabled}
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

export function StatusChip({ status }: { status: Floor["status"] }) {
  if (status === "completed") {
    return (
      <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
        <CheckCircle2 className="size-3" aria-hidden />
        Completed
      </span>
    );
  }
  return (
    <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary dark:bg-primary/20">
      <CircleDashed className="size-3" aria-hidden />
      Mapping
    </span>
  );
}
