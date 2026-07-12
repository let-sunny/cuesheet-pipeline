import { useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { SelectField } from "../ui/SelectField/index.js";
import type {
  Segment,
  SubtitleStyle,
  SubtitleStyleOverride,
  SubtitleStylePresets,
  Title,
} from "@cuesheet/schema";
import { INTRO_OUTRO_MAX_DURATION_S } from "../../clipPaths.js";
import { narrationFileUrl, type NarrationFile } from "../../api.js";
import { useNumericField } from "../../hooks/useNumericField.js";
import type { MergeEligibility } from "../../lib/segmentMerge.js";
import { segmentRangeError } from "../../lib/segmentRangeError.js";
import { mergeSubtitleStyle } from "../../lib/subtitleOverlay.js";
import { subtitleOverflowWarning } from "../../lib/subtitleOverflow.js";
import { RangeGroup } from "./RangeGroup.js";
import { PlaybackGroup } from "./PlaybackGroup.js";
import { SubtitleGroup } from "./SubtitleGroup.js";
import { TitleGroup } from "./TitleGroup.js";
import { ActionsGroup } from "./ActionsGroup.js";
import { styles } from "./SegmentQuickFields.styles.js";

/** The panel's two tabs (2026-07-11, 13-inch density pass) - "Cut" groups the edits made while
 * actually trimming/arranging a cut (Range/Playback/Narration/Actions); "Effects" groups the
 * cosmetic overlay edits (Subtitle/Title). Splitting cuts the panel's vertical length
 * roughly in half so it fits a 13-inch viewport without scrolling. */
type QuickFieldsTab = "cut" | "effects";

interface Props {
  segment: Segment | undefined;
  narrationEnabled: boolean;
  /** List of audio files inside narration.dir (including duration). */
  narrationFiles: NarrationFile[];
  /** Guidance message for cases like folder not set/not found (shown when the file list is empty). */
  narrationNote: string | undefined;
  /** Current (including pre-save) narration folder path, used to build the preview streaming URL. */
  narrationDir: string | undefined;
  onChange: (patch: Partial<Segment>) => void;
  /** Approximate duration (seconds) of this cut's source clip file. Undefined if the clip isn't in the draft highlight data. */
  clipDurationS: number | undefined;
  /** Sets this cut's entire source clip file (ignoring in/out) as the intro/outro. */
  onSetIntro: () => void;
  onSetOutro: () => void;
  /** Whether the [Merge with next cut] button is enabled, and why not if disabled. */
  mergeEligibility: MergeEligibility;
  /** Merges with the next cut (same action as Cmd+J). */
  onMergeNext: () => void;
  /** Duplicates the selected cut right after itself. */
  onDuplicate: () => void;
  /** Deletes this cut (disabled if it's the last remaining cut). */
  onDelete: () => void;
  canDelete: boolean;
  /** Global subtitle style — used as the default/display value for the override in the per-cut subtitle style section. */
  globalSubtitleStyle: SubtitleStyle;
  /** Named subtitle style presets dictionary - lets a cut opt into one via a select above the per-cut override. */
  subtitleStylePresets: SubtitleStylePresets | undefined;
  /** Project frame width (px) — used to estimate whether the subtitle text might overflow the frame. */
  projectWidth: number;
  /** Project fps — derives the In/Out fields' Up/Down arrow-key frame nudge (1/fps), per
   * trim-ux-conventions.md section 4.4 (no hardcoded frame duration). */
  projectFps: number;
  onToggleStyleOverride: (enabled: boolean) => void;
  onChangeStyleOverride: (patch: Partial<SubtitleStyleOverride>) => void;
  onPromoteStyleOverride: () => void;
  onClearStyleOverride: () => void;
  /** Assigns/clears which preset (if any) this cut uses - "" clears back to no preset. */
  onChangeStylePreset: (presetName: string | null) => void;
  /** Turning a title card on/off for this cut (starts as a default typing title when enabled). */
  onToggleTitle: (enabled: boolean) => void;
  onChangeTitle: (patch: Partial<Title>) => void;
}

/**
 * Cut settings (right-hand field panel in the touch-up step, canonical name from PRD section 4 —
 * formerly the "Inspector") - two tabs (2026-07-11, 13-inch density pass): "Cut" (Range ->
 * Playback -> Narration, shown only when in use -> Cut actions) and "Effects" (Subtitle, incl. the
 * per-cut subtitle style preset select/override -> Title, PRD backlog #2). Per-cut Transitions
 * were removed from this panel (see issue - unnecessary for the current editing workflow; schema/
 * render/TransitionsGroup are kept for a future re-add). Reframe (crop) is no longer a group here
 * at all - it moved onto VideoPreview's own
 * toolbar (2026-07-11, "structure matches flow": reframe edits happen ON the video via an
 * overlay, so its entry point belongs there, next to Capture frame). The clip filename field's
 * group membership was ambiguous - the spec doesn't specify it, making it the one element in this
 * panel that needed a judgment call, but since it determines which clip the "Range" applies to,
 * it's placed at the top of the Range group.
 *
 * Composition rule (CLAUDE.md, "groups are components, panels are arrangements"): each functional
 * group is its own component with its own tests (Range/Playback/Subtitle/Title/
 * ActionsGroup) - this panel only owns the numeric-field hooks (a single source of truth per
 * field, shared with nothing else), cross-group derived values (warnings, disabled states), and
 * the active-tab arrangement. Narration (small and conditionally shown) and the destructive-zone
 * Delete button stay inline here rather than becoming their own group components.
 */
export function SegmentQuickFields({
  segment,
  narrationEnabled,
  narrationFiles,
  narrationNote,
  narrationDir,
  onChange,
  clipDurationS,
  onSetIntro,
  onSetOutro,
  mergeEligibility,
  onMergeNext,
  onDuplicate,
  onDelete,
  canDelete,
  globalSubtitleStyle,
  subtitleStylePresets,
  projectWidth,
  projectFps,
  onToggleStyleOverride,
  onChangeStyleOverride,
  onPromoteStyleOverride,
  onClearStyleOverride,
  onChangeStylePreset,
  onToggleTitle,
  onChangeTitle,
}: Props) {
  const [activeTab, setActiveTab] = useState<QuickFieldsTab>("cut");

  // This cut's actual output length (after speed applied) - used for the narration-overlap warning.
  const outputDurationS = segment ? (segment.out - segment.in) / segment.speed : 0;

  // These hooks must run unconditionally (before the `!segment` early return below) - they fall
  // back to placeholder values when there's no selected segment, but the actual fields only
  // render once `segment` is confirmed non-null further down.
  // In/Out get the frame-precision treatment (trim-ux-conventions.md section 4.4): Up/Down steps
  // by 1 frame (derived from project.fps, never hardcoded), Shift+Up/Down by 1s, and typed text
  // accepts M:SS.s shorthand plus a leading +/- as a delta from the current value.
  const frameS = 1 / projectFps;
  const inField = useNumericField({
    value: segment?.in ?? 0,
    coerce: (n) => Math.max(0, n),
    onCommit: (next) => onChange({ in: next }),
    parseTimeShorthand: true,
    step: frameS,
    bigStep: 1,
  });
  const outField = useNumericField({
    value: segment?.out ?? 0,
    coerce: (n) => Math.max(0, n),
    onCommit: (next) => onChange({ out: next }),
    parseTimeShorthand: true,
    step: frameS,
    bigStep: 1,
  });
  const speedField = useNumericField({
    value: segment?.speed ?? 1,
    // Capped at 16 - browsers throw a NotSupportedError setting playbackRate above that.
    coerce: (n) => Math.min(16, Math.max(0.1, n)),
    onCommit: (next) => onChange({ speed: next }),
  });
  const volumeField = useNumericField({
    value: segment ? Math.round(segment.volume * 100) : 100,
    coerce: (n) => Math.min(100, Math.max(0, Math.round(n))),
    onCommit: (next) => onChange({ volume: next / 100 }),
  });
  const titleDurationField = useNumericField({
    value: segment?.title?.durationS ?? DEFAULT_TITLE_DURATION_S,
    coerce: (n) => Math.min(10, Math.max(0.5, n)),
    onCommit: (next) => onChangeTitle({ durationS: next }),
  });
  const titleSizeField = useNumericField({
    value: segment?.title?.size ?? DEFAULT_TITLE_SIZE_PX,
    coerce: (n) => Math.max(1, Math.round(n)),
    onCommit: (next) => onChangeTitle({ size: next }),
  });
  if (!segment) {
    return null;
  }

  const effectiveStyleSize = mergeSubtitleStyle(
    globalSubtitleStyle,
    subtitleStylePresets,
    segment.stylePreset,
    segment.styleOverride,
  ).size;
  const subtitleWarning = subtitleOverflowWarning(segment.subtitle, effectiveStyleSize, projectWidth);

  const selectedNarrationFile = segment.narration
    ? narrationFiles.find((f) => f.name === segment.narration)
    : undefined;
  const narrationDurationWarning =
    selectedNarrationFile?.durationS != null && selectedNarrationFile.durationS > outputDurationS
      ? `${(selectedNarrationFile.durationS - outputDurationS).toFixed(1)}s longer than the cut - overlaps the next cut`
      : null;


  const tooLongForIntroOutro =
    clipDurationS === undefined || clipDurationS > INTRO_OUTRO_MAX_DURATION_S;
  const introOutroDisabledTitle =
    clipDurationS === undefined
      ? "Disabled because this clip's duration is unknown (not in the draft highlight data)"
      : tooLongForIntroOutro
        ? `Clips over 15s (est. ${clipDurationS.toFixed(1)}s) can't be used as intro/outro`
        : null;

  return (
    <VStack gap={1} paddingBlock={2} paddingInline={3} xstyle={styles.panel} data-testid="cut-settings-panel">
      {/* SegmentedControl (not tabs) for the Cut/Effects switch - these are two views of the same
          cut's settings, not separate destinations, so a segmented toggle reads truer than a tab
          bar (2026-07-12 user decision). @astryxdesign/core 0.1.3's SegmentedControl doesn't forward
          data-testid to the DOM (upstream fix in facebook/astryx#3852, unreleased), so tests select
          these by role="radio" + name ("Cut"/"Effects"), not by data-testid. */}
      <SegmentedControl
        value={activeTab}
        onChange={(v) => setActiveTab(v as QuickFieldsTab)}
        label="Cut settings section"
        size="sm"
      >
        <SegmentedControlItem value="cut" label="Cut" />
        <SegmentedControlItem value="effects" label="Effects" />
      </SegmentedControl>

      {activeTab === "cut" ? (
        <>
          <RangeGroup
            clip={segment.clip}
            lengthS={segment.out - segment.in}
            inField={inField}
            outField={outField}
            rangeError={segmentRangeError(segment)}
            isFirst
          />

          <PlaybackGroup speedField={speedField} volumeField={volumeField} speedAtCap={segment.speed >= 16} />

          {/* Narration (shown only when in use) - small and always conditional, kept inline
              rather than promoted to its own group component. */}
          {narrationEnabled ? (
            <VStack gap={1.5} xstyle={styles.groupBorder} data-testid="cut-settings-group-narration">
              <Text type="label" color="secondary" weight="semibold" xstyle={styles.groupLabel}>
                Narration
              </Text>
              <SelectField
                label="File"
                value={segment.narration ?? ""}
                options={[
                  { value: "", label: "(none)" },
                  ...narrationFiles.map((f) => ({
                    value: f.name,
                    label: f.durationS != null ? `${f.name} (${f.durationS.toFixed(1)}s)` : f.name,
                  })),
                ]}
                onChange={(value) => onChange({ narration: value === "" ? null : value })}
                width={180}
              />
              {narrationFiles.length === 0 && narrationNote ? (
                <Text type="supporting" xstyle={styles.narrationEmptyNote}>
                  {narrationNote}
                </Text>
              ) : null}
              {selectedNarrationFile ? (
                <VStack gap={1} xstyle={styles.narrationPreview}>
                  <audio
                    {...stylex.props(styles.narrationAudio)}
                    controls
                    src={narrationFileUrl(selectedNarrationFile.name, narrationDir)}
                  />
                  {narrationDurationWarning ? (
                    <Text type="supporting" xstyle={styles.narrationWarning}>
                      {narrationDurationWarning}
                    </Text>
                  ) : null}
                </VStack>
              ) : null}
            </VStack>
          ) : null}

          <ActionsGroup
            mergeEligibility={mergeEligibility}
            onMergeNext={onMergeNext}
            onDuplicate={onDuplicate}
            onSetIntro={onSetIntro}
            onSetOutro={onSetOutro}
            tooLongForIntroOutro={tooLongForIntroOutro}
            introOutroDisabledTitle={introOutroDisabledTitle}
          />

          {/* Danger zone: Delete is separated out (screen-spec section 4, revised 2026-07-08) - a
              divider + spacing clearly separates it from the cut actions group above, to prevent
              accidental deletion from being pressed alongside other buttons. Grouped with the Cut
              tab (not Effects) since deleting a cut is itself a cut action, not a cosmetic one. */}
          <HStack justify="end" xstyle={styles.dangerZone} data-testid="cut-settings-group-danger">
            <Button
              label="Delete"
              variant="destructive"
              size="sm"
              isDisabled={!canDelete}
              tooltip={canDelete ? undefined : "Can't delete the last remaining cut"}
              onClick={onDelete}
              data-testid="cut-action-delete"
            />
          </HStack>
        </>
      ) : (
        <>
          <SubtitleGroup
            segment={segment}
            subtitleWarning={subtitleWarning}
            subtitleStylePresets={subtitleStylePresets}
            onChangeSubtitle={(subtitle) => onChange({ subtitle })}
            onChangeStylePreset={onChangeStylePreset}
            globalSubtitleStyle={globalSubtitleStyle}
            onToggleStyleOverride={onToggleStyleOverride}
            onChangeStyleOverride={onChangeStyleOverride}
            onPromoteStyleOverride={onPromoteStyleOverride}
            onClearStyleOverride={onClearStyleOverride}
          />

          <TitleGroup
            title={segment.title}
            onToggle={onToggleTitle}
            onChangeTitle={onChangeTitle}
            titleDurationField={titleDurationField}
            titleSizeField={titleSizeField}
          />
        </>
      )}
    </VStack>
  );
}

/** Matches the schema's title.durationS default (3) - the value shown right after the toggle is turned on, before onChangeTitle's first patch lands. */
const DEFAULT_TITLE_DURATION_S = 3;

/** Matches the schema's title.size default (72) - see packages/render/src/remotion/titleCardStyle.ts's TITLE_FONT_SIZE_PX. */
const DEFAULT_TITLE_SIZE_PX = 72;
