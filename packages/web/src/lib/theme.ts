/** 라이트/다크/시스템 3단 테마 토글 상태. @astryxdesign/core의 Theme `mode` prop과 그대로 맞물린다. */
export type ThemeModeSetting = "system" | "light" | "dark";

const THEME_MODE_KEY = "cuesheet-theme-mode";

/** localStorage에 저장된 테마 선호를 읽는다. 값이 없거나 손상됐으면 "system"으로 되돌아간다. */
export function loadThemeMode(): ThemeModeSetting {
  try {
    const raw = localStorage.getItem(THEME_MODE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") {
      return raw;
    }
  } catch {
    // localStorage 접근 불가 시 조용히 무시한다(best-effort 기능).
  }
  return "system";
}

/** 테마 선호를 localStorage에 기억한다. */
export function saveThemeMode(mode: ThemeModeSetting): void {
  try {
    localStorage.setItem(THEME_MODE_KEY, mode);
  } catch {
    // localStorage 접근 불가 시 조용히 무시한다(best-effort 기능).
  }
}
