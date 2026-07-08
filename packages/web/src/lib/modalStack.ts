import { useEffect, useRef } from "react";

/**
 * Ref-counted "is any blocking overlay currently open" flag - dialogs (RenderSettingsDialog) and
 * other surfaces that own their own keyboard shortcuts (e.g. crop edit mode) register themselves
 * here via useBlockingOverlay. App's global keydown handler checks isBlockingOverlayOpen() first,
 * before anything else, so keys like o/Space/arrows (which mutate the selected cut/video) can't
 * leak through to the cut behind an open dialog or an in-progress crop edit.
 *
 * A plain counter (module-scope, not React state) is enough - App's handler only needs a
 * synchronous read at keydown time, not a reactive re-render when it changes. A counter (rather
 * than a single boolean) supports more than one registrant existing at once without one closing
 * early clobbering another's "open" state.
 */
let openCount = 0;

export function isBlockingOverlayOpen(): boolean {
  return openCount > 0;
}

/** Registers `isOpen` as a source of "a blocking overlay is open" for as long as it's true. */
export function useBlockingOverlay(isOpen: boolean): void {
  const registeredRef = useRef(false);

  useEffect(() => {
    if (isOpen && !registeredRef.current) {
      openCount += 1;
      registeredRef.current = true;
    } else if (!isOpen && registeredRef.current) {
      openCount -= 1;
      registeredRef.current = false;
    }
    return () => {
      if (registeredRef.current) {
        openCount -= 1;
        registeredRef.current = false;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);
}
