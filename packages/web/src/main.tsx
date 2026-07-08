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
  throw new Error("#root 엘리먼트를 찾을 수 없습니다");
}

/**
 * 테마 모드(system/light/dark) 상태는 <Theme>를 감싸는 이 컴포넌트가 쥐고 있어야 한다 —
 * Theme의 mode prop이 바뀔 때마다 data-theme/data-astryx-theme가 <html>에 동기화되고
 * (Astryx Theme 내부 useRootThemeSync), 그 attr을 우리 CSS의 light-dark() 토큰들이
 * color-scheme을 통해 그대로 읽는다. 토글 UI 자체는 App -> HeaderBar에 내려보낸다.
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
