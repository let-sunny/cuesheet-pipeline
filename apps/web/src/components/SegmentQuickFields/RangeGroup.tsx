import * as stylex from "@stylexjs/stylex";
import type { NumericFieldBindings } from "../../hooks/useNumericField.js";
import { styles } from "./RangeGroup.styles.js";

export interface RangeGroupProps {
  clip: string;
  lengthS: number;
  inField: NumericFieldBindings;
  outField: NumericFieldBindings;
}

/**
 * G1. Range - clip filename (read-only) + In/Out + computed Length (screen-spec section 4).
 * The clip filename is shown as read-only text only - the only proper way to change which source
 * clip a cut points to is picking a different scene from the Scenes palette or duplicating a cut,
 * so a free-text input was a bug magnet (a typo could easily point at a file that doesn't exist).
 * It still needs to be copyable (selectable), so it's a span, not a disabled input (disabled
 * inputs block selection in some browsers).
 */
export function RangeGroup({ clip, lengthS, inField, outField }: RangeGroupProps) {
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
          <input type="number" className="plain-field" min={0} {...inField} data-testid="cut-field-in" />
        </label>
        <label className="qf-field field-narrow">
          <span>Out</span>
          <input type="number" className="plain-field" min={0} {...outField} data-testid="cut-field-out" />
        </label>
        <span className="qf-readonly">Length {lengthS.toFixed(1)}s</span>
      </div>
    </div>
  );
}
