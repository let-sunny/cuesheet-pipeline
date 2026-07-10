import { useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent } from "react";

export interface UseEditableTitleOptions {
  /** The committed value (single source of truth while not actively editing). */
  value: string;
  /** Called with the trimmed value once the field is committed (blur or Enter) - only if it differs from `value` and isn't empty. */
  onCommit: (next: string) => void;
}

export interface EditableTitleBindings {
  /** Whether the field is currently showing its edit affordance (a text input) instead of the display element. */
  editing: boolean;
  /** In-progress text while editing; irrelevant while not editing. */
  text: string;
  /** Click handler for the display element - enters edit mode, seeded with the current value. */
  startEditing: () => void;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onBlur: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
}

/**
 * Click-to-edit-in-place text field (Notion/Google Docs doc-title convention): a display element
 * that turns into a text input on click, committing on Enter/blur and reverting on Escape.
 *
 * An empty/whitespace-only commit is rejected (reverts to the previous value, `onCommit` not
 * called) rather than being written through - schema requires a non-empty project name, so this
 * keeps the draft from ever holding an unsaveable value in the first place, mirroring
 * useNumericField's "invalid input reverts, doesn't snap to a fallback" behavior.
 */
export function useEditableTitle({ value, onCommit }: UseEditableTitleOptions): EditableTitleBindings {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  // Set right before an Escape-triggered exit so a blur event that fires afterward (browsers blur
  // a focused element on unmount) is recognized as a cancel, not a second commit attempt.
  const cancelingRef = useRef(false);

  function commit(): void {
    setEditing(false);
    if (cancelingRef.current) {
      cancelingRef.current = false;
      return;
    }
    const trimmed = text.trim();
    if (trimmed !== "" && trimmed !== value) {
      onCommit(trimmed);
    }
  }

  return {
    editing,
    text,
    startEditing: () => {
      cancelingRef.current = false;
      setText(value);
      setEditing(true);
    },
    onChange: (e) => setText(e.target.value),
    onBlur: commit,
    onKeyDown: (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.currentTarget.blur();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancelingRef.current = true;
        setEditing(false);
      }
    },
  };
}
