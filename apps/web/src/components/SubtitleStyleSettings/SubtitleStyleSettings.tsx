import { useEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Field } from "@astryxdesign/core/Field";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { Selector } from "@astryxdesign/core/Selector";
import { Slider } from "@astryxdesign/core/Slider";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import type { SubtitleBackground, SubtitleStyle } from "@cuesheet/schema";
import { useNumericField } from "../../hooks/useNumericField.js";
import {
  subtitleBackgroundRgba,
  subtitleOutlineStyle,
  subtitlePositionStyle,
  toCqw,
} from "../../lib/subtitleOverlay.js";
import { ColorField } from "../ui/ColorField/index.js";
import { styles } from "./SubtitleStyleSettings.styles.js";

export interface SubtitleStyleSettingsProps {
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
 * "Subtitle style (global)" section's fields column - the Export step's `FinishSettingsSection`
 * wrapper owns the heading/description, this renders just the content: a compact live preview
 * stage, then a `FormLayout` of size/color/outline fields, the background box group
 * (toggle+color+opacity+padding), position, and edge margin, then a preview note. Shares its
 * control pattern with the per-cut override (SegmentStyleOverride).
 */
export function SubtitleStyleSettings({
  subtitleStyle,
  onSubtitleStyleChange,
  projectWidth,
  projectHeight,
  previewClip,
  previewClipTimeS,
}: SubtitleStyleSettingsProps) {
  const background = subtitleStyle.background ?? null;
  const margin = subtitleStyle.margin ?? DEFAULT_MARGIN;

  function handleBackgroundToggle(enabled: boolean) {
    onSubtitleStyleChange({ background: enabled ? background ?? DEFAULT_BACKGROUND : null });
  }

  function patchBackground(patch: Partial<SubtitleBackground>) {
    const base = background ?? DEFAULT_BACKGROUND;
    onSubtitleStyleChange({ background: { ...base, ...patch } });
  }

  const sizeField = useNumericField({
    value: subtitleStyle.size,
    coerce: (n) => Math.max(1, n),
    onCommit: (next) => onSubtitleStyleChange({ size: next }),
  });
  const outlineWidthField = useNumericField({
    value: subtitleStyle.outlineWidth,
    coerce: (n) => Math.max(0, n),
    onCommit: (next) => onSubtitleStyleChange({ outlineWidth: next }),
  });
  const paddingField = useNumericField({
    value: (background ?? DEFAULT_BACKGROUND).padding,
    coerce: (n) => Math.min(120, Math.max(0, n)),
    onCommit: (next) => patchBackground({ padding: next }),
  });

  return (
    <>
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

      {/* horizontal-labels: labels beside inputs (FormLayout.doc.mjs's settings-page guidance).
          Size/Outline width stay native <input>s bound to useNumericField (see that hook's file
          comment on why NumberInput's value/onChange/onBlur shape doesn't match), wrapped in Field
          for the label/layout only. Color/Outline color/Background color use the shared
          `ColorField` wrapper (native color-picker + hex-text pair + Swatch preview - a composite
          control with no single Astryx input equivalent). Position is a stock Astryx `Selector`
          (2026-07-11 stock-audit completion pass) - a fixed 3-option enum, unlike IntroOutroEditor's
          dynamic file pickers, so Selector's option model is a clean fit. */}
      <FormLayout direction="horizontal-labels">
        <TextInput label="Font" value={subtitleStyle.font} onChange={(value) => onSubtitleStyleChange({ font: value })} />
        <Field label="Size" inputID="subtitle-size">
          <input id="subtitle-size" type="number" min={1} {...stylex.props(styles.numberInput)} {...sizeField} />
        </Field>
        <ColorField
          label="Color"
          inputID="subtitle-color"
          value={subtitleStyle.color}
          onChange={(value) => onSubtitleStyleChange({ color: value })}
        />
        <ColorField
          label="Outline color"
          inputID="subtitle-outline-color"
          value={subtitleStyle.outlineColor}
          onChange={(value) => onSubtitleStyleChange({ outlineColor: value })}
        />
        <Field label="Outline width" inputID="subtitle-outline-width">
          <input
            id="subtitle-outline-width"
            type="number"
            min={0}
            {...stylex.props(styles.numberInput)}
            {...outlineWidthField}
          />
        </Field>

        {/* Background box group (toggle+color+opacity+padding). CheckboxInput/Slider aren't
            FormLayoutContext-aware (only Field/TextInput/NumberInput/Selector split themselves
            into the horizontal-labels grid's label|control cells - confirmed via their dist
            source), so each is wrapped in its own label-hidden Field here purely so it occupies a
            proper 2-cell grid row instead of desyncing every Field row that follows it (measured
            via a Playwright screenshot pass - labels and fields visibly paired off-by-one without
            this). The control's own inline label (already visible) is the real one; Field's is
            hidden. */}
        <Field label="Background box" inputID="subtitle-bg-toggle" isLabelHidden>
          <CheckboxInput
            label="Background box"
            value={background != null}
            onChange={handleBackgroundToggle}
          />
        </Field>
        {background ? (
          <>
            <ColorField
              label="Background color"
              inputID="subtitle-bg-color"
              value={background.color}
              onChange={(value) => patchBackground({ color: value })}
            />
            {/* Value folded into the label, valueDisplay="none" (2026-07-09 diagnosed fix - see
                SegmentQuickFields/TitleGroup.tsx's Backdrop dim slider for the full rationale: near
                the slider's max, the thumb overlaps an adjacent same-row text display regardless of
                column width). */}
            <Field label="Background opacity" inputID="subtitle-bg-opacity" isLabelHidden>
              <Slider
                label={`Background opacity (${Math.round(background.opacity * 100)}%)`}
                value={Math.round(background.opacity * 100)}
                min={0}
                max={100}
                step={5}
                valueDisplay="none"
                onChange={(v: number) => patchBackground({ opacity: v / 100 })}
              />
            </Field>
            <Field label="Background padding (px)" inputID="subtitle-bg-padding">
              <input
                id="subtitle-bg-padding"
                type="number"
                min={0}
                max={120}
                {...stylex.props(styles.numberInput)}
                {...paddingField}
              />
            </Field>
          </>
        ) : null}

        {/* Position and edge margin - each its own row (2026-07-09 revision: combining them onto
            one shared row squeezed the panel enough to clip the "Position" label and cramp the
            slider - they have plenty of vertical room here, so there's no reason to force them
            onto one line). */}
        <Selector
          label="Position"
          value={subtitleStyle.position}
          onChange={(value) => onSubtitleStyleChange({ position: value as SubtitleStyle["position"] })}
          options={POSITION_OPTIONS}
        />
        <Field label="Edge margin" inputID="subtitle-edge-margin" isLabelHidden>
          <Slider
            label={`Edge margin (${margin}px)`}
            value={margin}
            min={8}
            max={600}
            step={1}
            valueDisplay="none"
            isDisabled={subtitleStyle.position === "center"}
            onChange={(v: number) => onSubtitleStyleChange({ margin: v })}
          />
        </Field>
      </FormLayout>

      <Text type="supporting" color="secondary">
        Preview above updates live; see the ② Edit step for it composited over the actual video.
      </Text>
    </>
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
    <div {...stylex.props(styles.previewStage)}>
      {showThumb ? (
        <img
          {...stylex.props(styles.previewThumb)}
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

const DEFAULT_BACKGROUND: SubtitleBackground = { color: "#000000", opacity: 0.75, padding: 8 };

/**
 * Matches the schema's subtitleStyle.margin default (40) — GET /api/cuesheet serves the file
 * as-is without validation, so this is a defensive fallback to safely display this value even
 * when opening an existing cuesheet (from before the margin field was added) that hasn't been
 * saved yet.
 */
const DEFAULT_MARGIN = 40;

const POSITION_OPTIONS = [
  { value: "bottom", label: "Bottom" },
  { value: "top", label: "Top" },
  { value: "center", label: "Center" },
];
