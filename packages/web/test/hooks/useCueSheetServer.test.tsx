// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCueSheetServer } from "../../src/hooks/useCueSheetServer.js";
import { makeCueSheet } from "../helpers/fixtures.js";

afterEach(cleanup);

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

function noopToast() {
  return vi.fn().mockReturnValue(vi.fn());
}

describe("useCueSheetServer", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("loads the cuesheet on mount and starts clean (not dirty)", async () => {
    const sheet = makeCueSheet();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(sheet)));

    const { result } = renderHook(() => useCueSheetServer(noopToast()));
    await waitFor(() => expect(result.current.draft).not.toBeNull());

    expect(result.current.serverCuesheet).toEqual(sheet);
    expect(result.current.dirty).toBe(false);
    expect(result.current.loadError).toBeNull();
  });

  it("surfaces a not-found load error distinctly from a generic one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404, text: async () => "no cuesheet yet" } as Response),
    );
    const { result } = renderHook(() => useCueSheetServer(noopToast()));
    await waitFor(() => expect(result.current.loadError).not.toBeNull());
    expect(result.current.loadError).toEqual({ kind: "not-found", message: "no cuesheet yet" });
  });

  it("surfaces a generic load error for non-404 failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "server exploded" } as Response),
    );
    const { result } = renderHook(() => useCueSheetServer(noopToast()));
    await waitFor(() => expect(result.current.loadError).not.toBeNull());
    expect(result.current.loadError).toEqual({ kind: "error", message: "server exploded" });
  });

  it("becomes dirty once the draft is edited locally, and clean again after a successful save", async () => {
    const sheet = makeCueSheet();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(sheet));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useCueSheetServer(noopToast()));
    await waitFor(() => expect(result.current.draft).not.toBeNull());

    const edited = { ...sheet, project: { ...sheet.project, name: "edited" } };
    act(() => result.current.setDraft(edited));
    expect(result.current.dirty).toBe(true);

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, data: edited }));
    await act(async () => {
      await result.current.handleSave();
    });

    expect(result.current.dirty).toBe(false);
    expect(result.current.serverCuesheet?.project.name).toBe("edited");
    expect(result.current.saveState).toEqual({ status: "success" });
  });

  it("rejects an invalid draft locally (without hitting the network) and reports the field-path error", async () => {
    const sheet = makeCueSheet();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(sheet));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useCueSheetServer(noopToast()));
    await waitFor(() => expect(result.current.draft).not.toBeNull());

    const invalid = {
      ...sheet,
      segments: [{ ...sheet.segments[0], in: 5, out: 1 }],
    };
    act(() => result.current.setDraft(invalid));
    const callsBeforeSave = fetchMock.mock.calls.length;

    await act(async () => {
      await result.current.handleSave();
    });

    expect(fetchMock.mock.calls.length).toBe(callsBeforeSave); // no network call for a locally-invalid draft
    expect(result.current.saveState.status).toBe("error");
    if (result.current.saveState.status === "error") {
      expect(result.current.saveState.errors.some((e) => e.includes("in"))).toBe(true);
    }
  });

  it("surfaces the server's validation errors when the save round-trip itself fails", async () => {
    const sheet = makeCueSheet();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(sheet));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useCueSheetServer(noopToast()));
    await waitFor(() => expect(result.current.draft).not.toBeNull());

    act(() => result.current.setDraft({ ...sheet, project: { ...sheet.project, name: "edited" } }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: false, errors: ["project.name: taken"] }));

    await act(async () => {
      await result.current.handleSave();
    });

    expect(result.current.saveState).toEqual({ status: "error", errors: ["project.name: taken"] });
  });

  it("offers a restore when a localStorage snapshot differs from the freshly loaded server data", async () => {
    const sheet = makeCueSheet();
    localStorage.setItem(
      `cuesheet-draft-snapshot:${sheet.project.name}`,
      JSON.stringify({ cuesheet: { ...sheet, project: { ...sheet.project, name: "unsaved-edit" } }, savedAt: 123 }),
    );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(sheet)));

    const { result } = renderHook(() => useCueSheetServer(noopToast()));
    await waitFor(() => expect(result.current.restoreSnapshot).not.toBeNull());

    act(() => result.current.handleRestoreSnapshot());
    expect(result.current.draft?.project.name).toBe("unsaved-edit");
    expect(result.current.restoreSnapshot).toBeNull();
  });

  it("discarding the snapshot clears it from localStorage without touching the draft", async () => {
    const sheet = makeCueSheet();
    const key = `cuesheet-draft-snapshot:${sheet.project.name}`;
    localStorage.setItem(
      key,
      JSON.stringify({ cuesheet: { ...sheet, project: { ...sheet.project, name: "unsaved-edit" } }, savedAt: 123 }),
    );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(sheet)));

    const { result } = renderHook(() => useCueSheetServer(noopToast()));
    await waitFor(() => expect(result.current.restoreSnapshot).not.toBeNull());

    act(() => result.current.handleDiscardSnapshot());
    expect(result.current.restoreSnapshot).toBeNull();
    expect(result.current.draft?.project.name).toBe(sheet.project.name);
    expect(localStorage.getItem(key)).toBeNull();
  });

  it("debounces a dirty draft into a localStorage snapshot after 1s of quiet", async () => {
    const sheet = makeCueSheet();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(sheet)));
    const { result } = renderHook(() => useCueSheetServer(noopToast()));
    await waitFor(() => expect(result.current.draft).not.toBeNull());

    vi.useFakeTimers();
    // Edits a segment field (not project.name, which is part of the snapshot's storage key) so
    // the snapshot lands under the same key the test reads back from.
    act(() =>
      result.current.setDraft({
        ...sheet,
        segments: [{ ...sheet.segments[0]!, subtitle: "edited" }],
      }),
    );
    const key = `cuesheet-draft-snapshot:${sheet.project.name}`;
    expect(localStorage.getItem(key)).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    const raw = localStorage.getItem(key);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string).cuesheet.segments[0].subtitle).toBe("edited");
  });
});
