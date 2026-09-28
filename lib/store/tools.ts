import { create } from "zustand";

// PRD 12-13: the active mapping tool plus the two per-session toggles.
// Snapping is on by default; the right-angle lock is remembered per session
// (survives navigation within the app, not restarts).

export type Tool = "select" | "trace-path" | "add-place";

const SESSION_KEY = "wap-session-prefs";

interface SessionPrefs {
  snapping: boolean;
  angleLock: boolean;
}

function readSessionPrefs(): SessionPrefs {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SessionPrefs>;
      return {
        snapping: parsed.snapping ?? true,
        angleLock: parsed.angleLock ?? false,
      };
    }
  } catch {
    // Private mode or blocked storage: fall back to defaults.
  }
  return { snapping: true, angleLock: false };
}

function writeSessionPrefs(prefs: SessionPrefs): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(prefs));
  } catch {
    // Session-only preference; dropping it is fine.
  }
}

interface ToolsState {
  tool: Tool;
  /** Catalog key of the place being placed while tool === "add-place". */
  placeType: string | null;
  snapping: boolean;
  angleLock: boolean;
  hydrated: boolean;
  hydrate: () => void;
  setTool: (tool: Tool) => void;
  startPlacing: (placeType: string) => void;
  toggleSnapping: () => void;
  toggleAngleLock: () => void;
}

export const useToolsStore = create<ToolsState>()((set) => ({
  tool: "select",
  placeType: null,
  snapping: true,
  angleLock: false,
  hydrated: false,

  hydrate: () => {
    const prefs = readSessionPrefs();
    set({ ...prefs, hydrated: true });
  },

  setTool: (tool) => set({ tool, ...(tool !== "add-place" ? { placeType: null } : {}) }),

  startPlacing: (placeType) => set({ tool: "add-place", placeType }),

  toggleSnapping: () =>
    set((s) => {
      writeSessionPrefs({ snapping: !s.snapping, angleLock: s.angleLock });
      return { snapping: !s.snapping };
    }),

  toggleAngleLock: () =>
    set((s) => {
      writeSessionPrefs({ snapping: s.snapping, angleLock: !s.angleLock });
      return { angleLock: !s.angleLock };
    }),
}));
