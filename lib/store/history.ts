import { create } from "zustand";

// PRD 17: undo/redo spans all actions - geometry, moves, deletes, renames,
// connections - for the current session, minimum 100 steps. Entries are real
// data operations (they write to IndexedDB); history itself is not persisted
// because autosave is the safety net.

export const HISTORY_LIMIT = 100;

export interface HistoryEntry {
  label: string;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

interface HistoryState {
  past: HistoryEntry[];
  future: HistoryEntry[];
  /** Records a just-performed action; clears the redo stack. */
  push: (entry: HistoryEntry) => void;
  undo: () => Promise<boolean>;
  redo: () => Promise<boolean>;
  /** Removes an entry without running it (undo-toast reconciliation). */
  dropEntry: (entry: HistoryEntry) => void;
  clear: () => void;
}

export const useHistoryStore = create<HistoryState>()((set, get) => ({
  past: [],
  future: [],

  push: (entry) =>
    set((s) => ({
      past: [...s.past, entry].slice(-HISTORY_LIMIT),
      future: [],
    })),

  undo: async () => {
    const { past } = get();
    const entry = past[past.length - 1];
    if (!entry) return false;
    set((s) => ({ past: s.past.slice(0, -1), future: [entry, ...s.future] }));
    await entry.undo();
    return true;
  },

  redo: async () => {
    const { future } = get();
    const entry = future[0];
    if (!entry) return false;
    set((s) => ({ past: [...s.past, entry], future: s.future.slice(1) }));
    await entry.redo();
    return true;
  },

  dropEntry: (entry) =>
    set((s) => ({
      past: s.past.filter((e) => e !== entry),
      future: s.future.filter((e) => e !== entry),
    })),

  clear: () => set({ past: [], future: [] }),
}));
