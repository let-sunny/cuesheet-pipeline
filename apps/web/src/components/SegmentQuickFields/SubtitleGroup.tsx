import * as stylex from "@stylexjs/stylex";
import { Field } from "@astryxdesign/core/Field";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type {
  Segment,
  SubtitleStyle,
  SubtitleStyleOverride,
  SubtitleStylePresets,
} from "@cuesheet/schema";
import { SegmentStyleOverride } from "../SegmentStyleOverride/index.js";
import { InlineField } from "../ui/InlineField/index.js";
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
 * global < preset < override), and the collapsible "Custom style for this cut" override
 * (SegmentStyleOverride, its own component/tests). Always the first group in the Effects tab, so
 * (unlike the other groups) it never needs the dashed top separator.
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
    <VStack gap={1.5} data-testid="cut-settings-group-subtitle">
      <Text type="label" color="secondary" weight="semibold" xstyle={styles.groupLabel}>
        Subtitle
      </Text>
      {/* Label hidden - the group heading above already reads "Subtitle" visually; a real label
          stays in the DOM for accessibility (Field renders it, position:absolute'd out of flow). */}
      <Field label="Subtitle" inputID="cut-field-subtitle" isLabelHidden>
        <textarea
          id="cut-field-subtitle"
          {...stylex.props(styles.subtitleTextarea)}
          value={segment.subtitle}
          rows={2}
          placeholder="Enter subtitle"
          onChange={(e) => onChangeSubtitle(e.target.value)}
          data-testid="cut-field-subtitle"
        />
      </Field>
      {subtitleWarning ? (
        <Text type="supporting" xstyle={styles.note}>
          {subtitleWarning}
        </Text>
      ) : null}

      {subtitleStylePresets && Object.keys(subtitleStylePresets).length > 0 ? (
        <InlineField label="Style preset" inputID="cut-field-style-preset">
          <select
            id="cut-field-style-preset"
            {...stylex.props(styles.plainField, styles.selectMedium)}
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
        </InlineField>
      ) : null}

      <SegmentStyleOverride
        segment={segment}
        globalStyle={globalSubtitleStyle}
        onToggle={onToggleStyleOverride}
        onChangeOverride={onChangeStyleOverride}
        onPromote={onPromoteStyleOverride}
        onClear={onClearStyleOverride}
      />
    </VStack>
  );
}
