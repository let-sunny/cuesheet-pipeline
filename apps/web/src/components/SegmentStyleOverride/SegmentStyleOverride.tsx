import * as stylex from "@stylexjs/stylex";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Field } from "@astryxdesign/core/Field";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { Slider } from "@astryxdesign/core/Slider";
import { Button } from "@astryxdesign/core/Button";
import type { Segment, SubtitleBackground, SubtitleStyle, SubtitleStyleOverride } from "@cuesheet/schema";
import { useNumericField } from "../../hooks/useNumericField.js";
import { ColorField } from "../ui/ColorField/index.js";
import { NumericInput } from "../ui/NumericInput/index.js";
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
        <div {...stylex.props(styles.fields)}>
          {/* horizontal-labels: labels beside inputs, same arrangement as the global subtitle
              style panel this shares its field set with (SubtitleStyleSettings.tsx) - Size is a
              stock Astryx TextInput via the shared ui/NumericInput adapter, bound to
              useNumericField (see that hook's file comment), Color/Outline color/Background color
              use the shared `ColorField` wrapper. */}
          <FormLayout direction="horizontal-labels">
            <NumericInput field={sizeField} label="Size" width={140} />

            <ColorField
              label="Color"
              inputID="style-override-color"
              value={override.color ?? globalStyle.color}
              onChange={(value) => onChangeOverride({ color: value })}
            />

            <ColorField
              label="Outline color"
              inputID="style-override-outline-color"
              value={override.outlineColor ?? globalStyle.outlineColor}
              onChange={(value) => onChangeOverride({ outlineColor: value })}
            />

            <Field label="Background box" inputID="style-override-bg-toggle" isLabelHidden>
              <CheckboxInput
                label="Background box"
                value={override.background != null}
                onChange={(checked) =>
                  onChangeOverride({
                    background: checked ? override.background ?? DEFAULT_OVERRIDE_BACKGROUND : null,
                  })
                }
              />
            </Field>
            {override.background ? (
              <>
                <ColorField
                  label="Background color"
                  inputID="style-override-bg-color"
                  value={override.background.color}
                  onChange={(value) => onChangeOverride({ background: { ...override.background!, color: value } })}
                />
                {/* Value folded into the label, valueDisplay="none" (2026-07-09 diagnosed fix -
                    see SegmentQuickFields/TitleGroup.tsx's Backdrop dim slider for the full
                    rationale). */}
                <Field label="Background opacity" inputID="style-override-bg-opacity" isLabelHidden>
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
                </Field>
              </>
            ) : null}

            <Field label="Edge margin" inputID="style-override-margin" isLabelHidden>
              <Slider
                label={`Edge margin (${override.margin ?? globalStyle.margin ?? 40}px)`}
                value={override.margin ?? globalStyle.margin ?? 40}
                min={8}
                max={600}
                step={1}
                valueDisplay="none"
                onChange={(v: number) => onChangeOverride({ margin: v })}
              />
            </Field>
          </FormLayout>

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
