"use client";

import { Dialog, DialogTitle, SheetContent } from "@/components/ui/dialog";
import { PLACE_TYPES } from "@/lib/config/place-types";

// PRD 16 step 1: "What is it?" - short, scannable type picker. Data-driven
// from the catalog so new types need no UI change. 48px targets, 320px-safe
// three-column grid.

interface TypePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (typeKey: string) => void;
}

export function TypePicker({ open, onOpenChange, onPick }: TypePickerProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <DialogTitle className="font-heading text-base font-semibold">What is it?</DialogTitle>
        <div className="grid grid-cols-3 gap-2 overflow-y-auto">
          {PLACE_TYPES.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                onOpenChange(false);
                onPick(key);
              }}
              className="flex h-20 flex-col items-center justify-center gap-1.5 rounded-xl border bg-card px-1 text-center text-xs font-semibold transition-colors hover:bg-muted aria-pressed:border-primary"
            >
              <Icon className="size-5 shrink-0 text-primary" aria-hidden />
              <span className="w-full truncate">{label}</span>
            </button>
          ))}
        </div>
      </SheetContent>
    </Dialog>
  );
}
