import { describe, expect, it } from "vitest";
import { resolveShortcutAction } from "../../src/hooks/useKeyboardShortcuts.js";
import type { ShortcutContext } from "../../src/hooks/useKeyboardShortcuts.js";

function ctx(overrides: Partial<ShortcutContext> = {}): ShortcutContext {
  return {
    key: "a",
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    isTyping: false,
    isBlockingOverlay: false,
    isVideoStep: false,
    sequenceMode: false,
    ...overrides,
  };
}

describe("resolveShortcutAction", () => {
  it("a blocking overlay swallows everything, including undo/redo", () => {
    expect(resolveShortcutAction(ctx({ isBlockingOverlay: true, key: "z", metaKey: true }))).toBeNull();
    expect(resolveShortcutAction(ctx({ isBlockingOverlay: true, key: "?" }))).toBeNull();
    expect(resolveShortcutAction(ctx({ isBlockingOverlay: true, isVideoStep: true, key: " " }))).toBeNull();
  });

  it("Cmd/Ctrl+Z undoes, Shift+Z redoes, even while typing", () => {
    expect(resolveShortcutAction(ctx({ key: "z", metaKey: true }))).toEqual({ type: "undo" });
    expect(resolveShortcutAction(ctx({ key: "z", ctrlKey: true }))).toEqual({ type: "undo" });
    expect(resolveShortcutAction(ctx({ key: "Z", metaKey: true, shiftKey: true }))).toEqual({ type: "redo" });
    expect(resolveShortcutAction(ctx({ key: "z", metaKey: true, isTyping: true }))).toEqual({ type: "undo" });
  });

  it("typing swallows every other shortcut", () => {
    expect(resolveShortcutAction(ctx({ key: "?", isTyping: true }))).toBeNull();
    expect(resolveShortcutAction(ctx({ key: " ", isVideoStep: true, isTyping: true }))).toBeNull();
    expect(resolveShortcutAction(ctx({ key: "ArrowUp", isTyping: true }))).toBeNull();
  });

  it("'?' toggles shortcut help regardless of step/mode", () => {
    expect(resolveShortcutAction(ctx({ key: "?" }))).toEqual({ type: "toggleShortcuts" });
    expect(resolveShortcutAction(ctx({ key: "?", isVideoStep: true }))).toEqual({ type: "toggleShortcuts" });
    expect(resolveShortcutAction(ctx({ key: "?", sequenceMode: true }))).toEqual({ type: "toggleShortcuts" });
  });

  describe("sequence (Play all) mode", () => {
    it("maps Space/L/K/J to sequence playback actions", () => {
      expect(resolveShortcutAction(ctx({ sequenceMode: true, key: " " }))).toEqual({ type: "sequenceTogglePlay" });
      expect(resolveShortcutAction(ctx({ sequenceMode: true, key: "l" }))).toEqual({ type: "sequenceShuttleForward" });
      expect(resolveShortcutAction(ctx({ sequenceMode: true, key: "K" }))).toEqual({ type: "sequenceShuttleStop" });
      expect(resolveShortcutAction(ctx({ sequenceMode: true, key: "j" }))).toEqual({ type: "sequenceShuttleBackward" });
    });

    it("Cmd/Ctrl+J is not treated as the reverse-shuttle key (leaves room for a future merge-like binding)", () => {
      expect(resolveShortcutAction(ctx({ sequenceMode: true, key: "j", metaKey: true }))).toBeNull();
    });

    it("unmapped keys are ignored", () => {
      expect(resolveShortcutAction(ctx({ sequenceMode: true, key: "x" }))).toBeNull();
      expect(resolveShortcutAction(ctx({ sequenceMode: true, key: "Tab" }))).toBeNull();
    });
  });

  describe("outside the Edit step", () => {
    it("only Up/Down move the cut selection", () => {
      expect(resolveShortcutAction(ctx({ key: "ArrowUp" }))).toEqual({ type: "selectRelative", delta: -1 });
      expect(resolveShortcutAction(ctx({ key: "ArrowDown" }))).toEqual({ type: "selectRelative", delta: 1 });
    });

    it("video-step-only keys (space, i/o, tab) do nothing", () => {
      expect(resolveShortcutAction(ctx({ key: " " }))).toBeNull();
      expect(resolveShortcutAction(ctx({ key: "i" }))).toBeNull();
      expect(resolveShortcutAction(ctx({ key: "Tab" }))).toBeNull();
    });
  });

  describe("on the Edit step", () => {
    it("Space toggles play, I/O set in/out", () => {
      expect(resolveShortcutAction(ctx({ isVideoStep: true, key: " " }))).toEqual({ type: "togglePlay" });
      expect(resolveShortcutAction(ctx({ isVideoStep: true, key: "i" }))).toEqual({ type: "setIn" });
      expect(resolveShortcutAction(ctx({ isVideoStep: true, key: "O" }))).toEqual({ type: "setOut" });
    });

    it("Left/Right seek by one frame, Shift+Left/Right seek by one second", () => {
      const FRAME_SECONDS = 1 / 30;
      expect(resolveShortcutAction(ctx({ isVideoStep: true, key: "ArrowLeft" }))).toEqual({
        type: "seekBy",
        seconds: -FRAME_SECONDS,
      });
      expect(resolveShortcutAction(ctx({ isVideoStep: true, key: "ArrowRight" }))).toEqual({
        type: "seekBy",
        seconds: FRAME_SECONDS,
      });
      expect(resolveShortcutAction(ctx({ isVideoStep: true, key: "ArrowRight", shiftKey: true }))).toEqual({
        type: "seekBy",
        seconds: 1,
      });
    });

    it("Up/Down still move the cut selection", () => {
      expect(resolveShortcutAction(ctx({ isVideoStep: true, key: "ArrowUp" }))).toEqual({
        type: "selectRelative",
        delta: -1,
      });
      expect(resolveShortcutAction(ctx({ isVideoStep: true, key: "ArrowDown" }))).toEqual({
        type: "selectRelative",
        delta: 1,
      });
    });

    it("Tab/Shift+Tab move the cut selection forward/backward", () => {
      expect(resolveShortcutAction(ctx({ isVideoStep: true, key: "Tab" }))).toEqual({
        type: "selectRelative",
        delta: 1,
      });
      expect(resolveShortcutAction(ctx({ isVideoStep: true, key: "Tab", shiftKey: true }))).toEqual({
        type: "selectRelative",
        delta: -1,
      });
    });

    it("Cmd/Ctrl+B splits, Cmd/Ctrl+J merges (takes priority over plain J's shuttle)", () => {
      expect(resolveShortcutAction(ctx({ isVideoStep: true, key: "b", metaKey: true }))).toEqual({ type: "split" });
      expect(resolveShortcutAction(ctx({ isVideoStep: true, key: "j", ctrlKey: true }))).toEqual({ type: "merge" });
    });

    it("plain L/K/J drive the shuttle", () => {
      expect(resolveShortcutAction(ctx({ isVideoStep: true, key: "L" }))).toEqual({ type: "shuttleForward" });
      expect(resolveShortcutAction(ctx({ isVideoStep: true, key: "k" }))).toEqual({ type: "shuttleStop" });
      expect(resolveShortcutAction(ctx({ isVideoStep: true, key: "j" }))).toEqual({ type: "shuttleBackward" });
    });

    it("unmapped keys do nothing", () => {
      expect(resolveShortcutAction(ctx({ isVideoStep: true, key: "x" }))).toBeNull();
    });
  });
});
