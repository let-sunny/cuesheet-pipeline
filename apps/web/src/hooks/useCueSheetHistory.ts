import { useCallback, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { CueSheet } from "@cuesheet/schema";

export interface HistoryEntry {
  cuesheet: CueSheet;
  selectedIndex: number;
}

export interface UseCueSheetHistoryOptions {
  draft: CueSheet | null;
  setDraft: Dispatch<SetStateAction<CueSheet | null>>;
  selectedIndex: number;
  setSelectedIndex: Dispatch<SetStateAction<number>>;
  /** Fires once an undo actually happens (e.g. so the caller can show a toast). */
  onUndo?: () => void;
}

export interface UseCueSheetHistoryResult {
  canUndo: boolean;
  canRedo: boolean;
  handleUndo: () => void;
  handleRedo: () => void;
  /**
   * Structural changes (add/remove/move/split a cut, add/remove BGM, etc.): records one history
   * entry immediately every time, and cuts off any in-progress continuous-edit burst so the next
   * edit starts a fresh burst.
   */
  recordDiscreteChange: () => void;
  /**
   * Continuous edits (subtitle typing, trim handle dragging, sliders, etc.): only when the burst
   * is empty does this record the state once at the start of editing; subsequent changes just
   * reset the debounce timer. When the timer expires (input stops), the burst closes and the next
   * change opens a new one.
   */
  recordContinuousChange: () => void;
}

/**
 * Undo/redo history for the cuesheet draft: past/future snapshot stacks (session memory only,
 * cleared on refresh), capped at HISTORY_LIMIT, with continuous edits (typing, dragging) merged
 * into a single debounced burst instead of one history entry per keystroke/pixel.
 */
export function useCueSheetHistory({
  draft,
  setDraft,
  selectedIndex,
  setSelectedIndex,
  onUndo,
}: UseCueSheetHistoryOptions): UseCueSheetHistoryResult {
  const [past, setPast] = useState<HistoryEntry[]>([]);
  const [future, setFuture] = useState<HistoryEntry[]>([]);
  const burstActiveRef = useRef(false);
  const burstTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pushHistorySnapshot = useCallback(() => {
    if (!draft) {
      return;
    }
    const snapshot: HistoryEntry = {
      cuesheet: JSON.parse(JSON.stringify(draft)) as CueSheet,
      selectedIndex,
    };
    setPast((prev) => {
      const next = [...prev, snapshot];
      return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
    });
    setFuture([]);
  }, [draft, selectedIndex]);

  const recordDiscreteChange = useCallback(() => {
    if (burstTimerRef.current) {
      clearTimeout(burstTimerRef.current);
      burstTimerRef.current = null;
    }
    burstActiveRef.current = false;
    pushHistorySnapshot();
  }, [pushHistorySnapshot]);

  const recordContinuousChange = useCallback(() => {
    if (!burstActiveRef.current) {
      pushHistorySnapshot();
      burstActiveRef.current = true;
    }
    if (burstTimerRef.current) {
      clearTimeout(burstTimerRef.current);
    }
    burstTimerRef.current = setTimeout(() => {
      burstActiveRef.current = false;
      burstTimerRef.current = null;
    }, BURST_DEBOUNCE_MS);
  }, [pushHistorySnapshot]);

  const handleUndo = useCallback(() => {
    if (!draft || past.length === 0) {
      return;
    }
    const last = past[past.length - 1];
    if (!last) {
      return;
    }
    const currentSnapshot: HistoryEntry = { cuesheet: draft, selectedIndex };
    if (burstTimerRef.current) {
      clearTimeout(burstTimerRef.current);
      burstTimerRef.current = null;
    }
    burstActiveRef.current = false;
    setFuture((f) => [currentSnapshot, ...f].slice(0, HISTORY_LIMIT));
    setPast((p) => p.slice(0, -1));
    setDraft(last.cuesheet);
    setSelectedIndex(last.selectedIndex);
    onUndo?.();
  }, [draft, past, selectedIndex, setDraft, setSelectedIndex, onUndo]);

  const handleRedo = useCallback(() => {
    if (!draft || future.length === 0) {
      return;
    }
    const next = future[0];
    if (!next) {
      return;
    }
    const currentSnapshot: HistoryEntry = { cuesheet: draft, selectedIndex };
    if (burstTimerRef.current) {
      clearTimeout(burstTimerRef.current);
      burstTimerRef.current = null;
    }
    burstActiveRef.current = false;
    setPast((p) => [...p, currentSnapshot].slice(-HISTORY_LIMIT));
    setFuture((f) => f.slice(1));
    setDraft(next.cuesheet);
    setSelectedIndex(next.selectedIndex);
  }, [draft, future, selectedIndex, setDraft, setSelectedIndex]);

  return {
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    handleUndo,
    handleRedo,
    recordDiscreteChange,
    recordContinuousChange,
  };
}

/** Max number of past snapshots kept in the undo history. */
const HISTORY_LIMIT = 50;

/** Debounce interval (ms) for merging continuous edits (subtitle typing, trim handle dragging, etc.) into one batch. */
const BURST_DEBOUNCE_MS = 500;
