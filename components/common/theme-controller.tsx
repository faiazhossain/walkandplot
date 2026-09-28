"use client";

import { useEffect } from "react";
import { applyThemeClass, readMirroredTheme, settingsStore } from "@/lib/store/settings";

// Applies the persisted theme before/while hydrating and keeps the .dark
// class in sync. The boot script in app/layout reads the same localStorage
// mirror so a dark user never sees a white flash.

export function ThemeController() {
  const theme = settingsStore((s) => s.theme);
  const hydrated = settingsStore((s) => s.hydrated);

  // Paint from the localStorage mirror immediately; IndexedDB confirms later.
  useEffect(() => {
    applyThemeClass(readMirroredTheme());
    settingsStore
      .getState()
      .hydrate()
      .catch((err) => console.error("Settings load failed", err));
  }, []);

  useEffect(() => {
    if (hydrated) applyThemeClass(theme);
  }, [theme, hydrated]);

  // Follow the OS when the user has not picked an explicit theme.
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyThemeClass("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  return null;
}

/** Inline boot script string: applies .dark before first paint. */
export const themeBootScript = `(function(){try{var t=localStorage.getItem("wap-theme")||"system";var d=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);if(d)document.documentElement.classList.add("dark");}catch(e){}})();`;
