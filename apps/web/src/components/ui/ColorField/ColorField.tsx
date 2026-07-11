import * as stylex from "@stylexjs/stylex";
import { Field } from "@astryxdesign/core/Field";
import { toColorInputValue } from "../../../lib/subtitleOverlay.js";
import { Swatch } from "../../Swatch/index.js";
import { styles } from "./ColorField.styles.js";

export interface ColorFieldProps {
  label: string;
  inputID: string;
  /** CSS color value (hex/rgb(a)/etc) - passed straight through to the hex text input and Swatch. */
  value: string;
  onChange: (value: string) => void;
}

/**
 * Role: the color-picker composite (native color-swatch input + hex text input + preview Swatch)
 * used by every subtitle-style color field - there's no single Astryx input for "pick a color,
 * see/edit its hex, preview it", so this wraps the 3-piece composite once instead of repeating it
 * at every call site (SubtitleStyleSettings x3, SubtitleStylePresetsSettings x2,
 * SegmentStyleOverride x3 - CLAUDE.md "component layering": the same tweak appearing more than
 * once is the signal to promote it to a wrapper). `toColorInputValue` coerces the stored color
 * (which may be a named/short form) into the 6-digit hex `input[type=color]` requires.
 */
export function ColorField({ label, inputID, value, onChange }: ColorFieldProps) {
  return (
    <Field label={label} inputID={inputID}>
      <div {...stylex.props(styles.row)}>
        <input
          id={inputID}
          type="color"
          {...stylex.props(styles.colorInput)}
          value={toColorInputValue(value)}
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          type="text"
          {...stylex.props(styles.hexInput)}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${label} (hex)`}
        />
        <Swatch color={value} />
      </div>
    </Field>
  );
}
