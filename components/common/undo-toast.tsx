"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// PRD 17: deleting a single object shows an undo toast, never a confirmation
// dialog ("Deleted Shop 304 - [ Undo ]"). One toast at a time; a new action
// replaces the old one.

interface UndoToastState {
  id: number;
  message: string;
  /** Performs the inverse operation; provided by the caller at delete time. */
  onUndo: () => Promise<void> | void;
  show: (message: string, onUndo: () => Promise<void> | void) => void;
  dismiss: () => void;
}

export const useUndoToastStore = create<UndoToastState>()((set) => ({
  id: 0,
  message: "",
  onUndo: () => {},
  show: (message, onUndo) => set({ id: Date.now(), message, onUndo }),
  dismiss: () => set({ id: 0, message: "", onUndo: () => {} }),
}));

const TOAST_MS = 6000;

export function UndoToast() {
  const { id, message, onUndo, dismiss } = useUndoToastStore();

  useEffect(() => {
    if (!id) return;
    const timer = setTimeout(dismiss, TOAST_MS);
    return () => clearTimeout(timer);
  }, [id, dismiss]);

  if (!id) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-24 z-40 flex items-center gap-3 rounded-xl bg-foreground px-4 py-3 text-background shadow-lg sm:inset-x-auto sm:left-1/2 sm:w-96 sm:-translate-x-1/2"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <span className="min-w-0 flex-1 truncate text-sm">{message}</span>
      <Button
        variant="ghost"
        className="h-9 bg-background/10 text-background hover:bg-background/20 hover:text-background"
        onClick={() => {
          dismiss();
          void onUndo();
        }}
      >
        <Undo2 className="size-4" aria-hidden />
        Undo
      </Button>
    </div>
  );
}
