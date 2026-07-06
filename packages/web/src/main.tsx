import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Theme } from "@astryxdesign/core/theme";
import { ToastViewport } from "@astryxdesign/core/Toast";
import { stoneTheme } from "@astryxdesign/theme-stone/built";
import "@astryxdesign/core/reset.css";
import "@astryxdesign/theme-stone/theme.css";
import { App } from "./App.js";
import "./styles.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("#root 엘리먼트를 찾을 수 없습니다");
}

createRoot(container).render(
  <StrictMode>
    <Theme theme={stoneTheme} mode="dark">
      <ToastViewport position="bottomEnd" maxVisible={3}>
        <App />
      </ToastViewport>
    </Theme>
  </StrictMode>,
);
