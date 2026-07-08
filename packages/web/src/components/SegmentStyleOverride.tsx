import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { Slider } from "@astryxdesign/core/Slider";
import { Button } from "@astryxdesign/core/Button";
import type { Segment, SubtitleBackground, SubtitleStyle, SubtitleStyleOverride } from "@cuesheet/schema";
import { toColorInputValue } from "../lib/subtitleOverlay.js";

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
 * "Subtitle style for this cut" nested under the Subtitle (G3) group - turning it on creates
 * segment.styleOverride (initially a copy of the global style), letting you edit
 * size/color/outlineColor/background/margin for this cut alone. The on/off toggle (a data
 * change) is kept separate from the disclosure that expands/collapses the detail fields (pure
 * UI) - because Astryx's Collapsible trigger is a single button, and nesting a checkbox inside
 * it (invalid HTML nesting + click-bubbling conflict) could accidentally turn the override on
 * just by expanding it. The left vertical line (.qf-style-override) marks it as "belonging to
 * subtitle" - keeping it from looking like an independent section is this component's core
 * reason for existing (screen-spec section 4, "key fix for the current problem").
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

  return (
    <div className="qf-style-override">
      <div className="qf-style-override-toggle">
        <CheckboxInput label="Subtitle style for this cut" value={!!override} onChange={onToggle} />
      </div>

      {override ? (
        <Collapsible trigger="Style details" defaultIsOpen>
          <div className="style-override-fields">
            <label className="settings-field">
              <span>Size</span>
              <input
                type="number"
                className="plain-field"
                min={1}
                value={override.size ?? globalStyle.size}
                onChange={(e) => {
                  const v = e.target.valueAsNumber;
                  onChangeOverride({ size: Number.isNaN(v) ? globalStyle.size : v });
                }}
              />
            </label>

            <label className="settings-field">
              <span>
                Color <span className="swatch" style={{ background: override.color ?? globalStyle.color }} />
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
                <span className="swatch" style={{ background: override.outlineColor ?? globalStyle.outlineColor }} />
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
                    Background color <span className="swatch" style={{ background: override.background.color }} />
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
                <Slider
                  label="Background opacity"
                  value={Math.round(override.background.opacity * 100)}
                  min={0}
                  max={100}
                  step={5}
                  valueDisplay="text"
                  onChange={(v: number) =>
                    onChangeOverride({ background: { ...override.background!, opacity: v / 100 } })
                  }
                />
              </>
            ) : null}

            <Slider
              label="Edge margin"
              value={override.margin ?? globalStyle.margin ?? 40}
              min={8}
              max={600}
              step={1}
              valueDisplay="text"
              onChange={(v: number) => onChangeOverride({ margin: v })}
            />

            <div className="style-override-actions">
              <Button label="Apply to all cuts" variant="secondary" size="sm" onClick={onPromote} />
              <Button label="Remove override" variant="ghost" size="sm" onClick={onClear} />
            </div>
          </div>
        </Collapsible>
      ) : null}
    </div>
  );
}

const DEFAULT_OVERRIDE_BACKGROUND: SubtitleBackground = { color: "#000000", opacity: 0.75, padding: 8 };
