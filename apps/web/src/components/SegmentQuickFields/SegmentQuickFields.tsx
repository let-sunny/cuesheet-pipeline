import * as stylex from "@stylexjs/stylex";
import { Button } from "@astryxdesign/core/Button";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Slider } from "@astryxdesign/core/Slider";
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
import { mergeSubtitleStyle } from "../../lib/subtitleOverlay.js";
import { subtitleOverflowWarning } from "../../lib/subtitleOverflow.js";
import { SegmentStyleOverride } from "../SegmentStyleOverride/index.js";
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
  // These hooks must run unconditionally (before the `!segment` early return below) - they fall
  // back to placeholder values when there's no selected segment, but the actual fields only
  // render once `segment` is confirmed non-null further down.
  const inField = useNumericField({
    value: segment?.in ?? 0,
    coerce: (n) => Math.max(0, n),
    onCommit: (next) => onChange({ in: next }),
  });
  const outField = useNumericField({
    value: segment?.out ?? 0,
    coerce: (n) => Math.max(0, n),
    onCommit: (next) => onChange({ out: next }),
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
  const transitionInDurationField = useNumericField({
    value: segment?.transitionIn?.durationS ?? DEFAULT_TRANSITION_DURATION_S,
    coerce: (n) => Math.min(2, Math.max(0.2, n)),
    onCommit: (next) => onChangeTransition("in", { durationS: next }),
  });
  const transitionOutDurationField = useNumericField({
    value: segment?.transitionOut?.durationS ?? DEFAULT_TRANSITION_DURATION_S,
    coerce: (n) => Math.min(2, Math.max(0.2, n)),
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

  // This cut's actual output length (after speed applied). If the selected narration file is longer than this, it overlaps the next cut.
  const outputDurationS = (segment.out - segment.in) / segment.speed;
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
    <div className="quick-fields" data-testid="cut-settings-panel">
      <h2 className="qf-panel-title">Cut settings</h2>

      {/* G1. Range */}
      <div className="qf-group" data-testid="cut-settings-group-range">
        <div className="qf-group-label">Range</div>
        {/* The clip filename is shown as read-only text only (revised 2026-07-08) - the only
            proper way to change which source clip this cut points to is (1) picking a different
            scene from the Scenes palette or duplicating a cut, so a free-text input was a bug
            magnet: a typo could easily point at a file that doesn't exist. It still needs to be
            copyable (selectable), so it's shown as plain text (a span, not a disabled input -
            disabled inputs block selection in some browsers). */}
        <div className="qf-field field-full">
          <span>clip</span>
          <span {...stylex.props(styles.readonlyValue)} title={segment.clip}>
            {segment.clip}
          </span>
        </div>
        <div className="qf-row">
          <label className="qf-field field-narrow">
            <span>In</span>
            <input type="number" className="plain-field" min={0} {...inField} data-testid="cut-field-in" />
          </label>
          <label className="qf-field field-narrow">
            <span>Out</span>
            <input type="number" className="plain-field" min={0} {...outField} data-testid="cut-field-out" />
          </label>
          <span className="qf-readonly">Length {(segment.out - segment.in).toFixed(1)}s</span>
        </div>
      </div>

      {/* G2. Playback */}
      <div className="qf-group" data-testid="cut-settings-group-playback">
        <div className="qf-group-label">Playback</div>
        <div className="qf-row">
          <label className="qf-field field-narrow">
            <span>Speed</span>
            <input
              type="number"
              className="plain-field"
              min={0.1}
              max={16}
              step={0.1}
              title="Speed is capped at 16x - browsers can't play video faster than that"
              {...speedField}
              data-testid="cut-field-speed"
            />
            <span className="qf-suffix">x</span>
          </label>
          <label className="qf-field field-narrow">
            <span>Volume</span>
            <input
              type="number"
              className="plain-field"
              min={0}
              max={100}
              step={1}
              {...volumeField}
              data-testid="cut-field-volume"
            />
            <span className="qf-suffix">%</span>
          </label>
        </div>
        {segment.speed >= 16 ? (
          <p className="qf-note">Speed is capped at 16x - browsers can't play video faster than that.</p>
        ) : null}
      </div>

      {/* G3. Subtitle (+ subsection: per-cut subtitle style) */}
      <div className="qf-group" data-testid="cut-settings-group-subtitle">
        <div className="qf-group-label">Subtitle</div>
        <label className="qf-field field-full">
          <textarea
            className={`plain-field plain-field-textarea ${stylex.props(styles.subtitleTextarea).className ?? ""}`}
            value={segment.subtitle}
            rows={2}
            placeholder="Enter subtitle"
            onChange={(e) => onChange({ subtitle: e.target.value })}
            data-testid="cut-field-subtitle"
          />
        </label>
        {subtitleWarning ? <p className="qf-note">{subtitleWarning}</p> : null}

        {/* Preset select sits above the per-cut override (screen-spec section 4) - picking a
            preset here merges it in ahead of styleOverride (global < preset < override), so a
            cut can use a named look (e.g. "inner-voice") without needing its own override. */}
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

      {/* G4. Title card (screen-spec section 4 - placed after Subtitle, before Reframe). Turning it
          on starts with a default typing title (3s, no dim) so the preview shows something
          immediately, matching the same "toggle starts from a sane default" pattern as the
          per-cut subtitle style override above. */}
      <div className="qf-group" data-testid="cut-settings-group-title">
        <div className="qf-group-label">Title</div>
        {/* CheckboxInput (unlike Button/Tab/Slider) doesn't forward arbitrary data-* props to the
            DOM (no `...rest` spread in its implementation) - select this in tests by ARIA role +
            accessible name instead: getByRole("checkbox", { name: "Title card for this cut" }). */}
        <CheckboxInput label="Title card for this cut" value={!!segment.title} onChange={onToggleTitle} />
        {segment.title ? (
          <>
            <label className="qf-field field-full">
              <span>Text</span>
              <input
                type="text"
                className="plain-field"
                maxLength={80}
                value={segment.title.text}
                onChange={(e) => onChangeTitle({ text: e.target.value })}
                data-testid="cut-field-title-text"
              />
            </label>
            <div className="qf-row">
              <label className="qf-field field-medium">
                <span>Preset</span>
                <select
                  className="plain-field"
                  value={segment.title.preset}
                  onChange={(e) => onChangeTitle({ preset: e.target.value as Title["preset"] })}
                  data-testid="cut-field-title-preset"
                >
                  <option value="typing">Typing</option>
                  <option value="gooey">Gooey</option>
                  <option value="melt">Melt</option>
                  <option value="particle">Particle</option>
                </select>
              </label>
              <label className="qf-field field-narrow">
                {/* "Dur." (not "Duration") - the row's fixed 40px label column (screen-spec section 4's
                    measured G1/G2 width tokens, reused here) was tuned for short labels like
                    Speed/Volume; "Duration" overflowed it and visually collided with the input. */}
                <span>Dur.</span>
                <input type="number" className="plain-field" min={0.5} max={10} step={0.5} {...titleDurationField} />
                <span className="qf-suffix">s</span>
              </label>
            </div>
            <Slider
              label="Backdrop dim"
              value={Math.round((segment.title.backdrop?.dim ?? 0) * 100)}
              min={0}
              max={100}
              step={5}
              valueDisplay="text"
              onChange={(v: number) => onChangeTitle({ backdrop: v === 0 ? undefined : { dim: v / 100 } })}
            />
          </>
        ) : null}
      </div>

      {/* G5. Transitions (fade/dip, PRD backlog #3, screen-spec section 4 - placed after Title,
          before Narration: Title and Transitions are both "what happens at/over the edges of this
          cut's frame" concerns). Two independent optional transitions (cut start / cut end), each
          toggled on with the same "starts from a sane default" pattern as Title above (fade,
          0.5s). Dip amount only applies (and is only shown) when type is Dip - Fade always fades
          fully to black. */}
      <div className="qf-group" data-testid="cut-settings-group-transitions">
        <div className="qf-group-label">Transitions</div>
        <div {...stylex.props(styles.transition)}>
          {/* Select by role/name in tests, not testid - see the Title toggle's comment above. */}
          <CheckboxInput
            label="Transition in"
            value={!!segment.transitionIn}
            onChange={(enabled) => onToggleTransition("in", enabled)}
          />
          {segment.transitionIn ? (
            <>
              <div className="qf-row">
                <label className="qf-field field-medium">
                  <span>Type</span>
                  <select
                    className="plain-field"
                    value={segment.transitionIn.type}
                    onChange={(e) => onChangeTransition("in", { type: e.target.value as Transition["type"] })}
                  >
                    <option value="fade">Fade</option>
                    <option value="dip">Dip</option>
                  </select>
                </label>
                <label className="qf-field field-narrow">
                  <span>Dur.</span>
                  <input
                    type="number"
                    className="plain-field"
                    min={0.2}
                    max={2}
                    step={0.1}
                    {...transitionInDurationField}
                  />
                  <span className="qf-suffix">s</span>
                </label>
              </div>
              {segment.transitionIn.type === "dip" ? (
                <Slider
                  label="Dip amount"
                  value={Math.round((segment.transitionIn.dim ?? 1) * 100)}
                  min={0}
                  max={100}
                  step={5}
                  valueDisplay="text"
                  onChange={(v: number) => onChangeTransition("in", { dim: v / 100 })}
                />
              ) : null}
            </>
          ) : null}
        </div>
        <div {...stylex.props(styles.transition)}>
          <CheckboxInput
            label="Transition out"
            value={!!segment.transitionOut}
            onChange={(enabled) => onToggleTransition("out", enabled)}
          />
          {segment.transitionOut ? (
            <>
              <div className="qf-row">
                <label className="qf-field field-medium">
                  <span>Type</span>
                  <select
                    className="plain-field"
                    value={segment.transitionOut.type}
                    onChange={(e) => onChangeTransition("out", { type: e.target.value as Transition["type"] })}
                  >
                    <option value="fade">Fade</option>
                    <option value="dip">Dip</option>
                  </select>
                </label>
                <label className="qf-field field-narrow">
                  <span>Dur.</span>
                  <input
                    type="number"
                    className="plain-field"
                    min={0.2}
                    max={2}
                    step={0.1}
                    {...transitionOutDurationField}
                  />
                  <span className="qf-suffix">s</span>
                </label>
              </div>
              {segment.transitionOut.type === "dip" ? (
                <Slider
                  label="Dip amount"
                  value={Math.round((segment.transitionOut.dim ?? 1) * 100)}
                  min={0}
                  max={100}
                  step={5}
                  valueDisplay="text"
                  onChange={(v: number) => onChangeTransition("out", { dim: v / 100 })}
                />
              ) : null}
            </>
          ) : null}
        </div>
        <p {...stylex.props(styles.noteNeutral)}>Preview approximates fades and dips (opacity ramp) - the exported video renders the real fade/dip.</p>
      </div>

      {/* G6. Narration (shown only when in use) */}
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

      {/* G7. Reframe (crop) */}
      <div className="qf-group" data-testid="cut-settings-group-reframe">
        <div className="qf-group-label">Reframe</div>
        <div className="qf-row">
          <span className="qf-readonly">{segment.crop ? "Applied" : "Not applied"}</span>
          <Button
            label={segment.crop ? "Adjust again" : "Reframe"}
            variant="secondary"
            size="sm"
            onClick={onEditCrop}
          />
          {segment.crop ? (
            <Button label="Clear" variant="ghost" size="sm" onClick={onClearCrop} />
          ) : null}
        </div>
      </div>

      {/* G8. Cut actions - Delete is not here (see the separate danger zone below, screen-spec section 4 revision). */}
      <div className="qf-group" data-testid="cut-settings-group-actions">
        <div className="qf-group-label">Cut actions</div>
        <div className="qf-row qf-actions-row">
          <Button
            label="Split"
            variant="secondary"
            size="sm"
            tooltip="Cmd/Ctrl + B"
            onClick={onSplit}
            data-testid="cut-action-split"
          />
          <Button
            label="Merge with next cut"
            variant="secondary"
            size="sm"
            isDisabled={!mergeEligibility.eligible}
            tooltip={mergeEligibility.eligible ? "Cmd/Ctrl + J" : mergeEligibility.reason}
            onClick={onMergeNext}
            data-testid="cut-action-merge"
          />
          <Button
            label="Duplicate"
            variant="secondary"
            size="sm"
            onClick={onDuplicate}
            data-testid="cut-action-duplicate"
          />
          <Button
            label="Set as intro"
            variant="ghost"
            size="sm"
            isDisabled={tooLongForIntroOutro}
            tooltip={
              introOutroDisabledTitle ??
              "Range (In/Out) is ignored - the whole clip is inserted as the intro"
            }
            onClick={onSetIntro}
            data-testid="cut-action-set-intro"
          />
          <Button
            label="Set as outro"
            variant="ghost"
            size="sm"
            isDisabled={tooLongForIntroOutro}
            tooltip={
              introOutroDisabledTitle ??
              "Range (In/Out) is ignored - the whole clip is inserted as the outro"
            }
            onClick={onSetOutro}
            data-testid="cut-action-set-outro"
          />
        </div>
      </div>

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
