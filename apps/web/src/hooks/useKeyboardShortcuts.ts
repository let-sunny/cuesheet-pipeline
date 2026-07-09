import { useEffect } from "react";
import type { RefObject } from "react";
import { isBlockingOverlayOpen } from "../lib/modalStack.js";
import type { SequencePlayerHandle } from "../components/SequencePlayer.js";
import type { VideoPreviewHandle } from "../components/VideoPreview.js";

export type ShortcutAction =
  | { type: "undo" }
  | { type: "redo" }
  | { type: "toggleShortcuts" }
  | { type: "sequenceTogglePlay" }
  | { type: "sequenceShuttleForward" }
  | { type: "sequenceShuttleStop" }
  | { type: "sequenceShuttleBackward" }
  | { type: "selectRelative"; delta: number }
  | { type: "togglePlay" }
  | { type: "setIn" }
  | { type: "setOut" }
  | { type: "seekBy"; seconds: number }
  | { type: "split" }
  | { type: "merge" }
  | { type: "shuttleForward" }
  | { type: "shuttleStop" }
  | { type: "shuttleBackward" };

/** The bits of a keydown event (plus ambient app state) the decision table needs - kept as plain
 * data so `resolveShortcutAction` doesn't need a real KeyboardEvent/DOM to be unit-tested. */
export interface ShortcutContext {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  /** True while an input/textarea is focused (typing should swallow single-letter shortcuts). */
  isTyping: boolean;
  /** True while a dialog or another registered blocking overlay (e.g. crop edit mode) is open. */
  isBlockingOverlay: boolean;
  /** True on the (2) Edit step, where VideoPreview is mounted. */
  isVideoStep: boolean;
  /** True during "Play all" sequence playback. */
  sequenceMode: boolean;
}

