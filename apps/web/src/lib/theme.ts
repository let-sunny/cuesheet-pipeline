/** Light/dark/system three-way theme toggle state. Maps directly onto @astryxdesign/core's Theme `mode` prop. */
export type ThemeModeSetting = "system" | "light" | "dark";

/** Reads the theme preference stored in localStorage. Falls back to "system" if missing or corrupted. */
export function loadThemeMode(): ThemeModeSetting {
  try {
    const raw = localStorage.getItem(THEME_MODE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") {
      return raw;
    }
  } catch {
    // Silently ignore if localStorage is inaccessible (best-effort feature).
  }
  return "system";
}

/** Remembers the theme preference in localStorage. */
export function saveThemeMode(mode: ThemeModeSetting): void {
  try {
    localStorage.setItem(THEME_MODE_KEY, mode);
  } catch {
    // Silently ignore if localStorage is inaccessible (best-effort feature).
  }
}

const THEME_MODE_KEY = "cuesheet-theme-mode";
