import { create } from "zustand";
import { DEFAULT_STEP_LENGTH_M, metaRepo } from "@/lib/db/meta-repo";
import type { ThemeSetting } from "@/lib/db/meta-repo";

// PRD 28: settings are persisted in the meta table. The raw theme value is
// mirrored to localStorage so the boot script in app/layout can apply the
// .dark class before hydration and avoid a light flash for dark users.

const THEME_KEY = "wap-theme";

interface SettingsState {
  hydrated: boolean;
  stepLengthM: number;
  theme: ThemeSetting;
  hydrate: () => Promise<void>;
  setStepLengthM: (m: number) => Promise<void>;
  setTheme: (theme: ThemeSetting) => Promise<void>;
}

function mirrorTheme(theme: ThemeSetting): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Private mode or blocked storage: the setting still lives in IndexedDB.
  }
}

export type { ThemeSetting };

export const settingsStore = create<SettingsState>()((set) => ({
  hydrated: false,
  stepLengthM: DEFAULT_STEP_LENGTH_M,
  theme: "system",

  hydrate: async () => {
    const [stepLengthM, theme] = await Promise.all([
      metaRepo.getStepLengthM(),
      metaRepo.getTheme(),
    ]);
    set({ stepLengthM, theme, hydrated: true });
  },

  setStepLengthM: async (m: number) => {
    const value = Number.isFinite(m) && m > 0 ? m : DEFAULT_STEP_LENGTH_M;
    set({ stepLengthM: value });
    await metaRepo.setStepLengthM(value);
  },

  setTheme: async (theme: ThemeSetting) => {
    set({ theme });
    mirrorTheme(theme);
    await metaRepo.setTheme(theme);
  },
}));

export function applyThemeClass(theme: ThemeSetting): void {
  const dark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function readMirroredTheme(): ThemeSetting {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" || v === "system" ? v : "system";
  } catch {
    return "system";
  }
}
