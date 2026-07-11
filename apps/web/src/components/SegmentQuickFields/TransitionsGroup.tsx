import * as stylex from "@stylexjs/stylex";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { HStack } from "@astryxdesign/core/HStack";
import { Slider } from "@astryxdesign/core/Slider";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { Transition } from "@cuesheet/schema";
import type { NumericFieldBindings } from "../../hooks/useNumericField.js";
import { InlineField } from "../ui/InlineField/index.js";
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
    <VStack gap={1.5} xstyle={styles.groupBorder} data-testid="cut-settings-group-transitions">
      <Text type="label" color="secondary" weight="semibold" xstyle={styles.groupLabel}>
        Transitions
      </Text>
      <VStack gap={1.5} xstyle={styles.transition}>
        {/* Select by role/name in tests, not testid - see the Title toggle's comment. */}
        <CheckboxInput label="Transition in" value={!!transitionIn} onChange={(enabled) => onToggle("in", enabled)} />
        {transitionIn ? (
          <>
            <HStack gap={4} vAlign="center" wrap="wrap">
              <InlineField label="Type" inputID="cut-field-transition-in-type">
                <select
                  id="cut-field-transition-in-type"
                  {...stylex.props(styles.plainField, styles.selectMedium)}
                  value={transitionIn.type}
                  onChange={(e) => onChangeTransition("in", { type: e.target.value as Transition["type"] })}
                >
                  <option value="fade">Fade</option>
                  <option value="dip">Dip</option>
                </select>
              </InlineField>
              <InlineField label="Dur." inputID="cut-field-transition-in-duration">
                <input
                  id="cut-field-transition-in-duration"
                  type="number"
                  min={0.2}
                  max={2}
                  step={0.1}
                  {...stylex.props(styles.plainField, styles.inputNarrow)}
                  {...transitionInDurationField}
                  data-testid="cut-field-transition-in-duration"
                />
              </InlineField>
              <Text type="supporting">s</Text>
            </HStack>
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
      </VStack>
      <VStack gap={1.5} xstyle={styles.transition}>
        <CheckboxInput label="Transition out" value={!!transitionOut} onChange={(enabled) => onToggle("out", enabled)} />
        {transitionOut ? (
          <>
            <HStack gap={4} vAlign="center" wrap="wrap">
              <InlineField label="Type" inputID="cut-field-transition-out-type">
                <select
                  id="cut-field-transition-out-type"
                  {...stylex.props(styles.plainField, styles.selectMedium)}
                  value={transitionOut.type}
                  onChange={(e) => onChangeTransition("out", { type: e.target.value as Transition["type"] })}
                >
                  <option value="fade">Fade</option>
                  <option value="dip">Dip</option>
                </select>
              </InlineField>
              <InlineField label="Dur." inputID="cut-field-transition-out-duration">
                <input
                  id="cut-field-transition-out-duration"
                  type="number"
                  min={0.2}
                  max={2}
                  step={0.1}
                  {...stylex.props(styles.plainField, styles.inputNarrow)}
                  {...transitionOutDurationField}
                  data-testid="cut-field-transition-out-duration"
                />
              </InlineField>
              <Text type="supporting">s</Text>
            </HStack>
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
      </VStack>
      {crossValidationNote ? (
        <Text type="supporting" xstyle={styles.noteWarning}>
          {crossValidationNote}
        </Text>
      ) : null}
      <Text type="supporting" xstyle={styles.noteNeutral}>
        Preview approximates fades and dips (opacity ramp) - the exported video renders the real fade/dip.
      </Text>
    </VStack>
  );
}
