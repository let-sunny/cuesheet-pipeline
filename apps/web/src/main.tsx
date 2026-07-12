import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { Theme } from "@astryxdesign/core/theme";
import { ToastViewport } from "@astryxdesign/core/Toast";
import { stoneTheme } from "@astryxdesign/theme-stone/built";
import { y2kTheme } from "@astryxdesign/theme-y2k/built";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";
import "@astryxdesign/core/reset.css";
// All three theme packages' CSS are imported unconditionally (2026-07-11 THEME switcher) - each
// theme.css scopes its own `--color-*`/etc. definitions inside `@scope ([data-astryx-theme="name"])
// to ([data-astryx-theme])` (verified in the built CSS), so having all three loaded at once is
// inert; only the one matching <Theme>'s current `theme`/`data-astryx-theme` actually applies.
import "@astryxdesign/theme-stone/theme.css";
import "@astryxdesign/theme-y2k/theme.css";
import "@astryxdesign/theme-neutral/theme.css";
// Pretendard - the default title-card face (TITLE_FONT_FAMILY). Loaded here so the title preview
// (TitlePreview) actually renders in Pretendard rather than falling back to the platform sans.
import "pretendard/dist/web/variable/pretendardvariable.css";
import { App } from "./App.js";
import { DomainConfigProvider } from "./hooks/useDomainConfig.js";
import type { ThemeName } from "./lib/theme.js";
import { loadTheme, loadThemeMode, saveTheme, saveThemeMode } from "./lib/theme.js";
import "./styles.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Could not find the #root element");
}

/**
 * Theme mode (system/light/dark) state must be held by this component wrapping <Theme> —
 * whenever Theme's mode prop changes, data-theme/data-astryx-theme get synced onto <html>
 * (via Astryx Theme's internal useRootThemeSync), and our CSS's light-dark() tokens read
 * that attr through color-scheme. The toggle UI itself is passed down through App -> HeaderBar.
 *
 * THEME (stone/y2k/neutral, 2026-07-11) is a separate axis from mode, held here the same way -
 * `theme` state picks which of the 3 imported theme objects <Theme> actually renders with. This is
 * a dev/validation affordance (design-principles.md #5's stock-audit): switching it while looking at
 * the same screen is how hardcoded (non-token) colors get caught, since a stock element must
 * recolor on every switch and a hardcoded one won't.
 */
function Root() {
  const [themeMode, setThemeMode] = useState(loadThemeMode);
  const [themeName, setThemeName] = useState(loadTheme);

  const handleThemeModeChange = (mode: typeof themeMode) => {
    setThemeMode(mode);
    saveThemeMode(mode);
  };

  const handleThemeNameChange = (name: ThemeName) => {
    setThemeName(name);
    saveTheme(name);
  };

  return (
    <Theme theme={THEME_OBJECTS[themeName]} mode={themeMode}>
      <ToastViewport position="bottomEnd" maxVisible={3}>
        <DomainConfigProvider>
          <App
            themeMode={themeMode}
            onThemeModeChange={handleThemeModeChange}
            themeName={themeName}
            onThemeNameChange={handleThemeNameChange}
          />
        </DomainConfigProvider>
      </ToastViewport>
    </Theme>
  );
}

const THEME_OBJECTS: Record<ThemeName, typeof y2kTheme> = {
  stone: stoneTheme,
  y2k: y2kTheme,
  neutral: neutralTheme,
};

createRoot(container).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
