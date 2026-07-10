import * as stylex from "@stylexjs/stylex";
import type { NumericFieldBindings } from "../../hooks/useNumericField.js";
import { styles } from "./RangeGroup.styles.js";

export interface RangeGroupProps {
  clip: string;
  lengthS: number;
  inField: NumericFieldBindings;
  outField: NumericFieldBindings;
  /** Schema's own "in must be less than out" message (with its swap hint when derivable) when
   * this cut's in/out is currently invalid - single-sourced from segmentRangeError so it never
   * drifts from what Save would report. null when in/out is currently valid. */
  rangeError: string | null;
}

/**
 * G1. Range - clip filename (read-only) + In/Out + computed Length (screen-spec section 4).
 * The clip filename is shown as read-only text only - the only proper way to change which source
 * clip a cut points to is picking a different scene from the Scenes palette or duplicating a cut,
 * so a free-text input was a bug magnet (a typo could easily point at a file that doesn't exist).
 * It still needs to be copyable (selectable), so it's a span, not a disabled input (disabled
 * inputs block selection in some browsers).
 */
export function RangeGroup({ clip, lengthS, inField, outField, rangeError }: RangeGroupProps) {
  return (
    <div className="qf-group" data-testid="cut-settings-group-range">
      <div className="qf-group-label">Range</div>
      <div className="qf-field field-full">
        <span>clip</span>
        <span {...stylex.props(styles.readonlyValue)} title={clip}>
          {clip}
        </span>
      </div>
      <div className="qf-row">
        <label className="qf-field field-narrow">
          <span>In</span>
          {/* type="text", not "number" - a native number input sanitizes any value that isn't
              plain float syntax back to "" (no leading "+", no ":"), which would silently eat the
              M:SS.s shorthand and relative +/-n entry (trim-ux-conventions.md section 4.4) before
              our own parser ever sees it. Up/Down frame-stepping is handled entirely in JS
              (useNumericField's step/bigStep), so the native spinner isn't needed either. */}
          <input
            type="text"
            inputMode="decimal"
            className="plain-field"
            {...inField}
            data-testid="cut-field-in"
          />
        </label>
        <label className="qf-field field-narrow">
          <span>Out</span>
          <input
            type="text"
            inputMode="decimal"
            className="plain-field"
            {...outField}
            data-testid="cut-field-out"
          />
        </label>
        <span
          className="qf-readonly"
          {...stylex.props(!!rangeError && styles.lengthErrorText)}
          data-testid="cut-range-length"
        >
          Length {lengthS.toFixed(1)}s
        </span>
      </div>
      {rangeError ? (
        <p {...stylex.props(styles.rangeError)} role="alert" data-testid="cut-range-error">
          {rangeError}
        </p>
      ) : null}
    </div>
  );
}
