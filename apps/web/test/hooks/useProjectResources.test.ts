// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BgmFilesResult, ClipMoments, NarrationFilesResult } from "../../src/api.js";

const { fetchMoments, fetchNarrationFiles, fetchBgmFiles } = vi.hoisted(() => ({
  fetchMoments: vi.fn(),
  fetchNarrationFiles: vi.fn(),
  fetchBgmFiles: vi.fn(),
}));

vi.mock("../../src/api.js", () => ({ fetchMoments, fetchNarrationFiles, fetchBgmFiles }));

const { useProjectResources } = await import("../../src/hooks/useProjectResources.js");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function momentsFixture(): ClipMoments[] {
  return [
    {
      clip: "cut_01.mp4",
      clipSummary: "",
      moments: [{ inS: 0, outS: 4, shotType: "object", memo: "", quality: 4 }],
      monotonousRanges: [{ startS: 4, endS: 9, desc: "" }],
    },
  ];
}

describe("useProjectResources", () => {
  it("fetches moments on mount and derives clipDurations from them", async () => {
    fetchMoments.mockResolvedValue(momentsFixture());
    fetchBgmFiles.mockResolvedValue({ files: [] } satisfies BgmFilesResult);

    const { result } = renderHook(() => useProjectResources({ narrationEnabled: false, narrationDir: undefined }));

    await waitFor(() => expect(result.current.moments).toEqual(momentsFixture()));
    expect(result.current.clipDurations).toEqual({ "cut_01.mp4": 9 });
  });

  it("leaves moments/clipDurations empty (without throwing) when the moments fetch fails", async () => {
    fetchMoments.mockRejectedValue(new Error("boom"));
    fetchBgmFiles.mockResolvedValue({ files: [] } satisfies BgmFilesResult);

    const { result } = renderHook(() => useProjectResources({ narrationEnabled: false, narrationDir: undefined }));

    await waitFor(() => expect(fetchMoments).toHaveBeenCalled());
    expect(result.current.moments).toEqual([]);
    expect(result.current.clipDurations).toEqual({});
  });

  it("does not fetch narration files while narration is disabled", async () => {
    fetchMoments.mockResolvedValue([]);
    fetchBgmFiles.mockResolvedValue({ files: [] } satisfies BgmFilesResult);

    const { result } = renderHook(() => useProjectResources({ narrationEnabled: false, narrationDir: "narration" }));

    await waitFor(() => expect(fetchMoments).toHaveBeenCalled());
    expect(fetchNarrationFiles).not.toHaveBeenCalled();
    expect(result.current.narrationFiles).toEqual([]);
    expect(result.current.narrationNote).toBeUndefined();
  });

  it("fetches narration files (with dir) once narration is enabled, and refetches when dir changes", async () => {
    fetchMoments.mockResolvedValue([]);
    fetchBgmFiles.mockResolvedValue({ files: [] } satisfies BgmFilesResult);
    fetchNarrationFiles.mockResolvedValue({
      files: [{ name: "a.wav", durationS: 3 }],
      note: undefined,
    } satisfies NarrationFilesResult);

    const { result, rerender } = renderHook(
      ({ dir }) => useProjectResources({ narrationEnabled: true, narrationDir: dir }),
      { initialProps: { dir: "dirA" } },
    );

    await waitFor(() => expect(result.current.narrationFiles).toHaveLength(1));
    expect(fetchNarrationFiles).toHaveBeenCalledWith("dirA");

    fetchNarrationFiles.mockResolvedValue({ files: [], note: "empty" } satisfies NarrationFilesResult);
    rerender({ dir: "dirB" });
    await waitFor(() => expect(fetchNarrationFiles).toHaveBeenCalledWith("dirB"));
    await waitFor(() => expect(result.current.narrationNote).toBe("empty"));
  });

  it("surfaces a note and empties the narration list when the narration fetch fails", async () => {
    fetchMoments.mockResolvedValue([]);
    fetchBgmFiles.mockResolvedValue({ files: [] } satisfies BgmFilesResult);
    fetchNarrationFiles.mockRejectedValue(new Error("boom"));

    const { result } = renderHook(() => useProjectResources({ narrationEnabled: true, narrationDir: undefined }));

    await waitFor(() => expect(result.current.narrationNote).toBe("Couldn't load the narration file list"));
    expect(result.current.narrationFiles).toEqual([]);
  });

  it("fetches bgm files on mount", async () => {
    fetchMoments.mockResolvedValue([]);
    fetchBgmFiles.mockResolvedValue({
      files: [{ path: "media/bgm.mp3", durationS: 120 }],
      note: undefined,
    } satisfies BgmFilesResult);

    const { result } = renderHook(() => useProjectResources({ narrationEnabled: false, narrationDir: undefined }));

    await waitFor(() => expect(result.current.bgmFiles).toHaveLength(1));
    expect(result.current.bgmFilesNote).toBeUndefined();
  });

  it("surfaces a note and empties the bgm list when the bgm fetch fails", async () => {
    fetchMoments.mockResolvedValue([]);
    fetchBgmFiles.mockRejectedValue(new Error("boom"));

    const { result } = renderHook(() => useProjectResources({ narrationEnabled: false, narrationDir: undefined }));

    await waitFor(() =>
      expect(result.current.bgmFilesNote).toBe("Couldn't load the background music file list"),
    );
    expect(result.current.bgmFiles).toEqual([]);
  });
});
