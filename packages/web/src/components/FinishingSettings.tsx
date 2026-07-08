import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Slider } from "@astryxdesign/core/Slider";
import type { NarrationConfig, SubtitleBackground, SubtitleStyle } from "@cuesheet/schema";
import { toColorInputValue } from "../lib/subtitleOverlay.js";

interface SubtitleStyleProps {
  subtitleStyle: SubtitleStyle;
  onSubtitleStyleChange: (patch: Partial<SubtitleStyle>) => void;
}

/**
 * "Subtitle style (global)" section of the Export step (③) — following screen-spec section 5's
 * order: one group for size/color/outline / one group for the background box (toggle+color+
 * opacity+padding) / one row for position+edge margin / preview note. Shares its control pattern
 * with the per-cut override (SegmentStyleOverride).
 */
export function SubtitleStyleSettings({ subtitleStyle, onSubtitleStyleChange }: SubtitleStyleProps) {
  const background = subtitleStyle.background ?? null;
  const margin = subtitleStyle.margin ?? DEFAULT_MARGIN;

  function handleBackgroundToggle(enabled: boolean) {
    onSubtitleStyleChange({ background: enabled ? background ?? DEFAULT_BACKGROUND : null });
  }

  function patchBackground(patch: Partial<SubtitleBackground>) {
    const base = background ?? DEFAULT_BACKGROUND;
    onSubtitleStyleChange({ background: { ...base, ...patch } });
  }

  return (
    <div className="settings-group settings-group-wide">
      <h3>Subtitle style (global)</h3>

      {/* Size/color/outline group */}
      <label className="settings-field">
        <span>Font</span>
        <input
          type="text"
          value={subtitleStyle.font}
          onChange={(e) => onSubtitleStyleChange({ font: e.target.value })}
        />
      </label>
      <label className="settings-field">
        <span>Size</span>
        <input
          type="number"
          value={subtitleStyle.size}
          min={1}
          onChange={(e) => {
            const v = e.target.valueAsNumber;
            onSubtitleStyleChange({ size: Number.isNaN(v) ? 0 : v });
          }}
        />
      </label>
      <label className="settings-field">
        <span>
          Color <span className="swatch" style={{ background: subtitleStyle.color }} />
        </span>
        <div className="color-field-inputs">
          <input
            type="color"
            value={toColorInputValue(subtitleStyle.color)}
            onChange={(e) => onSubtitleStyleChange({ color: e.target.value })}
          />
          <input
            type="text"
            value={subtitleStyle.color}
            onChange={(e) => onSubtitleStyleChange({ color: e.target.value })}
          />
        </div>
      </label>
      <label className="settings-field">
        <span>
          Outline color{" "}
          <span className="swatch" style={{ background: subtitleStyle.outlineColor }} />
        </span>
        <div className="color-field-inputs">
          <input
            type="color"
            value={toColorInputValue(subtitleStyle.outlineColor)}
            onChange={(e) => onSubtitleStyleChange({ outlineColor: e.target.value })}
          />
          <input
            type="text"
            value={subtitleStyle.outlineColor}
            onChange={(e) => onSubtitleStyleChange({ outlineColor: e.target.value })}
          />
        </div>
      </label>
      <label className="settings-field">
        <span>Outline width</span>
        <input
          type="number"
          value={subtitleStyle.outlineWidth}
          min={0}
          onChange={(e) => {
            const v = e.target.valueAsNumber;
            onSubtitleStyleChange({ outlineWidth: Number.isNaN(v) ? 0 : v });
          }}
        />
      </label>

      {/* Background box group (toggle+color+opacity+padding) */}
      <CheckboxInput label="Background box" value={background != null} onChange={handleBackgroundToggle} />
      {background ? (
        <>
          <label className="settings-field">
            <span>
              Background color <span className="swatch" style={{ background: background.color }} />
            </span>
            <div className="color-field-inputs">
              <input
                type="color"
                value={toColorInputValue(background.color)}
                onChange={(e) => patchBackground({ color: e.target.value })}
              />
              <input
                type="text"
                value={background.color}
                onChange={(e) => patchBackground({ color: e.target.value })}
              />
            </div>
          </label>
          <Slider
            label="Background opacity"
            value={Math.round(background.opacity * 100)}
            min={0}
            max={100}
            step={5}
            valueDisplay="text"
            onChange={(v: number) => patchBackground({ opacity: v / 100 })}
          />
          <label className="settings-field">
            <span>Background padding (px)</span>
            <input
              type="number"
              min={0}
              max={120}
              value={background.padding}
              onChange={(e) => {
                const v = e.target.valueAsNumber;
                patchBackground({ padding: Number.isNaN(v) ? 0 : v });
              }}
            />
          </label>
        </>
      ) : null}

      {/* Position + edge margin row */}
      <div className="qf-row">
        <label className="qf-field field-medium">
          <span>Position</span>
          <select
            value={subtitleStyle.position}
            onChange={(e) =>
              onSubtitleStyleChange({
                position: e.target.value as SubtitleStyle["position"],
              })
            }
          >
            <option value="bottom">Bottom</option>
            <option value="top">Top</option>
            <option value="center">Center</option>
          </select>
        </label>
        <Slider
          label="Edge margin"
          value={margin}
          min={8}
          max={600}
          step={1}
          valueDisplay="text"
          isDisabled={subtitleStyle.position === "center"}
          onChange={(v: number) => onSubtitleStyleChange({ margin: v })}
        />
      </div>

      <p className="settings-note">Preview live in the video on the ② Edit step</p>
    </div>
  );
}

interface NarrationProps {
  narration: NarrationConfig | undefined;
  onNarrationChange: (patch: Partial<NarrationConfig>) => void;
}

/** "Narration" section of the Export step (③) — enable toggle, folder, overall volume, and guide text. */
export function NarrationSettings({ narration, onNarrationChange }: NarrationProps) {
  return (
    <div className="settings-group">
      <h3>Narration</h3>
      <CheckboxInput
        label="Enable narration"
        value={narration?.enabled ?? false}
        onChange={(enabled) => onNarrationChange({ enabled })}
      />
      {narration?.enabled ? (
        <>
          <p className="narration-guide">
            Put voice files (mp3/m4a/wav) in the folder, then pick a file on each cut — it's
            mixed in starting at that cut.
          </p>
          <label className="settings-field wide-input">
            <span>Folder</span>
            <input
              type="text"
              value={narration.dir}
              placeholder="media/narration"
              onChange={(e) => onNarrationChange({ dir: e.target.value })}
            />
          </label>
          <Slider
            label="Overall volume"
            value={Math.round(narration.volume * 100)}
            min={0}
            max={100}
            step={5}
            valueDisplay="text"
            onChange={(v: number) => onNarrationChange({ volume: v / 100 })}
          />
        </>
      ) : null}
    </div>
  );
}

const DEFAULT_BACKGROUND: SubtitleBackground = { color: "#000000", opacity: 0.75, padding: 8 };

/**
 * Matches the schema's subtitleStyle.margin default (40) — GET /api/cuesheet serves the file
 * as-is without validation, so this is a defensive fallback to safely display this value even
 * when opening an existing cuesheet (from before the margin field was added) that hasn't been
 * saved yet.
 */
const DEFAULT_MARGIN = 40;
