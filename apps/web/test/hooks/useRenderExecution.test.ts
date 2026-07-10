// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RenderStartResult, RenderStatus } from "../../src/api.js";

const { fetchRenderStatus, startRender } = vi.hoisted(() => ({
  fetchRenderStatus: vi.fn(),
  startRender: vi.fn(),
}));

vi.mock("../../src/api.js", () => ({ fetchRenderStatus, startRender }));

const { useRenderExecution } = await import("../../src/hooks/useRenderExecution.js");

const NO_BURN_SUBTITLES_KEY = "cuesheet-render-no-burn-subtitles";

function noopToast() {
  return spyToast();
}

/** A `ShowToastFn`-shaped spy (returns a dismiss function, as the real hook does), also usable to
    assert on the `{ type, body }` it was called with. */
function spyToast() {
  return vi.fn().mockReturnValue(vi.fn());
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

beforeEach(() => {
  localStorage.clear();
});

describe("useRenderExecution", () => {
  it("starts idle, with noBurnSubtitles read from localStorage (defaulting to false)", () => {
    const { result } = renderHook(() => useRenderExecution(noopToast()));
    expect(result.current.renderState).toEqual({ status: "idle" });
    expect(result.current.noBurnSubtitles).toBe(false);
  });

  it("loads noBurnSubtitles=true from an existing localStorage value", () => {
    localStorage.setItem(NO_BURN_SUBTITLES_KEY, "1");
    const { result } = renderHook(() => useRenderExecution(noopToast()));
    expect(result.current.noBurnSubtitles).toBe(true);
  });

  it("handleToggleNoBurnSubtitles updates state and persists to localStorage", () => {
    const { result } = renderHook(() => useRenderExecution(noopToast()));
    act(() => result.current.handleToggleNoBurnSubtitles(true));
    expect(result.current.noBurnSubtitles).toBe(true);
    expect(localStorage.getItem(NO_BURN_SUBTITLES_KEY)).toBe("1");

    act(() => result.current.handleToggleNoBurnSubtitles(false));
    expect(result.current.noBurnSubtitles).toBe(false);
    expect(localStorage.getItem(NO_BURN_SUBTITLES_KEY)).toBe("0");
  });

  it("passes !noBurnSubtitles as burnSubtitles when starting a render", async () => {
    startRender.mockResolvedValue({ ok: true, jobId: "1" } satisfies RenderStartResult);
    fetchRenderStatus.mockResolvedValue({ state: "running", progress: 0, outputReady: false } satisfies RenderStatus);
    const { result } = renderHook(() => useRenderExecution(noopToast()));

    act(() => result.current.handleToggleNoBurnSubtitles(true));
    await act(async () => {
      await result.current.handleRender();
    });
    expect(startRender).toHaveBeenCalledWith(false);
  });

  it("on a successful start, immediately shows rendering(0) and begins polling", async () => {
    startRender.mockResolvedValue({ ok: true, jobId: "1" } satisfies RenderStartResult);
    fetchRenderStatus.mockResolvedValue({
      state: "running",
      progress: 42,
      outputReady: false,
    } satisfies RenderStatus);
    const { result } = renderHook(() => useRenderExecution(noopToast()));

    await act(async () => {
      await result.current.handleRender();
    });
    await waitFor(() => expect(result.current.renderState).toEqual({ status: "rendering", progress: 42 }));
  });

  it("schedules another poll after the interval while still running, and reflects a later progress value", async () => {
    vi.useFakeTimers();
    startRender.mockResolvedValue({ ok: true, jobId: "1" } satisfies RenderStartResult);
    fetchRenderStatus
      .mockResolvedValueOnce({ state: "running", progress: 10, outputReady: false } satisfies RenderStatus)
      .mockResolvedValueOnce({ state: "running", progress: 55, outputReady: false } satisfies RenderStatus);
    const { result } = renderHook(() => useRenderExecution(noopToast()));

    await act(async () => {
      await result.current.handleRender();
    });
    expect(result.current.renderState).toEqual({ status: "rendering", progress: 10 });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(fetchRenderStatus).toHaveBeenCalledTimes(2);
    expect(result.current.renderState).toEqual({ status: "rendering", progress: 55 });
  });

  it("moves to success and toasts once the status reports done", async () => {
    const toastFn = spyToast();
    startRender.mockResolvedValue({ ok: true, jobId: "1" } satisfies RenderStartResult);
    fetchRenderStatus.mockResolvedValue({ state: "done", progress: 100, outputReady: true } satisfies RenderStatus);
    const { result } = renderHook(() => useRenderExecution(toastFn));

    await act(async () => {
      await result.current.handleRender();
    });
    await waitFor(() => expect(result.current.renderState).toEqual({ status: "success", path: "out.mp4" }));
    expect(toastFn).toHaveBeenCalledWith({ type: "info", body: "Export complete." });
  });

  it("moves to error and toasts when the status reports an error", async () => {
    const toastFn = spyToast();
    startRender.mockResolvedValue({ ok: true, jobId: "1" } satisfies RenderStartResult);
    fetchRenderStatus.mockResolvedValue({
      state: "error",
      progress: 0,
      error: "ffmpeg exploded",
      errorDetail: "stderr dump",
      outputReady: false,
    } satisfies RenderStatus);
    const { result } = renderHook(() => useRenderExecution(toastFn));

    await act(async () => {
      await result.current.handleRender();
    });
    await waitFor(() =>
      expect(result.current.renderState).toEqual({
        status: "error",
        error: "ffmpeg exploded",
        errorDetail: "stderr dump",
      }),
    );
    expect(toastFn).toHaveBeenCalledWith({ type: "error", body: "Export failed: ffmpeg exploded" });
  });

  it("keeps polling through a transient network error instead of surfacing it", async () => {
    vi.useFakeTimers();
    startRender.mockResolvedValue({ ok: true, jobId: "1" } satisfies RenderStartResult);
    fetchRenderStatus
      .mockRejectedValueOnce(new Error("network blip"))
      .mockResolvedValueOnce({ state: "done", progress: 100, outputReady: true } satisfies RenderStatus);
    const { result } = renderHook(() => useRenderExecution(noopToast()));

    await act(async () => {
      await result.current.handleRender();
    });
    expect(result.current.renderState).toEqual({ status: "rendering", progress: 0 });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(result.current.renderState).toEqual({ status: "success", path: "out.mp4" });
  });

  it("surfaces a `{ ok: false }` start result as an error without polling", async () => {
    const toastFn = spyToast();
    startRender.mockResolvedValue({ ok: false, error: "already rendering" } satisfies RenderStartResult);
    const { result } = renderHook(() => useRenderExecution(toastFn));

    await act(async () => {
      await result.current.handleRender();
    });
    expect(result.current.renderState).toEqual({ status: "error", error: "already rendering" });
    expect(fetchRenderStatus).not.toHaveBeenCalled();
    expect(toastFn).toHaveBeenCalledWith({ type: "error", body: "Export failed: already rendering" });
  });

  it("surfaces a thrown error from startRender itself", async () => {
    const toastFn = spyToast();
    startRender.mockRejectedValue(new Error("network down"));
    const { result } = renderHook(() => useRenderExecution(toastFn));

    await act(async () => {
      await result.current.handleRender();
    });
    expect(result.current.renderState).toEqual({ status: "error", error: "network down" });
    expect(toastFn).toHaveBeenCalledWith({ type: "error", body: "Export failed: network down" });
  });
});