export interface UseKeyboardShortcutsOptions {
  step: string;
  sequenceMode: boolean;
  selectedIndex: number;
  selectRelative: (delta: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onToggleShortcuts: () => void;
  onMerge: (selectedIndex: number) => void;
  videoPreviewRef: RefObject<VideoPreviewHandle | null>;
  sequencePlayerRef: RefObject<SequencePlayerHandle | null>;
}

/**
 * Registers the single global keydown handler backing every editor shortcut (Space/J/K/L,
 * I/O, arrows, Tab, Cmd+B/J, Cmd+Z/Shift+Z, ?). The actual key-to-action mapping lives in
 * `resolveShortcutAction` (a pure decision table, unit-tested on its own); this hook only wires
 * that decision to the real refs/callbacks and owns the window listener's lifecycle.
 */
export function useKeyboardShortcuts({
  step,
  sequenceMode,
  selectedIndex,
  selectRelative,
  onUndo,
  onRedo,
  onToggleShortcuts,
  onMerge,
  videoPreviewRef,
  sequencePlayerRef,
}: UseKeyboardShortcutsOptions): void {
  useEffect(() => {
    const isVideoStep = step === "edit";
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const action = resolveShortcutAction({
        key: e.key,
        metaKey: e.metaKey,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        isTyping: target?.tagName === "INPUT" || target?.tagName === "TEXTAREA",
        isBlockingOverlay: isBlockingOverlayOpen(),
        isVideoStep,
        sequenceMode,
      });
      if (!action) {
        return;
      }
      e.preventDefault();
      switch (action.type) {
        case "undo":
          onUndo();
          break;
        case "redo":
          onRedo();
          break;
        case "toggleShortcuts":
          onToggleShortcuts();
          break;
        case "sequenceTogglePlay":
          sequencePlayerRef.current?.togglePlay();
          break;
        case "sequenceShuttleForward":
          sequencePlayerRef.current?.shuttleForward();
          break;
        case "sequenceShuttleStop":
          sequencePlayerRef.current?.shuttleStop();
          break;
        case "sequenceShuttleBackward":
          sequencePlayerRef.current?.shuttleBackward();
          break;
        case "selectRelative":
          selectRelative(action.delta);
          break;
        case "togglePlay":
          videoPreviewRef.current?.togglePlay();
          break;
        case "setIn":
          videoPreviewRef.current?.setInFromCurrent();
          break;
        case "setOut":
          videoPreviewRef.current?.setOutFromCurrent();
          break;
        case "seekBy":
          videoPreviewRef.current?.seekBy(action.seconds);
          break;
        case "split":
          videoPreviewRef.current?.splitAtCurrent();
          break;
        case "merge":
          onMerge(selectedIndex);
          break;
        case "shuttleForward":
          videoPreviewRef.current?.shuttleForward();
          break;
        case "shuttleStop":
          videoPreviewRef.current?.shuttleStop();
          break;
        case "shuttleBackward":
          videoPreviewRef.current?.shuttleBackward();
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    step,
    sequenceMode,
    selectedIndex,
    selectRelative,
    onUndo,
    onRedo,
    onToggleShortcuts,
    onMerge,
    videoPreviewRef,
    sequencePlayerRef,
  ]);
}

/**
 * Pure key-to-action decision table - given the key event's fields plus ambient app state,
 * returns which single action (if any) should fire. Ordering matters (mirrors the original
 * inline handler exactly):
 *   1. A blocking overlay swallows everything, even undo/redo.
 *   2. Cmd/Ctrl+Z (and Shift+Z for redo) fire even while typing, so the app's unified undo/redo
 *      always wins over the browser's native per-field undo.
 *   3. Typing in an input/textarea swallows the rest.
 *   4. "?" toggles the shortcut help, regardless of step/mode.
 *   5. Sequence (Play all) mode has its own small set of keys and returns early.
 *   6. Outside the Edit step, only Up/Down (cut selection) do anything.
 *   7. On the Edit step, the full playback/trim/split/merge/shuttle set applies.
 */
export function resolveShortcutAction(ctx: ShortcutContext): ShortcutAction | null {
  if (ctx.isBlockingOverlay) {
    return null;
  }
  if ((ctx.metaKey || ctx.ctrlKey) && (ctx.key === "z" || ctx.key === "Z")) {
    return ctx.shiftKey ? { type: "redo" } : { type: "undo" };
  }
  if (ctx.isTyping) {
    return null;
  }
  if (ctx.key === "?") {
    return { type: "toggleShortcuts" };
  }
  if (ctx.sequenceMode) {
    if (ctx.key === " ") {
      return { type: "sequenceTogglePlay" };
    }
    if (ctx.key === "l" || ctx.key === "L") {
      return { type: "sequenceShuttleForward" };
    }
    if (ctx.key === "k" || ctx.key === "K") {
      return { type: "sequenceShuttleStop" };
    }
    if ((ctx.key === "j" || ctx.key === "J") && !ctx.metaKey && !ctx.ctrlKey) {
      return { type: "sequenceShuttleBackward" };
    }
    return null;
  }
  if (!ctx.isVideoStep) {
    if (ctx.key === "ArrowUp") {
      return { type: "selectRelative", delta: -1 };
    }
    if (ctx.key === "ArrowDown") {
      return { type: "selectRelative", delta: 1 };
    }
    return null;
  }
  if (ctx.key === " ") {
    return { type: "togglePlay" };
  }
  if (ctx.key === "i" || ctx.key === "I") {
    return { type: "setIn" };
  }
  if (ctx.key === "o" || ctx.key === "O") {
    return { type: "setOut" };
  }
  if (ctx.key === "ArrowLeft" || ctx.key === "ArrowRight") {
    const sign = ctx.key === "ArrowLeft" ? -1 : 1;
    const seekStep = ctx.shiftKey ? 1 : FRAME_SECONDS;
    return { type: "seekBy", seconds: sign * seekStep };
  }
  if (ctx.key === "ArrowUp") {
    return { type: "selectRelative", delta: -1 };
  }
  if (ctx.key === "ArrowDown") {
    return { type: "selectRelative", delta: 1 };
  }
  if (ctx.key === "Tab") {
    return { type: "selectRelative", delta: ctx.shiftKey ? -1 : 1 };
  }
  if ((ctx.metaKey || ctx.ctrlKey) && (ctx.key === "b" || ctx.key === "B")) {
    return { type: "split" };
  }
  if ((ctx.metaKey || ctx.ctrlKey) && (ctx.key === "j" || ctx.key === "J")) {
    return { type: "merge" };
  }
  if (ctx.key === "l" || ctx.key === "L") {
    return { type: "shuttleForward" };
  }
  if (ctx.key === "k" || ctx.key === "K") {
    return { type: "shuttleStop" };
  }
  if (ctx.key === "j" || ctx.key === "J") {
    return { type: "shuttleBackward" };
  }
  return null;
}

/** Distance moved per ArrowLeft/Right press (1 frame, based on 30fps). Shift+Left/Right moves 1 second. */
const FRAME_SECONDS = 1 / 30;
