import { useCallback, useEffect, useRef, useState } from "react";
import type { ShowToastFn } from "@astryxdesign/core/Toast";
import { fetchRenderStatus, startRender } from "../api.js";
import type { RenderState } from "../steps/FinishStep/index.js";

export interface UseRenderExecutionResult {
  renderState: RenderState;
  /** "Don't burn subtitles (clean video for CC)" checkbox state - persisted to localStorage. */
  noBurnSubtitles: boolean;
  handleToggleNoBurnSubtitles: (checked: boolean) => void;
  handleRender: () => Promise<void>;
}

/**
 * Owns render execution: kicking off a render (respecting the noBurnSubtitles toggle), and polling
 * status from start until completion/failure. Editing can continue while a render is running -
 * since the render proceeds based on the cuesheet that was on disk when it started, editing/saving
 * during polling doesn't affect this render's result.
 */
export function useRenderExecution(toast: ShowToastFn): UseRenderExecutionResult {
  const [renderState, setRenderState] = useState<RenderState>({ status: "idle" });
  const [noBurnSubtitles, setNoBurnSubtitles] = useState(loadNoBurnSubtitles);
  const renderPollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (renderPollTimer.current) {
        clearTimeout(renderPollTimer.current);
      }
    };
  }, []);

  const pollRenderStatus = useCallback(() => {
    const tick = async () => {
      try {
        const status = await fetchRenderStatus();
        if (status.state === "running") {
          setRenderState({ status: "rendering", progress: status.progress });
          renderPollTimer.current = setTimeout(() => void tick(), RENDER_POLL_INTERVAL_MS);
        } else if (status.state === "done") {
          setRenderState({ status: "success", path: "out.mp4" });
          toast({ type: "info", body: "Export complete." });
        } else if (status.state === "error") {
          const message = status.error ?? "Unknown error";
          setRenderState({ status: "error", error: message, errorDetail: status.errorDetail });
          toast({ type: "error", body: `Export failed: ${message}` });
        }
      } catch {
        // Keep polling through transient network errors.
        renderPollTimer.current = setTimeout(() => void tick(), RENDER_POLL_INTERVAL_MS);
      }
    };
    void tick();
  }, [toast]);

  const handleToggleNoBurnSubtitles = useCallback((checked: boolean) => {
    setNoBurnSubtitles(checked);
    try {
      localStorage.setItem(NO_BURN_SUBTITLES_KEY, checked ? "1" : "0");
    } catch {
      // Silently ignore if localStorage is inaccessible (best-effort feature).
    }
  }, []);

  const handleRender = useCallback(async () => {
    try {
      const result = await startRender(!noBurnSubtitles);
      if (result.ok) {
        setRenderState({ status: "rendering", progress: 0 });
        pollRenderStatus();
      } else {
        setRenderState({ status: "error", error: result.error });
        toast({ type: "error", body: `Export failed: ${result.error}` });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setRenderState({ status: "error", error: message });
      toast({ type: "error", body: `Export failed: ${message}` });
    }
  }, [toast, pollRenderStatus, noBurnSubtitles]);

  return { renderState, noBurnSubtitles, handleToggleNoBurnSubtitles, handleRender };
}

function loadNoBurnSubtitles(): boolean {
  try {
    return localStorage.getItem(NO_BURN_SUBTITLES_KEY) === "1";
  } catch {
    return false;
  }
}

/** Render progress polling interval (ms). */
const RENDER_POLL_INTERVAL_MS = 1500;

/** localStorage key remembering the "don't burn subtitles (clean video for CC)" checkbox state. */
const NO_BURN_SUBTITLES_KEY = "cuesheet-render-no-burn-subtitles";
