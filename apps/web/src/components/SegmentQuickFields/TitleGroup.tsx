import * as stylex from "@stylexjs/stylex";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { HStack } from "@astryxdesign/core/HStack";
import { Slider } from "@astryxdesign/core/Slider";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { Title } from "@cuesheet/schema";
import type { NumericFieldBindings } from "../../hooks/useNumericField.js";
import { InlineField } from "../ui/InlineField/index.js";
import { styles } from "./TitleGroup.styles.js";

export interface TitleGroupProps {
  title: Title | null | undefined;
  onToggle: (enabled: boolean) => void;
  onChangeTitle: (patch: Partial<Title>) => void;
  titleDurationField: NumericFieldBindings;
}

/**
 * G4. Title card (PRD backlog #2, screen-spec section 4 - placed after Subtitle, before
 * Transitions). Turning it on starts with a default typing title (screen-spec's "starts from a
 * sane default" pattern) so the preview shows something immediately.
 */
export function TitleGroup({ title, onToggle, onChangeTitle, titleDurationField }: TitleGroupProps) {
  return (
    <VStack gap={1.5} xstyle={styles.groupBorder} data-testid="cut-settings-group-title">
      <Text type="label" color="secondary" weight="semibold" xstyle={styles.groupLabel}>
        Title
      </Text>
      {/* CheckboxInput (unlike Button/Tab/Slider) doesn't forward arbitrary data-* props to the
          DOM (no `...rest` spread in its implementation) - select this in tests by ARIA role +
          accessible name instead: getByRole("checkbox", { name: "Title card for this cut" }). */}
      <CheckboxInput label="Title card for this cut" value={!!title} onChange={onToggle} />
      {title ? (
        <>
          <InlineField label="Text" inputID="cut-field-title-text" width="100%">
            <input
              id="cut-field-title-text"
              type="text"
              maxLength={80}
              {...stylex.props(styles.plainField, styles.inputFull)}
              value={title.text}
              onChange={(e) => onChangeTitle({ text: e.target.value })}
              data-testid="cut-field-title-text"
            />
          </InlineField>
          <HStack gap={4} vAlign="center" wrap="wrap">
            <InlineField label="Preset" inputID="cut-field-title-preset">
              <select
                id="cut-field-title-preset"
                {...stylex.props(styles.plainField, styles.selectMedium)}
                value={title.preset}
                onChange={(e) => onChangeTitle({ preset: e.target.value as Title["preset"] })}
                data-testid="cut-field-title-preset"
              >
                <option value="typing">Typing</option>
                <option value="gooey">Gooey</option>
                <option value="melt">Melt</option>
                <option value="particle">Particle</option>
              </select>
            </InlineField>
            {/* "Dur." (not "Duration") - the row's compact width budget (screen-spec section 4's
                measured G1/G2 width tokens) was tuned for short labels like Speed/Volume;
                "Duration" overflowed it and visually collided with the input. */}
            <InlineField label="Dur." inputID="cut-field-title-duration">
              <input
                id="cut-field-title-duration"
                type="number"
                min={0.5}
                max={10}
                step={0.5}
                {...stylex.props(styles.plainField, styles.inputNarrow)}
                {...titleDurationField}
              />
            </InlineField>
            <Text type="supporting">s</Text>
          </HStack>
          <Slider
            // Value folded into the label (valueDisplay="none") rather than Astryx's own adjacent
            // text display (2026-07-09 diagnosed fix) - at the slider's max, the thumb's own width
            // overlaps the start of a same-row value label regardless of column width (the thumb
            // is wider than the gap Astryx reserves next to it), clipping e.g. "100%" to "]00%".
            // The label sits on its own row above the track, so it never touches the thumb.
            label={`Backdrop dim (${Math.round((title.backdrop?.dim ?? 0) * 100)}%)`}
            value={Math.round((title.backdrop?.dim ?? 0) * 100)}
            min={0}
            max={100}
            step={5}
            valueDisplay="none"
            onChange={(v: number) => onChangeTitle({ backdrop: v === 0 ? undefined : { dim: v / 100 } })}
          />
        </>
      ) : null}
    </VStack>
  );
}
