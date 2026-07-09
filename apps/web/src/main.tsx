import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { Theme } from "@astryxdesign/core/theme";
import { ToastViewport } from "@astryxdesign/core/Toast";
import { stoneTheme } from "@astryxdesign/theme-stone/built";
import "@astryxdesign/core/reset.css";
import "@astryxdesign/theme-stone/theme.css";
import { App } from "./App.js";
import { loadThemeMode, saveThemeMode } from "./lib/theme.js";
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
 */
function Root() {
  const [themeMode, setThemeMode] = useState(loadThemeMode);

  const handleThemeModeChange = (mode: typeof themeMode) => {
    setThemeMode(mode);
    saveThemeMode(mode);
  };

  return (
    <Theme theme={stoneTheme} mode={themeMode}>
      <ToastViewport position="bottomEnd" maxVisible={3}>
        <App themeMode={themeMode} onThemeModeChange={handleThemeModeChange} />
      </ToastViewport>
    </Theme>
  );
}

createRoot(container).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
