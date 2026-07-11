import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { FormLayoutContext } from "@astryxdesign/core/FormLayout";
import { HStack } from "@astryxdesign/core/HStack";
import { Slider } from "@astryxdesign/core/Slider";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import type { Title } from "@cuesheet/schema";
import type { NumericFieldBindings } from "../../hooks/useNumericField.js";
import { ColorField } from "../ui/ColorField/index.js";
import { NumericInput } from "../ui/NumericInput/index.js";
import { SelectField } from "../ui/SelectField/index.js";
import { styles } from "./TitleGroup.styles.js";

export interface TitleGroupProps {
  title: Title | null | undefined;
  onToggle: (enabled: boolean) => void;
  onChangeTitle: (patch: Partial<Title>) => void;
  titleDurationField: NumericFieldBindings;
  titleSizeField: NumericFieldBindings;
}

/**
 * G4. Title card (PRD backlog #2, screen-spec section 4 - placed after Subtitle, before
 * Transitions). Turning it on starts with a default typing title (screen-spec's "starts from a
 * sane default" pattern) so the preview shows something immediately.
 */
export function TitleGroup({ title, onToggle, onChangeTitle, titleDurationField, titleSizeField }: TitleGroupProps) {
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
          {/* FormLayoutContext forced to "horizontal-labels" locally (same mechanism as
              ui/NumericInput's file comment) so the Text field's label sits beside it, matching
              this group's density, without needing a FormLayout ancestor. */}
          <FormLayoutContext value={{ direction: "horizontal-labels" }}>
            <TextInput
              label="Text"
              type="text"
              xstyle={styles.inputFull}
              value={title.text}
              // 80-char cap enforced here (not a native maxLength - BaseProps omits it, along with
              // most obscure/footgun HTML attributes) since Astryx TextInput's typed props don't
              // expose it either.
              onChange={(value) => onChangeTitle({ text: value.slice(0, 80) })}
              data-testid="cut-field-title-text"
            />
          </FormLayoutContext>
          <HStack gap={4} vAlign="center" wrap="wrap">
            <SelectField
              label="Preset"
              value={title.preset}
              options={TITLE_PRESET_OPTIONS}
              onChange={(value) => onChangeTitle({ preset: value as Title["preset"] })}
              testId="cut-field-title-preset"
              width={180}
            />
            {/* "Dur." (not "Duration") - the row's compact width budget (screen-spec section 4's
                measured G1/G2 width tokens) was tuned for short labels like Speed/Volume;
                "Duration" overflowed it and visually collided with the input. */}
            <NumericInput field={titleDurationField} label="Dur." width={80} />
            <Text type="supporting">s</Text>
          </HStack>
          {/* Color/Size mirror subtitle style's own color/size fields (SegmentStyleOverride.tsx) -
              ColorField doesn't self-wrap in FormLayoutContext the way ui/NumericInput does, so
              this row provides it locally for label-beside-input density. */}
          <FormLayoutContext value={{ direction: "horizontal-labels" }}>
            <HStack gap={4} vAlign="center" wrap="wrap">
              <ColorField
                label="Color"
                inputID="cut-field-title-color"
                value={title.color}
                onChange={(value) => onChangeTitle({ color: value })}
              />
              <NumericInput field={titleSizeField} label="Size" width={80} testId="cut-field-title-size" />
            </HStack>
          </FormLayoutContext>
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

const TITLE_PRESET_OPTIONS: Array<{ value: Title["preset"]; label: string }> = [
  { value: "fade", label: "Fade" },
  { value: "wordStagger", label: "Word stagger" },
  { value: "typing", label: "Typing" },
  { value: "highlight", label: "Highlight" },
];
