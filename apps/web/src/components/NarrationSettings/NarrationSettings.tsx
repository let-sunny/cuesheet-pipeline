import * as stylex from "@stylexjs/stylex";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Slider } from "@astryxdesign/core/Slider";
import type { Ducking, NarrationConfig } from "@cuesheet/schema";
import { useNumericField } from "../../hooks/useNumericField.js";
import { styles } from "./NarrationSettings.styles.js";

export interface NarrationSettingsProps {
  narration: NarrationConfig | undefined;
  onNarrationChange: (patch: Partial<NarrationConfig>) => void;
}

/** "Narration" section of the Export step (③) — enable toggle, folder, overall volume, ducking, and guide text. */
export function NarrationSettings({ narration, onNarrationChange }: NarrationSettingsProps) {
  const ducking = narration?.ducking;

  function patchDucking(patch: Partial<Ducking>) {
    const base = ducking ?? DEFAULT_DUCKING;
    onNarrationChange({ ducking: { ...base, ...patch } });
  }

  function handleDuckingToggle(enabled: boolean) {
    onNarrationChange({ ducking: enabled ? (ducking ?? DEFAULT_DUCKING) : undefined });
  }

  const fadeField = useNumericField({
    value: ducking?.fadeS ?? DEFAULT_DUCKING.fadeS,
    coerce: (n) => Math.min(1, Math.max(0.1, n)),
    onCommit: (next) => patchDucking({ fadeS: next }),
  });

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
          <p {...stylex.props(styles.narrationGuide)}>
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
          {/* Value folded into the label, valueDisplay="none" (2026-07-09 diagnosed fix - see
              SegmentQuickFields/TitleGroup.tsx's Backdrop dim slider for the full rationale). */}
          <Slider
            label={`Overall volume (${Math.round(narration.volume * 100)}%)`}
            value={Math.round(narration.volume * 100)}
            min={0}
            max={100}
            step={5}
            valueDisplay="none"
            onChange={(v: number) => onNarrationChange({ volume: v / 100 })}
          />

          {/* Ducking (PRD backlog #4) - BGM automatically dips while narration plays. Presence of
              narration.ducking is the toggle itself (undefined = off), same pattern as the
              subtitle background box above. */}
          <CheckboxInput
            label="Duck background music during narration"
            value={ducking != null}
            onChange={handleDuckingToggle}
          />
          {ducking ? (
            <>
              <Slider
                label={`Duck amount (${Math.round(ducking.amount * 100)}%)`}
                value={Math.round(ducking.amount * 100)}
                min={0}
                max={100}
                step={5}
                valueDisplay="none"
                onChange={(v: number) => patchDucking({ amount: v / 100 })}
              />
              <label className="settings-field field-narrow">
                <span>Fade duration (s)</span>
                <input type="number" className="plain-field" min={0.1} max={1} step={0.1} {...fadeField} />
              </label>
              <p className="settings-note">
                Play all now plays background music/narration audio, so this dip is audible
                in-editor too - the exported render applies the same shape via ffmpeg.
              </p>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/** Matches duckingSchema's own defaults (amount 0.6, fadeS 0.3) - used when the toggle turns ducking on. */
const DEFAULT_DUCKING: Ducking = { amount: 0.6, fadeS: 0.3 };
