import { create } from "zustand";

// PRD 17: a small status indicator shows save state - saved (default),
// saving, error. It reflects actual DB commit, not intent. No global Save
// button exists anywhere in the product.

export type SaveStatus = "saved" | "saving" | "error";

interface SaveStateState {
  status: SaveStatus;
  savingCount: number;
  begin: () => void;
  commit: () => void;
  fail: () => void;
}

export const useSaveStateStore = create<SaveStateState>()((set) => ({
  status: "saved",
  savingCount: 0,
  begin: () => set((s) => ({ savingCount: s.savingCount + 1, status: "saving" })),
  commit: () =>
    set((s) => {
      const savingCount = Math.max(0, s.savingCount - 1);
      return { savingCount, status: savingCount === 0 ? "saved" : "saving" };
    }),
  fail: () => set((s) => ({ savingCount: Math.max(0, s.savingCount - 1), status: "error" })),
}));

// PRD 17/32: a failed autosave surfaces the error state; the workspace shows
// a "Retry now" tap target that re-runs the failed closure.
let lastFailed: (() => Promise<void>) | null = null;

export async function runSave(action: () => Promise<void>): Promise<boolean> {
  const store = useSaveStateStore.getState();
  store.begin();
  try {
    await action();
    lastFailed = null;
    store.commit();
    return true;
  } catch (error) {
    console.error("Autosave failed", error);
    lastFailed = action;
    store.fail();
    return false;
  }
}

export function retryLastFailedSave(): boolean {
  if (!lastFailed) return false;
  const action = lastFailed;
  void runSave(action);
  return true;
}

export function hasFailedSave(): boolean {
  return lastFailed !== null;
}
