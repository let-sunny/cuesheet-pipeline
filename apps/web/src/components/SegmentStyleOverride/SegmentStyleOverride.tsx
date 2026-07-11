import * as stylex from "@stylexjs/stylex";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Slider } from "@astryxdesign/core/Slider";
import { Button } from "@astryxdesign/core/Button";
import type { Segment, SubtitleBackground, SubtitleStyle, SubtitleStyleOverride } from "@cuesheet/schema";
import { useNumericField } from "../../hooks/useNumericField.js";
import { toColorInputValue } from "../../lib/subtitleOverlay.js";
import { Swatch } from "../Swatch/index.js";
import { styles } from "./SegmentStyleOverride.styles.js";

interface Props {
  segment: Segment;
  /** The actual displayed value (global style) for fields the override omits — used as the starting edit value and the slider display. */
  globalStyle: SubtitleStyle;
  onToggle: (enabled: boolean) => void;
  onChangeOverride: (patch: Partial<SubtitleStyleOverride>) => void;
  onPromote: () => void;
  onClear: () => void;
}

/**
 * "Custom style for this cut" nested under the Subtitle group - turning it on creates
 * segment.styleOverride (initially a copy of the global style), letting you edit
 * size/color/outlineColor/background/margin for this cut alone. The on/off toggle (a data
 * change) is kept separate from the disclosure that expands/collapses the detail fields (pure
 * UI) - because Astryx's Collapsible trigger is a single button, and nesting a checkbox inside
 * it (invalid HTML nesting + click-bubbling conflict) could accidentally turn the override on
 * just by expanding it. The label dropped the leading "Subtitle" (2026-07-11 QA fix,
 * design-principles.md #3 "remove unnecessary information" - the parent Subtitle group's own
 * label already says that) and the checkbox renders at `size="sm"` rather than full form-label
 * size (design-principles.md #2 - a plain checkbox label reading at default size next to the
 * group's 11px uppercase label was competing with it, reading as a second heading it isn't). The
 * left vertical rule that used to mark "belongs to Subtitle" is dropped too (design-principles.md
 * #4 "remove unnecessary decoration") - nesting inside the Subtitle group's own DOM position
 * already conveys that.
 */
export function SegmentStyleOverride({
  segment,
  globalStyle,
  onToggle,
  onChangeOverride,
  onPromote,
  onClear,
}: Props) {
  const override = segment.styleOverride;

  const sizeField = useNumericField({
    value: override?.size ?? globalStyle.size,
    coerce: (n) => Math.max(1, n),
    onCommit: (next) => onChangeOverride({ size: next }),
  });

  return (
    <div {...stylex.props(styles.override)}>
      <div {...stylex.props(styles.toggle)}>
        <CheckboxInput label="Custom style for this cut" value={!!override} onChange={onToggle} size="sm" />
      </div>

      {override ? (
          <div className="style-override-fields">
            <label className="settings-field">
              <span>Size</span>
              <input type="number" className="plain-field" min={1} {...sizeField} />
            </label>

            <label className="settings-field">
              <span>
                Color <Swatch color={override.color ?? globalStyle.color} />
              </span>
              <div className="color-field-inputs">
                <input
                  type="color"
                  value={toColorInputValue(override.color ?? globalStyle.color)}
                  onChange={(e) => onChangeOverride({ color: e.target.value })}
                />
                <input
                  type="text"
                  className="plain-field"
                  value={override.color ?? globalStyle.color}
                  onChange={(e) => onChangeOverride({ color: e.target.value })}
                />
              </div>
            </label>

            <label className="settings-field">
              <span>
                Outline color{" "}
                <Swatch color={override.outlineColor ?? globalStyle.outlineColor} />
              </span>
              <div className="color-field-inputs">
                <input
                  type="color"
                  value={toColorInputValue(override.outlineColor ?? globalStyle.outlineColor)}
                  onChange={(e) => onChangeOverride({ outlineColor: e.target.value })}
                />
                <input
                  type="text"
                  className="plain-field"
                  value={override.outlineColor ?? globalStyle.outlineColor}
                  onChange={(e) => onChangeOverride({ outlineColor: e.target.value })}
                />
              </div>
            </label>

            <CheckboxInput
              label="Background box"
              value={override.background != null}
              onChange={(checked) =>
                onChangeOverride({
                  background: checked ? override.background ?? DEFAULT_OVERRIDE_BACKGROUND : null,
                })
              }
            />
            {override.background ? (
              <>
                <label className="settings-field">
                  <span>
                    Background color <Swatch color={override.background.color} />
                  </span>
                  <div className="color-field-inputs">
                    <input
                      type="color"
                      value={toColorInputValue(override.background.color)}
                      onChange={(e) =>
                        onChangeOverride({ background: { ...override.background!, color: e.target.value } })
                      }
                    />
                    <input
                      type="text"
                      className="plain-field"
                      value={override.background.color}
                      onChange={(e) =>
                        onChangeOverride({ background: { ...override.background!, color: e.target.value } })
                      }
                    />
                  </div>
                </label>
                {/* Value folded into the label, valueDisplay="none" (2026-07-09 diagnosed fix -
                    see SegmentQuickFields/TitleGroup.tsx's Backdrop dim slider for the full
                    rationale). */}
                <Slider
                  label={`Background opacity (${Math.round(override.background.opacity * 100)}%)`}
                  value={Math.round(override.background.opacity * 100)}
                  min={0}
                  max={100}
                  step={5}
                  valueDisplay="none"
                  onChange={(v: number) =>
                    onChangeOverride({ background: { ...override.background!, opacity: v / 100 } })
                  }
                />
              </>
            ) : null}

            <Slider
              label={`Edge margin (${override.margin ?? globalStyle.margin ?? 40}px)`}
              value={override.margin ?? globalStyle.margin ?? 40}
              min={8}
              max={600}
              step={1}
              valueDisplay="none"
              onChange={(v: number) => onChangeOverride({ margin: v })}
            />

            <div {...stylex.props(styles.actions)}>
              <Button label="Apply to all cuts" variant="secondary" size="sm" onClick={onPromote} />
              <Button label="Remove override" variant="ghost" size="sm" onClick={onClear} />
            </div>
          </div>
      ) : null}
    </div>
  );
}

const DEFAULT_OVERRIDE_BACKGROUND: SubtitleBackground = { color: "#000000", opacity: 0.75, padding: 8 };
