import * as stylex from "@stylexjs/stylex";
import { Button } from "@astryxdesign/core/Button";
import type {
  Segment,
  SubtitleStyle,
  SubtitleStyleOverride,
  SubtitleStylePresets,
  Title,
  Transition,
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
import { TransitionsGroup } from "./TransitionsGroup.js";
import { ReframeGroup } from "./ReframeGroup.js";
import { ActionsGroup } from "./ActionsGroup.js";
import { styles } from "./SegmentQuickFields.styles.js";

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
  /** Clears the reframe (crop) applied to this cut. */
  onClearCrop: () => void;
  /** Enters reframe edit mode (adjust directly by dragging the overlay on the preview). */
  onEditCrop: () => void;
  /** Whether the [Merge with next cut] button is enabled, and why not if disabled. */
  mergeEligibility: MergeEligibility;
  /** Merges with the next cut (same action as Cmd+J). */
  onMergeNext: () => void;
  /** Splits at the current playback position (same action as Cmd+B). */
  onSplit: () => void;
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
  /** Turning a transitionIn/transitionOut fade or dip on/off for this cut (starts as a default
   * fade, 0.5s, when enabled). */
  onToggleTransition: (side: "in" | "out", enabled: boolean) => void;
  onChangeTransition: (side: "in" | "out", patch: Partial<Transition>) => void;
}

