import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { VStack } from "@astryxdesign/core/VStack";
import type {
  Segment,
  SubtitleStyle,
  SubtitleStyleOverride,
  SubtitleStylePresets,
} from "@cuesheet/schema";
import { SegmentStyleOverride } from "../SegmentStyleOverride/index.js";
import { SelectField } from "../ui/SelectField/index.js";
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
      {/* Stock Astryx TextArea (2026-07-11) - replaces the native <textarea>, whose hand-styled
          border clashed with the themed inputs (esp. y2k). Label hidden - the group heading above
          already reads "Subtitle"; TextArea keeps a real accessible label in the DOM. */}
      <TextArea
        label="Subtitle"
        isLabelHidden
        value={segment.subtitle}
        rows={2}
        placeholder="Enter subtitle"
        onChange={(value) => onChangeSubtitle(value)}
        data-testid="cut-field-subtitle"
      />
      {subtitleWarning ? (
        <Text type="supporting" xstyle={styles.note}>
          {subtitleWarning}
        </Text>
      ) : null}

      {subtitleStylePresets && Object.keys(subtitleStylePresets).length > 0 ? (
        <SelectField
          label="Style preset"
          value={segment.stylePreset ?? ""}
          options={[
            { value: "", label: "(none)" },
            ...Object.keys(subtitleStylePresets).map((name) => ({ value: name, label: name })),
          ]}
          onChange={(value) => onChangeStylePreset(value === "" ? null : value)}
          width={180}
        />
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
