import { useEffect, useState } from "react";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Slider } from "@astryxdesign/core/Slider";
import type { NarrationConfig, SubtitleBackground, SubtitleStyle } from "@cuesheet/schema";
import {
  subtitleBackgroundRgba,
  subtitleOutlineStyle,
  subtitlePositionStyle,
  toCqw,
  toColorInputValue,
} from "../lib/subtitleOverlay.js";

interface SubtitleStyleProps {
  subtitleStyle: SubtitleStyle;
  onSubtitleStyleChange: (patch: Partial<SubtitleStyle>) => void;
  /** Used (with projectHeight) to render the live preview stage at the true on-screen proportions. */
  projectWidth: number;
  projectHeight: number;
  /** First cut's clip/timestamp, for the preview stage's background frame - undefined if there are no cuts yet. */
  previewClip: string | undefined;
  previewClipTimeS: number;
}

/**
 * "Subtitle style (global)" section of the Export step (③) — following screen-spec section 5's
 * order: a compact live preview stage / one group for size/color/outline / one group for the
 * background box (toggle+color+opacity+padding) / position and edge margin each on their own row
 * / preview note. Shares its control pattern with the per-cut override (SegmentStyleOverride).
 */
export function SubtitleStyleSettings({
  subtitleStyle,
  onSubtitleStyleChange,
  projectWidth,
  projectHeight,
  previewClip,
  previewClipTimeS,
}: SubtitleStyleProps) {
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

      {/* Compact live preview - directly under the header so it stays visible while every control
          below it is adjusted (2026-07-09 addition - restores in-place feedback after the earlier,
          bulkier preview was removed; reuses the exact overlay classes/merge helpers the Edit step's
          video uses, not a re-implementation). */}
      <SubtitleStylePreviewStage
        subtitleStyle={subtitleStyle}
        projectWidth={projectWidth}
        projectHeight={projectHeight}
        previewClip={previewClip}
        previewClipTimeS={previewClipTimeS}
      />

      {/* Size/color/outline group */}
      <label className="settings-field field-text-medium">
        <span>Font</span>
        <input
          type="text"
          className="plain-field"
          value={subtitleStyle.font}
          onChange={(e) => onSubtitleStyleChange({ font: e.target.value })}
        />
      </label>
      <label className="settings-field field-narrow">
        <span>Size</span>
        <input
          type="number"
          className="plain-field"
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
            className="plain-field"
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
            className="plain-field"
            value={subtitleStyle.outlineColor}
            onChange={(e) => onSubtitleStyleChange({ outlineColor: e.target.value })}
          />
        </div>
      </label>
      <label className="settings-field field-narrow">
        <span>Outline width</span>
        <input
          type="number"
          className="plain-field"
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
                className="plain-field"
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
          <label className="settings-field field-narrow">
            <span>Background padding (px)</span>
            <input
              type="number"
              className="plain-field"
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

      {/* Position and edge margin - each its own row (2026-07-09 revision: combining them into one
          qf-row squeezed the panel enough to clip the "Position" label and cramp the slider - they
          have plenty of vertical room here, so there's no reason to force them onto one line). */}
      <label className="settings-field field-medium">
        <span>Position</span>
        <select
          className="plain-field"
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

      <p className="settings-note">Preview above updates live; see the ② Edit step for it composited over the actual video.</p>
    </div>
  );
}

interface PreviewStageProps {
  subtitleStyle: SubtitleStyle;
  projectWidth: number;
  projectHeight: number;
  previewClip: string | undefined;
  previewClipTimeS: number;
}

/**
 * Compact (~360px wide, 16:9) live preview of the global subtitle style - a sample line rendered
 * with the exact same overlay CSS (subtitleOverlay.ts helpers, .video-subtitle-overlay* classes)
 * VideoPreview/SequencePlayer use, so this is guaranteed to match rather than drift from the real
 * thing. container-type:inline-size lets font size/outline width/position use cqw units scaled to
 * this stage's actual rendered width, same trick as the Edit step's video frame - so "36px at
 * 720p" reads at the same proportion here as it will in the render, regardless of this stage's
 * fixed display size.
 */
function SubtitleStylePreviewStage({
  subtitleStyle,
  projectWidth,
  projectHeight,
  previewClip,
  previewClipTimeS,
}: PreviewStageProps) {
  const [thumbFailed, setThumbFailed] = useState(false);

  useEffect(() => {
    setThumbFailed(false);
  }, [previewClip]);

  const showThumb = previewClip != null && previewClip !== "" && !thumbFailed;

  return (
    <div className="subtitle-style-preview-stage">
      {showThumb ? (
        <img
          className="subtitle-style-preview-thumb"
          src={`/api/thumb?clip=${encodeURIComponent(previewClip)}&t=${previewClipTimeS.toFixed(1)}`}
          alt=""
          onError={() => setThumbFailed(true)}
        />
      ) : null}
      <div
        className={`video-subtitle-overlay video-subtitle-overlay-${subtitleStyle.position}`}
        style={{
          color: subtitleStyle.color,
          fontFamily: subtitleStyle.font,
          fontSize: toCqw(subtitleStyle.size, projectWidth),
          ...subtitleOutlineStyle(
            subtitleStyle.outlineWidth,
            toCqw(subtitleStyle.outlineWidth, projectWidth),
            subtitleStyle.outlineColor,
          ),
          ...subtitlePositionStyle(subtitleStyle, projectHeight),
        }}
      >
        <span
          className="video-subtitle-overlay-text"
          style={
            subtitleStyle.background
              ? {
                  background: subtitleBackgroundRgba(subtitleStyle.background.color, subtitleStyle.background.opacity),
                  padding: `${subtitleStyle.background.padding}px`,
                }
              : undefined
          }
        >
          자막 미리보기 Aa 123
        </span>
      </div>
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
              className="plain-field"
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