/**
 * Cut settings (right-hand field panel in the touch-up step, canonical name from PRD section 4 —
 * formerly the "Inspector") - follows screen-spec section 4's G1-G8 group order as-is: Range ->
 * Playback -> Subtitle (+ per-cut subtitle style preset select/override) -> Title (title card,
 * PRD backlog #2) -> Transitions (fade/dip, PRD backlog #3) -> Narration (shown only when in use)
 * -> Reframe -> Cut actions. The clip filename field's group membership was ambiguous - the spec
 * doesn't specify it, making it the one element in this panel that needed a judgment call, but
 * since it determines which clip the "Range" applies to, it's placed at the top of the G1 (Range)
 * group.
 *
 * Composition rule (CLAUDE.md, "groups are components, panels are arrangements"): each functional
 * group is its own component with its own tests (Range/Playback/Subtitle/Title/Transitions/
 * Reframe/ActionsGroup) - this panel only owns the numeric-field hooks (a single source of truth
 * per field, shared with nothing else) and cross-group derived values (warnings, disabled states),
 * and arranges the groups in order. Narration (G6, small and conditionally shown) and the
 * destructive-zone Delete button stay inline here rather than becoming their own group components.
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
  onClearCrop,
  onEditCrop,
  mergeEligibility,
  onMergeNext,
  onSplit,
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
  onToggleTransition,
  onChangeTransition,
}: Props) {
  // This cut's actual output length (after speed applied) - used both for the narration-overlap
  // warning below and to cross-validate the two transition durations against it.
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
  // Transition durations are cross-validated against each other (their sum can't exceed this
  // cut's own output length, e.g. a 1s cut can't fit a 0.5s transition on both ends) - each
  // field's coerce clamps against the *other* side's current duration, not just its own 0.2-2s
  // range, so the combined total never exceeds outputDurationS.
  const transitionInDurationField = useNumericField({
    value: segment?.transitionIn?.durationS ?? DEFAULT_TRANSITION_DURATION_S,
    coerce: (n) => {
      const otherDurationS = segment?.transitionOut?.durationS ?? 0;
      const maxAllowed = Math.max(MIN_TRANSITION_DURATION_S, outputDurationS - otherDurationS);
      return Math.min(MAX_TRANSITION_DURATION_S, Math.max(MIN_TRANSITION_DURATION_S, n), maxAllowed);
    },
    onCommit: (next) => onChangeTransition("in", { durationS: next }),
  });
  const transitionOutDurationField = useNumericField({
    value: segment?.transitionOut?.durationS ?? DEFAULT_TRANSITION_DURATION_S,
    coerce: (n) => {
      const otherDurationS = segment?.transitionIn?.durationS ?? 0;
      const maxAllowed = Math.max(MIN_TRANSITION_DURATION_S, outputDurationS - otherDurationS);
      return Math.min(MAX_TRANSITION_DURATION_S, Math.max(MIN_TRANSITION_DURATION_S, n), maxAllowed);
    },
    onCommit: (next) => onChangeTransition("out", { durationS: next }),
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

  const combinedTransitionDurationS =
    (segment.transitionIn?.durationS ?? 0) + (segment.transitionOut?.durationS ?? 0);
  const transitionsCrossValidationNote =
    segment.transitionIn && segment.transitionOut && combinedTransitionDurationS > outputDurationS
      ? `Transition durations clamped to fit this cut's length (${outputDurationS.toFixed(1)}s)`
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
    <div className="quick-fields" data-testid="cut-settings-panel">
      <h2 className="qf-panel-title">Cut settings</h2>

      <RangeGroup
        clip={segment.clip}
        lengthS={segment.out - segment.in}
        inField={inField}
        outField={outField}
        rangeError={segmentRangeError(segment)}
      />

      <PlaybackGroup speedField={speedField} volumeField={volumeField} speedAtCap={segment.speed >= 16} />

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
      />

      <TransitionsGroup
        transitionIn={segment.transitionIn}
        transitionOut={segment.transitionOut}
        onToggle={onToggleTransition}
        onChangeTransition={onChangeTransition}
        transitionInDurationField={transitionInDurationField}
        transitionOutDurationField={transitionOutDurationField}
        crossValidationNote={transitionsCrossValidationNote}
      />

      {/* G6. Narration (shown only when in use) - small and always conditional, kept inline rather
          than promoted to its own group component. */}
      {narrationEnabled ? (
        <div className="qf-group" data-testid="cut-settings-group-narration">
          <div className="qf-group-label">Narration</div>
          <label className="qf-field field-medium">
            <span>File</span>
            <select
              className="plain-field"
              value={segment.narration ?? ""}
              onChange={(e) =>
                onChange({ narration: e.target.value === "" ? null : e.target.value })
              }
            >
              <option value="">(none)</option>
              {narrationFiles.map((f) => (
                <option key={f.name} value={f.name}>
                  {f.name}
                  {f.durationS != null ? ` (${f.durationS.toFixed(1)}s)` : ""}
                </option>
              ))}
            </select>
          </label>
          {narrationFiles.length === 0 && narrationNote ? (
            <p className="narration-empty-note">{narrationNote}</p>
          ) : null}
          {selectedNarrationFile ? (
            <div {...stylex.props(styles.narrationPreview)}>
              <audio
                {...stylex.props(styles.narrationAudio)}
                controls
                src={narrationFileUrl(selectedNarrationFile.name, narrationDir)}
              />
              {narrationDurationWarning ? (
                <p {...stylex.props(styles.narrationWarning)}>{narrationDurationWarning}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <ReframeGroup hasCrop={!!segment.crop} onEditCrop={onEditCrop} onClearCrop={onClearCrop} />

      <ActionsGroup
        mergeEligibility={mergeEligibility}
        onMergeNext={onMergeNext}
        onSplit={onSplit}
        onDuplicate={onDuplicate}
        onSetIntro={onSetIntro}
        onSetOutro={onSetOutro}
        tooLongForIntroOutro={tooLongForIntroOutro}
        introOutroDisabledTitle={introOutroDisabledTitle}
      />

      {/* Danger zone: Delete is separated out (screen-spec section 4, revised 2026-07-08) - a
          divider + spacing clearly separates it from the cut actions group above, to prevent
          accidental deletion from being pressed alongside other buttons. */}
      <div className="qf-danger-zone" data-testid="cut-settings-group-danger">
        <Button
          label="Delete"
          variant="destructive"
          size="sm"
          isDisabled={!canDelete}
          tooltip={canDelete ? undefined : "Can't delete the last remaining cut"}
          onClick={onDelete}
          data-testid="cut-action-delete"
        />
      </div>
    </div>
  );
}

/** Matches the schema's title.durationS default (3) - the value shown right after the toggle is turned on, before onChangeTitle's first patch lands. */
const DEFAULT_TITLE_DURATION_S = 3;

/** Matches the schema's transition.durationS default (0.5) - the value shown right after a
 * transition toggle is turned on, before onChangeTransition's first patch lands. */
const DEFAULT_TRANSITION_DURATION_S = 0.5;

/** Transition duration's own range (screen-spec section 4, G5) - each field's cross-validation
 * clamp (above) additionally caps this against the cut's output length and the other side's duration. */
const MIN_TRANSITION_DURATION_S = 0.2;
const MAX_TRANSITION_DURATION_S = 2;
