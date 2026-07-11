// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadTheme, loadThemeMode, saveTheme, saveThemeMode } from "../../src/lib/theme.js";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe("loadThemeMode / saveThemeMode", () => {
  it("falls back to 'light' when nothing is stored", () => {
    expect(loadThemeMode()).toBe("light");
  });

  it("round-trips a saved value", () => {
    saveThemeMode("dark");
    expect(loadThemeMode()).toBe("dark");
  });

  it("round-trips 'system' too", () => {
    saveThemeMode("system");
    expect(loadThemeMode()).toBe("system");
  });

  it("falls back to 'light' when the stored value is corrupted/unrecognized", () => {
    localStorage.setItem("cuesheet-theme-mode", "not-a-real-mode");
    expect(loadThemeMode()).toBe("light");
  });
});

describe("loadTheme / saveTheme", () => {
  it("falls back to 'y2k' when nothing is stored", () => {
    expect(loadTheme()).toBe("y2k");
  });

  it("round-trips a saved theme name", () => {
    saveTheme("stone");
    expect(loadTheme()).toBe("stone");
  });

  it("round-trips 'neutral' too", () => {
    saveTheme("neutral");
    expect(loadTheme()).toBe("neutral");
  });

  it("falls back to 'y2k' when the stored value is corrupted/unrecognized", () => {
    localStorage.setItem("cuesheet-theme-name", "not-a-real-theme");
    expect(loadTheme()).toBe("y2k");
  });
});
