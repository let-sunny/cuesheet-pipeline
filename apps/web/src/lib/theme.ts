/** Light/dark/system three-way theme toggle state. Maps directly onto @astryxdesign/core's Theme `mode` prop. */
export type ThemeModeSetting = "system" | "light" | "dark";

/**
 * Which Astryx THEME package is active (stone/y2k/neutral) - separate from `ThemeModeSetting`
 * (light/dark/system) above. This is a dev/validation affordance (2026-07-11): flipping it lets you
 * visually catch which elements DON'T recolor across themes (= hardcoded, not stock). Default stays
 * "y2k" (this app's existing look, unchanged from before the switcher existed).
 */
export type ThemeName = "stone" | "y2k" | "neutral";

/** Reads the theme preference stored in localStorage. Falls back to "light" if missing or corrupted (light-first: dark reads poorly for this content). */
export function loadThemeMode(): ThemeModeSetting {
  try {
    const raw = localStorage.getItem(THEME_MODE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") {
      return raw;
    }
  } catch {
    // Silently ignore if localStorage is inaccessible (best-effort feature).
  }
  return "light";
}

/** Remembers the theme preference in localStorage. */
export function saveThemeMode(mode: ThemeModeSetting): void {
  try {
    localStorage.setItem(THEME_MODE_KEY, mode);
  } catch {
    // Silently ignore if localStorage is inaccessible (best-effort feature).
  }
}

/** Reads the THEME (stone/y2k/neutral) preference stored in localStorage. Falls back to "y2k" (the
 * app's existing default) if missing or corrupted. Mirrors loadThemeMode's pattern above. */
export function loadTheme(): ThemeName {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (raw === "stone" || raw === "y2k" || raw === "neutral") {
      return raw;
    }
  } catch {
    // Silently ignore if localStorage is inaccessible (best-effort feature).
  }
  return "y2k";
}

/** Remembers the THEME (stone/y2k/neutral) preference in localStorage. */
export function saveTheme(name: ThemeName): void {
  try {
    localStorage.setItem(THEME_KEY, name);
  } catch {
    // Silently ignore if localStorage is inaccessible (best-effort feature).
  }
}

const THEME_MODE_KEY = "cuesheet-theme-mode";
const THEME_KEY = "cuesheet-theme-name";
