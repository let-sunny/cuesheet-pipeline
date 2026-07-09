import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent } from "react";
import { parseTimeInput } from "../lib/timeInput.js";

export interface UseNumericFieldOptions {
  /** The committed numeric value (single source of truth when the field isn't being actively typed into). */
  value: number;
  /** Called with the coerced value once the field is committed (blur or Enter) - only if it differs from `value`. */
  onCommit: (next: number) => void;
  /**
   * Transforms the parsed number into the value that actually gets committed/displayed - e.g.
   * clamping to a range, rounding to an integer, or snapping to the nearest even number. Runs
   * once, at commit time. Defaults to identity (no transform).
   */
  coerce?: (n: number) => number;
  /**
   * Fires on commit when `coerce` changed what the user actually typed (e.g. snapped an odd
   * number to the nearest even one) - lets the caller show a transient "rounded to N" note.
   * Not called when the input was simply invalid/empty (that reverts silently, no adjustment to explain).
   */
  onAdjusted?: (typed: number, adjusted: number) => void;
  /**
   * When true, typed text is parsed with `parseTimeInput` instead of plain `Number(...)`: accepts
   * `M:SS.s` shorthand and a leading `+`/`-` as a delta from the current value rather than a
   * literal (negative) absolute time. Used by time fields (In/Out) - see
   * `docs/research/trim-ux-conventions.md` section 4.4. Default false (plain number parsing).
   */
  parseTimeShorthand?: boolean;
  /**
   * Enables Up/Down arrow-key stepping: Up/Down adjusts the committed value by `step` and commits
   * immediately (no need to blur), Shift+Up/Down by `bigStep` (falls back to `step` if omitted).
   * Omit both to leave native input stepping untouched. Used by In/Out's frame nudge
   * (`step` = 1/fps, `bigStep` = 1s) - trim-ux-conventions.md section 4.4.
   */
  step?: number;
  bigStep?: number;
}

export interface NumericFieldBindings {
  /** Bind directly to an <input type="number">'s value/onChange/onBlur/onKeyDown. */
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onBlur: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
}

/**
 * Keeps a numeric <input type="number">'s in-progress keystrokes as plain transient text,
 * decoupled from the committed value in the parent. Coercion (NaN fallback / clamping / rounding)
 * only happens once, on blur or Enter — never mid-keystroke.
 *
 * This exists to fix the clear-then-type corruption bug: the old per-field pattern wrote a
 * NaN-fallback straight into parent state on every onChange (e.g. `Number.isNaN(v) ? 0 : v`).
 * Clearing the field fired that fallback immediately, snapping the controlled input's value back
 * to e.g. "0" mid-edit - which desyncs the DOM's actual (uncommitted) text from what React thinks
 * it rendered, corrupting whatever the user types next (observed as "12" -> clear -> type "2.5"
 * committing as "12.5"). Keeping a separate text state that's only reconciled with the parent's
 * value on commit (and only re-synced from the parent while not actively editing) avoids that
 * mid-typing round-trip entirely.
 */
export function useNumericField({
  value,
  onCommit,
  coerce,
  onAdjusted,
  parseTimeShorthand = false,
  step,
  bigStep,
}: UseNumericFieldOptions): NumericFieldBindings {
  const [text, setText] = useState(() => String(value));
  const editingRef = useRef(false);

  // Only follow external value changes while the user isn't actively typing - otherwise an
  // unrelated re-render (e.g. another field's edit) would clobber whatever's mid-typing here.
  useEffect(() => {
    if (!editingRef.current) {
      setText(String(value));
    }
  }, [value]);

  function commit(): void {
    editingRef.current = false;
    const trimmed = text.trim();
    const raw =
      trimmed === "" ? NaN : (parseTimeShorthand ? parseTimeInput(trimmed, value) : Number(trimmed)) ?? NaN;
    // Invalid/empty input reverts to the last committed value rather than snapping to a fallback
    // like 0 - the field just goes back to what it was, no partial commit.
    const parsed = Number.isFinite(raw) ? raw : value;
    const next = coerce ? coerce(parsed) : parsed;
    setText(String(next));
    if (Number.isFinite(raw) && next !== parsed) {
      onAdjusted?.(parsed, next);
    }
    if (next !== value) {
      onCommit(next);
    }
  }

  // Steps the *committed* value by +-delta and commits immediately (not just on blur/Enter) -
  // ignores whatever's mid-typing in `text`, matching every pro NLE's timecode-hot-text nudge
  // (Premiere/FCP: arrow/comma-period nudges the edit point directly, unrelated to free typing).
  function stepBy(delta: number): void {
    editingRef.current = false;
    const rawNext = value + delta;
    const next = coerce ? coerce(rawNext) : rawNext;
    setText(String(next));
    if (next !== value) {
      onCommit(next);
    }
  }

  return {
    value: text,
    onChange: (e) => {
      editingRef.current = true;
      setText(e.target.value);
    },
    onBlur: commit,
    onKeyDown: (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.currentTarget.blur();
        return;
      }
      if (step == null) {
        return;
      }
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const magnitude = e.shiftKey ? (bigStep ?? step) : step;
        stepBy(e.key === "ArrowUp" ? magnitude : -magnitude);
      }
    },
  };
}
