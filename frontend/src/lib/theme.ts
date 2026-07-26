/**
 * Theme system (issue #380 — dark / light theme support)
 *
 * Persists the user's preference in localStorage and applies data-theme to
 * <html> so all CSS custom properties update automatically.  Falls back to
 * the OS preference when no explicit setting has been saved.
 */

import { create } from "zustand";
import { useEffect } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Theme = "dark" | "light" | "system";

interface ThemeStore {
  theme: Theme;
  /** Resolved theme — "dark" or "light", never "system". */
  resolved: "dark" | "light";
  setTheme: (theme: Theme) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = "veritoken-theme";

function resolveTheme(theme: Theme): "dark" | "light" {
  if (theme === "system") {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return "dark"; // SSR or test environment fallback
    }
    return window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  }
  return theme;
}

function applyTheme(resolved: "dark" | "light") {
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", resolved);
  }
}

function readStoredTheme(): Theme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "dark" || raw === "light" || raw === "system") return raw;
  } catch {
    // localStorage can throw in strict sandboxes
  }
  return "system";
}

// ---------------------------------------------------------------------------
// Zustand store
// ---------------------------------------------------------------------------

export const useThemeStore = create<ThemeStore>((set) => {
  const initial = readStoredTheme();
  // resolveTheme handles missing window.matchMedia gracefully
  const resolved = resolveTheme(initial);

  return {
    theme: initial,
    resolved,

    setTheme: (theme: Theme) => {
      const res = resolveTheme(theme);
      applyTheme(res);
      try {
        localStorage.setItem(STORAGE_KEY, theme);
      } catch {
        // ignore
      }
      set({ theme, resolved: res });
    },
  };
});

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/** Convenience hook: returns [resolvedTheme, setTheme]. */
export function useTheme(): ["dark" | "light", (t: Theme) => void] {
  const { resolved, setTheme, theme } = useThemeStore();

  // React to OS preference changes when theme === "system"
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const handler = () => {
      const res = mq.matches ? "light" : "dark";
      applyTheme(res);
      useThemeStore.setState({ resolved: res });
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  // Apply on mount (covers SSR hydration / fresh load)
  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  return [resolved, setTheme];
}
