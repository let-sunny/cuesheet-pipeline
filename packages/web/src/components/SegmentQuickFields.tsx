import { Button } from "@astryxdesign/core/Button";
import type { Segment, SubtitleStyle, SubtitleStyleOverride } from "@cuesheet/schema";
import { INTRO_OUTRO_MAX_DURATION_S } from "../clipPaths.js";
import { narrationFileUrl, type NarrationFile } from "../api.js";
import type { MergeEligibility } from "../lib/segmentMerge.js";
import { SegmentStyleOverride } from "./SegmentStyleOverride.js";

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
  onToggleStyleOverride: (enabled: boolean) => void;
  onChangeStyleOverride: (patch: Partial<SubtitleStyleOverride>) => void;
  onPromoteStyleOverride: () => void;
  onClearStyleOverride: () => void;
}

/**
 * Cut settings (right-hand field panel in the touch-up step, canonical name from PRD section 4 —
 * formerly the "Inspector") - follows screen-spec section 4's G1-G6 group order as-is: Range ->
 * Playback -> Subtitle (+ per-cut subtitle style) -> Narration (shown only when in use) ->
 * Reframe -> Cut actions. The clip filename field's group membership was ambiguous - the spec
 * doesn't specify it, making it the one element in this panel that needed a judgment call, but
 * since it determines which clip the "Range" applies to, it's placed at the top of the G1
 * (Range) group.
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
  onToggleStyleOverride,
  onChangeStyleOverride,
  onPromoteStyleOverride,
  onClearStyleOverride,
}: Props) {
  if (!segment) {
    return null;
  }

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
    <div className="quick-fields">
      <h2 className="qf-panel-title">Cut settings</h2>

      {/* G1. Range */}
      <div className="qf-group">
        <div className="qf-group-label">Range</div>
        {/* The clip filename is shown as read-only text only (revised 2026-07-08) - the only
            proper way to change which source clip this cut points to is (1) picking a different
            scene from the Scenes palette or duplicating a cut, so a free-text input was a bug
            magnet: a typo could easily point at a file that doesn't exist. It still needs to be
            copyable (selectable), so it's shown as plain text (a span, not a disabled input -
            disabled inputs block selection in some browsers). */}
        <div className="qf-field field-full">
          <span>clip</span>
          <span className="qf-readonly-value" title={segment.clip}>
            {segment.clip}
          </span>
        </div>
        <div className="qf-row">
          <label className="qf-field field-narrow">
            <span>In</span>
            <input
              type="number"
              className="plain-field"
              value={segment.in}
              min={0}
              onChange={(e) => {
                const v = e.target.valueAsNumber;
                onChange({ in: Number.isNaN(v) ? 0 : v });
              }}
            />
          </label>
          <label className="qf-field field-narrow">
            <span>Out</span>
            <input
              type="number"
              className="plain-field"
              value={segment.out}
              min={0}
              onChange={(e) => {
                const v = e.target.valueAsNumber;
                onChange({ out: Number.isNaN(v) ? 0 : v });
              }}
            />
          </label>
          <span className="qf-readonly">Length {(segment.out - segment.in).toFixed(1)}s</span>
        </div>
      </div>

      {/* G2. Playback */}
      <div className="qf-group">
        <div className="qf-group-label">Playback</div>
        <div className="qf-row">
          <label className="qf-field field-narrow">
            <span>Speed</span>
            <input
              type="number"
              className="plain-field"
              value={segment.speed}
              min={0.1}
              max={16}
              step={0.1}
              title="Speed is capped at 16x - browsers can't play video faster than that"
              onChange={(e) => {
                const v = e.target.valueAsNumber;
                if (Number.isNaN(v)) {
                  onChange({ speed: 1 });
                  return;
                }
                onChange({ speed: Math.min(16, Math.max(0.1, v)) });
              }}
            />
            <span className="qf-suffix">x</span>
          </label>
          <label className="qf-field field-narrow">
            <span>Volume</span>
            <input
              type="number"
              className="plain-field"
              value={Math.round(segment.volume * 100)}
              min={0}
              max={100}
              step={1}
              onChange={(e) => {
                const v = e.target.valueAsNumber;
                if (Number.isNaN(v)) {
                  return;
                }
                onChange({ volume: Math.min(100, Math.max(0, v)) / 100 });
              }}
            />
            <span className="qf-suffix">%</span>
          </label>
        </div>
        {segment.speed >= 16 ? (
          <p className="qf-note">Speed is capped at 16x - browsers can't play video faster than that.</p>
        ) : null}
      </div>

      {/* G3. Subtitle (+ subsection: per-cut subtitle style) */}
      <div className="qf-group">
        <div className="qf-group-label">Subtitle</div>
        <label className="qf-field field-full qf-subtitle-field">
          <textarea
            className="plain-field plain-field-textarea"
            value={segment.subtitle}
            rows={2}
            placeholder="Enter subtitle"
            onChange={(e) => onChange({ subtitle: e.target.value })}
          />
        </label>

        <SegmentStyleOverride
          segment={segment}
          globalStyle={globalSubtitleStyle}
          onToggle={onToggleStyleOverride}
          onChangeOverride={onChangeStyleOverride}
          onPromote={onPromoteStyleOverride}
          onClear={onClearStyleOverride}
        />
      </div>

      {/* G4. Narration (shown only when in use) */}
      {narrationEnabled ? (
        <div className="qf-group">
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
            <div className="quick-fields-narration-preview">
              <audio controls src={narrationFileUrl(selectedNarrationFile.name, narrationDir)} />
              {narrationDurationWarning ? (
                <p className="narration-warning">{narrationDurationWarning}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* G5. Reframe (crop) */}
      <div className="qf-group">
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

      {/* G6. Cut actions - Delete is not here (see the separate danger zone below, screen-spec section 4 revision). */}
      <div className="qf-group">
        <div className="qf-group-label">Cut actions</div>
        <div className="qf-row qf-actions-row">
          <Button label="Split" variant="secondary" size="sm" tooltip="Cmd/Ctrl + B" onClick={onSplit} />
          <Button
            label="Merge with next cut"
            variant="secondary"
            size="sm"
            isDisabled={!mergeEligibility.eligible}
            tooltip={mergeEligibility.eligible ? "Cmd/Ctrl + J" : mergeEligibility.reason}
            onClick={onMergeNext}
          />
          <Button label="Duplicate" variant="secondary" size="sm" onClick={onDuplicate} />
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
          />
        </div>
      </div>

      {/* Danger zone: Delete is separated out (screen-spec section 4, revised 2026-07-08) - a
          divider + spacing clearly separates it from the cut actions group above, to prevent
          accidental deletion from being pressed alongside other buttons. */}
      <div className="qf-danger-zone">
        <Button
          label="Delete"
          variant="destructive"
          size="sm"
          isDisabled={!canDelete}
          tooltip={canDelete ? undefined : "Can't delete the last remaining cut"}
          onClick={onDelete}
        />
      </div>
    </div>
  );
}
