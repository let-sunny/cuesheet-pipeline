import * as stylex from "@stylexjs/stylex";
import type {
  Segment,
  SubtitleStyle,
  SubtitleStyleOverride,
  SubtitleStylePresets,
} from "@cuesheet/schema";
import { SegmentStyleOverride } from "../SegmentStyleOverride/index.js";
import { styles } from "./SubtitleGroup.styles.js";

export interface SubtitleGroupProps {
  segment: Segment;
  subtitleWarning: string | null;
  /** Named subtitle style presets dictionary - lets a cut opt into one via a select above the
   * per-cut override. Select is only shown once at least one preset exists. */
  subtitleStylePresets: SubtitleStylePresets | undefined;
  onChangeSubtitle: (subtitle: string) => void;
  onChangeStylePreset: (presetName: string | null) => void;
  /** The actual displayed value (global style) for fields the per-cut override omits. */
  globalSubtitleStyle: SubtitleStyle;
  onToggleStyleOverride: (enabled: boolean) => void;
  onChangeStyleOverride: (patch: Partial<SubtitleStyleOverride>) => void;
  onPromoteStyleOverride: () => void;
  onClearStyleOverride: () => void;
}

/**
 * G3. Subtitle (+ subsection: per-cut subtitle style) - textarea + optional warning, the Style
 * preset select (shown only once at least one preset exists - merges in ahead of styleOverride,
 * global < preset < override), and the collapsible "Subtitle style for this cut" override
 * (SegmentStyleOverride, its own component/tests).
 */
export function SubtitleGroup({
  segment,
  subtitleWarning,
  subtitleStylePresets,
  onChangeSubtitle,
  onChangeStylePreset,
  globalSubtitleStyle,
  onToggleStyleOverride,
  onChangeStyleOverride,
  onPromoteStyleOverride,
  onClearStyleOverride,
}: SubtitleGroupProps) {
  return (
    <div className="qf-group" data-testid="cut-settings-group-subtitle">
      <div className="qf-group-label">Subtitle</div>
      <label className="qf-field field-full">
        <textarea
          className={`plain-field plain-field-textarea ${stylex.props(styles.subtitleTextarea).className ?? ""}`}
          value={segment.subtitle}
          rows={2}
          placeholder="Enter subtitle"
          onChange={(e) => onChangeSubtitle(e.target.value)}
          data-testid="cut-field-subtitle"
        />
      </label>
      {subtitleWarning ? <p className="qf-note">{subtitleWarning}</p> : null}

      {subtitleStylePresets && Object.keys(subtitleStylePresets).length > 0 ? (
        <label className="qf-field field-medium">
          <span>Style preset</span>
          <select
            className="plain-field"
            value={segment.stylePreset ?? ""}
            onChange={(e) => onChangeStylePreset(e.target.value === "" ? null : e.target.value)}
          >
            <option value="">(none)</option>
            {Object.keys(subtitleStylePresets).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <SegmentStyleOverride
        segment={segment}
        globalStyle={globalSubtitleStyle}
        onToggle={onToggleStyleOverride}
        onChangeOverride={onChangeStyleOverride}
        onPromote={onPromoteStyleOverride}
        onClear={onClearStyleOverride}
      />
    </div>
  );
}
