/**
 * Tests for the theme system (issue #380)
 *
 * Note: matchMedia must be mocked before the theme module is imported because
 * the Zustand store calls resolveTheme() at module evaluation time.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// Stubs — must be defined before any imports that trigger module evaluation
// ---------------------------------------------------------------------------

// matchMedia stub (not available in jsdom by default)
vi.stubGlobal(
  "matchMedia",
  vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("light") ? false : true, // OS = dark
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
);

// localStorage stub
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();
vi.stubGlobal("localStorage", localStorageMock);

// ---------------------------------------------------------------------------
// Now import the module under test
// ---------------------------------------------------------------------------

import { useThemeStore } from "../theme";

// ---------------------------------------------------------------------------
// Test lifecycle
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorageMock.clear();
  document.documentElement.removeAttribute("data-theme");
  useThemeStore.setState({ theme: "system", resolved: "dark" });
});

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe("useThemeStore initial state", () => {
  it("defaults to system theme", () => {
    expect(useThemeStore.getState().theme).toBe("system");
  });
});

// ---------------------------------------------------------------------------
// setTheme (issue #380)
// ---------------------------------------------------------------------------

describe("useThemeStore.setTheme", () => {
  it("sets theme to dark and applies data-theme attribute", () => {
    useThemeStore.getState().setTheme("dark");
    expect(useThemeStore.getState().theme).toBe("dark");
    expect(useThemeStore.getState().resolved).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("sets theme to light and applies data-theme attribute", () => {
    useThemeStore.getState().setTheme("light");
    expect(useThemeStore.getState().theme).toBe("light");
    expect(useThemeStore.getState().resolved).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("persists light preference in localStorage", () => {
    useThemeStore.getState().setTheme("light");
    expect(localStorageMock.getItem("veritoken-theme")).toBe("light");
  });

  it("persists dark preference in localStorage", () => {
    useThemeStore.getState().setTheme("dark");
    expect(localStorageMock.getItem("veritoken-theme")).toBe("dark");
  });

  it("persists system preference in localStorage", () => {
    useThemeStore.getState().setTheme("system");
    expect(localStorageMock.getItem("veritoken-theme")).toBe("system");
  });
});

// ---------------------------------------------------------------------------
// Resolved values
// ---------------------------------------------------------------------------

describe("resolved theme values", () => {
  it("resolved is dark when theme is dark", () => {
    useThemeStore.getState().setTheme("dark");
    expect(useThemeStore.getState().resolved).toBe("dark");
  });

  it("resolved is light when theme is light", () => {
    useThemeStore.getState().setTheme("light");
    expect(useThemeStore.getState().resolved).toBe("light");
  });

  it("resolved is dark when OS prefers dark (system)", () => {
    // matchMedia stub returns matches=false for light query → dark
    useThemeStore.getState().setTheme("system");
    expect(useThemeStore.getState().resolved).toBe("dark");
  });
});
