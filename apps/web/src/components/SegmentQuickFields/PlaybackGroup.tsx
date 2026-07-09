import type { NumericFieldBindings } from "../../hooks/useNumericField.js";

export interface PlaybackGroupProps {
  speedField: NumericFieldBindings;
  volumeField: NumericFieldBindings;
  /** Whether the cut's current speed is at the 16x cap (shows the browser-limit note). */
  speedAtCap: boolean;
}

/**
 * G2. Playback - Speed/Volume, paired on one row (screen-spec section 4). Speed is capped at 16x
 * (input min/max/step baked in here, matching the schema's own cap) - browsers throw a
 * NotSupportedError setting playbackRate above that, which would otherwise crash the preview.
 */
export function PlaybackGroup({ speedField, volumeField, speedAtCap }: PlaybackGroupProps) {
  return (
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
      {speedAtCap ? (
        <p className="qf-note">Speed is capped at 16x - browsers can't play video faster than that.</p>
      ) : null}
    </div>
  );
}
