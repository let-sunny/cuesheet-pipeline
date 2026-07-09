import * as stylex from "@stylexjs/stylex";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Slider } from "@astryxdesign/core/Slider";
import type { Transition } from "@cuesheet/schema";
import type { NumericFieldBindings } from "../../hooks/useNumericField.js";
import { styles } from "./TransitionsGroup.styles.js";

export interface TransitionsGroupProps {
  transitionIn: Transition | null | undefined;
  transitionOut: Transition | null | undefined;
  onToggle: (side: "in" | "out", enabled: boolean) => void;
  onChangeTransition: (side: "in" | "out", patch: Partial<Transition>) => void;
  transitionInDurationField: NumericFieldBindings;
  transitionOutDurationField: NumericFieldBindings;
  /** Set once transitionIn+transitionOut's durations were clamped to fit the cut's own output
   * length (cross-validation) - shown as a note instead of silently truncating with no explanation. */
  crossValidationNote: string | null;
}

/**
 * G5. Transitions (fade/dip, PRD backlog #3, screen-spec section 4 - placed after Title, before
 * Narration). Two independent optional transitions (cut start/end), each toggled on with the same
 * "starts from a sane default" pattern as Title (fade, 0.5s). Dip amount only applies (and is only
 * shown) when type is Dip - Fade always fades fully to black. In+out durations are cross-validated
 * against the cut's own output length by the caller (SegmentQuickFields, where the duration fields'
 * coerce clamps live) - this component only surfaces the resulting note.
 */
export function TransitionsGroup({
  transitionIn,
  transitionOut,
  onToggle,
  onChangeTransition,
  transitionInDurationField,
  transitionOutDurationField,
  crossValidationNote,
}: TransitionsGroupProps) {
  return (
    <div className="qf-group" data-testid="cut-settings-group-transitions">
      <div className="qf-group-label">Transitions</div>
      <div {...stylex.props(styles.transition)}>
        {/* Select by role/name in tests, not testid - see the Title toggle's comment. */}
        <CheckboxInput label="Transition in" value={!!transitionIn} onChange={(enabled) => onToggle("in", enabled)} />
        {transitionIn ? (
          <>
            <div className="qf-row">
              <label className="qf-field field-medium">
                <span>Type</span>
                <select
                  className="plain-field"
                  value={transitionIn.type}
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
                  data-testid="cut-field-transition-in-duration"
                />
                <span className="qf-suffix">s</span>
              </label>
            </div>
            {transitionIn.type === "dip" ? (
              // Value folded into the label, valueDisplay="none" (2026-07-09 diagnosed fix - see
              // TitleGroup.tsx's Backdrop dim slider for the full rationale: at max value, the
              // thumb overlaps an adjacent same-row text display regardless of column width).
              <Slider
                label={`Dip amount (${Math.round((transitionIn.dim ?? 1) * 100)}%)`}
                value={Math.round((transitionIn.dim ?? 1) * 100)}
                min={0}
                max={100}
                step={5}
                valueDisplay="none"
                onChange={(v: number) => onChangeTransition("in", { dim: v / 100 })}
              />
            ) : null}
          </>
        ) : null}
      </div>
      <div {...stylex.props(styles.transition)}>
        <CheckboxInput label="Transition out" value={!!transitionOut} onChange={(enabled) => onToggle("out", enabled)} />
        {transitionOut ? (
          <>
            <div className="qf-row">
              <label className="qf-field field-medium">
                <span>Type</span>
                <select
                  className="plain-field"
                  value={transitionOut.type}
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
                  data-testid="cut-field-transition-out-duration"
                />
                <span className="qf-suffix">s</span>
              </label>
            </div>
            {transitionOut.type === "dip" ? (
              <Slider
                label={`Dip amount (${Math.round((transitionOut.dim ?? 1) * 100)}%)`}
                value={Math.round((transitionOut.dim ?? 1) * 100)}
                min={0}
                max={100}
                step={5}
                valueDisplay="none"
                onChange={(v: number) => onChangeTransition("out", { dim: v / 100 })}
              />
            ) : null}
          </>
        ) : null}
      </div>
      {crossValidationNote ? <p {...stylex.props(styles.noteWarning)}>{crossValidationNote}</p> : null}
      <p {...stylex.props(styles.noteNeutral)}>Preview approximates fades and dips (opacity ramp) - the exported video renders the real fade/dip.</p>
    </div>
  );
}
