// @vitest-environment jsdom
import { useState } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CueSheet } from "@cuesheet/schema";
import { useCueSheetHistory } from "../../src/hooks/useCueSheetHistory.js";
import { makeCueSheet } from "../helpers/fixtures.js";

afterEach(cleanup);

function setup(initial: CueSheet, onUndo?: () => void) {
  return renderHook(() => {
    const [draft, setDraft] = useState<CueSheet | null>(initial);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const history = useCueSheetHistory({ draft, setDraft, selectedIndex, setSelectedIndex, onUndo });
    return { draft, setDraft, selectedIndex, setSelectedIndex, ...history };
  });
}

describe("useCueSheetHistory", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("recordDiscreteChange snapshots before the edit, so undo restores the pre-edit draft", () => {
    const before = makeCueSheet();
    const { result } = setup(before);

    act(() => {
      result.current.recordDiscreteChange();
      result.current.setDraft((d) => (d ? { ...d, project: { ...d.project, name: "after" } } : d));
    });
    expect(result.current.draft?.project.name).toBe("after");
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);

    act(() => result.current.handleUndo());
    expect(result.current.draft?.project.name).toBe(before.project.name);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);

    act(() => result.current.handleRedo());
    expect(result.current.draft?.project.name).toBe("after");
  });

  it("calls onUndo only when an undo actually happens", () => {
    const onUndo = vi.fn();
    const { result } = setup(makeCueSheet(), onUndo);

    act(() => result.current.handleUndo());
    expect(onUndo).not.toHaveBeenCalled();

    act(() => {
      result.current.recordDiscreteChange();
      result.current.setDraft((d) => (d ? { ...d, project: { ...d.project, name: "x" } } : d));
    });
    act(() => result.current.handleUndo());
    expect(onUndo).toHaveBeenCalledOnce();
  });

  it("restores the selectedIndex captured at snapshot time, not the current one", () => {
    const { result } = setup(makeCueSheet());

    // Each state change is committed in its own act() so the next call's closure observes it -
    // batching them together would leave recordDiscreteChange reading the stale pre-batch value.
    act(() => result.current.setSelectedIndex(2));
    act(() => result.current.recordDiscreteChange());
    act(() => result.current.setSelectedIndex(5));
    expect(result.current.selectedIndex).toBe(5);

    act(() => result.current.handleUndo());
    expect(result.current.selectedIndex).toBe(2);
  });

  it("merges rapid continuous changes within the debounce window into a single history entry", () => {
    const { result } = setup(makeCueSheet());

    act(() => {
      result.current.recordContinuousChange();
      result.current.setDraft((d) => (d ? { ...d, project: { ...d.project, name: "v1" } } : d));
    });
    act(() => {
      vi.advanceTimersByTime(100);
      result.current.recordContinuousChange();
      result.current.setDraft((d) => (d ? { ...d, project: { ...d.project, name: "v2" } } : d));
    });
    act(() => {
      vi.advanceTimersByTime(100);
      result.current.recordContinuousChange();
      result.current.setDraft((d) => (d ? { ...d, project: { ...d.project, name: "v3" } } : d));
    });

    expect(result.current.draft?.project.name).toBe("v3");
    // One undo should jump all the way back to the pre-burst state (a single merged entry),
    // not step back through v2/v1.
    act(() => result.current.handleUndo());
    expect(result.current.draft?.project.name).toBe("t");
    expect(result.current.canUndo).toBe(false);
  });

  it("opens a new burst once the debounce timer has fully expired", () => {
    const { result } = setup(makeCueSheet());

    act(() => {
      result.current.recordContinuousChange();
      result.current.setDraft((d) => (d ? { ...d, project: { ...d.project, name: "v1" } } : d));
    });
    act(() => {
      vi.advanceTimersByTime(600); // > BURST_DEBOUNCE_MS, closes the burst
    });
    act(() => {
      result.current.recordContinuousChange();
      result.current.setDraft((d) => (d ? { ...d, project: { ...d.project, name: "v2" } } : d));
    });

    // Two separate bursts -> two undo steps.
    act(() => result.current.handleUndo());
    expect(result.current.draft?.project.name).toBe("v1");
    act(() => result.current.handleUndo());
    expect(result.current.draft?.project.name).toBe("t");
  });

  it("recordDiscreteChange cuts off an in-progress burst so the next edit starts fresh", () => {
    const { result } = setup(makeCueSheet());

    act(() => {
      result.current.recordContinuousChange();
      result.current.setDraft((d) => (d ? { ...d, project: { ...d.project, name: "v1" } } : d));
    });
    act(() => {
      result.current.recordDiscreteChange();
      result.current.setDraft((d) => (d ? { ...d, project: { ...d.project, name: "v2" } } : d));
    });

    act(() => result.current.handleUndo());
    expect(result.current.draft?.project.name).toBe("v1");
    act(() => result.current.handleUndo());
    expect(result.current.draft?.project.name).toBe("t");
  });

  it("caps history at 50 entries, dropping the oldest", () => {
    const { result } = setup(makeCueSheet());

    for (let i = 0; i < 55; i += 1) {
      act(() => {
        result.current.recordDiscreteChange();
        result.current.setDraft((d) => (d ? { ...d, project: { ...d.project, name: `v${i}` } } : d));
      });
    }

    let undoCount = 0;
    while (result.current.canUndo) {
      act(() => result.current.handleUndo());
      undoCount += 1;
    }
    expect(undoCount).toBe(50);
    // The 5 oldest snapshots ("t", v0..v3) were dropped, so the earliest reachable state is v4.
    expect(result.current.draft?.project.name).toBe("v4");
  });
});
