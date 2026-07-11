import { useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@astryxdesign/core/Button";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { Field } from "@astryxdesign/core/Field";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { HStack } from "@astryxdesign/core/HStack";
import { Section } from "@astryxdesign/core/Section";
import { Slider } from "@astryxdesign/core/Slider";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import type { SubtitleStyle, SubtitleStyleOverride, SubtitleStylePresets } from "@cuesheet/schema";
import { mergeSubtitleStyle, subtitleBackgroundRgba, subtitleOutlineStyle, toCqw } from "../../lib/subtitleOverlay.js";
import { ColorField } from "../ui/ColorField/index.js";
import { styles } from "./SubtitleStylePresetsSettings.styles.js";

export interface SubtitleStylePresetsSettingsProps {
  presets: SubtitleStylePresets | undefined;
  /** Used as the base style for both "fields not yet set on this preset" and the compact preview. */
  globalStyle: SubtitleStyle;
  onCreate: (name: string) => void;
  onRename: (oldName: string, newName: string) => void;
  onDelete: (name: string) => void;
  onChangePreset: (name: string, patch: Partial<SubtitleStyleOverride>) => void;
}

/**
 * "Subtitle style presets" section's fields column (PRD backlog #1) - the Export step's
 * `FinishSettingsSection` wrapper owns the heading, this renders just the content: reusable named
 * overrides (e.g. "inner-voice"/"shout") a cut can opt into via the Cut settings SUBTITLE group's
 * preset select, without needing its own per-cut override. Editing a preset uses the same field set
 * as the per-cut override (size/color/outline/background/margin) - every field is optional here
 * too, an unset field simply falls back to the global style (same merge rule as
 * segment.styleOverride, just one merge step earlier - see ARCHITECTURE.md).
 */
export function SubtitleStylePresetsSettings({ presets, globalStyle, onCreate, onRename, onDelete, onChangePreset }: SubtitleStylePresetsSettingsProps) {
  const [newName, setNewName] = useState("");
  const names = Object.keys(presets ?? {});

  return (
    <VStack gap={3}>
      <Text type="supporting" color="secondary">
        Reusable named styles (e.g. "inner-voice", "shout") a cut can opt into from its Style preset
        select - each field left unset falls back to the global subtitle style above.
      </Text>

      {names.length === 0 ? (
        <Text type="supporting" color="secondary">
          No presets yet - create one below.
        </Text>
      ) : (
        names.map((name) => (
          <PresetRow
            key={name}
            name={name}
            override={presets?.[name] ?? {}}
            globalStyle={globalStyle}
            onRename={(next) => onRename(name, next)}
            onDelete={() => onDelete(name)}
            onChange={(patch) => onChangePreset(name, patch)}
          />
        ))
      )}

      <HStack gap={3} vAlign="end">
        <TextInput
          label="New preset name"
          value={newName}
          placeholder="e.g. inner-voice"
          onChange={(value) => setNewName(value)}
        />
        <Button
          label="Create preset"
          variant="secondary"
          size="sm"
          isDisabled={newName.trim() === "" || (presets?.[newName.trim()] != null)}
          onClick={() => {
            onCreate(newName);
            setNewName("");
          }}
        />
      </HStack>
    </VStack>
  );
}

interface PresetRowProps {
  name: string;
  override: SubtitleStyleOverride;
  globalStyle: SubtitleStyle;
  onRename: (next: string) => void;
  onDelete: () => void;
  onChange: (patch: Partial<SubtitleStyleOverride>) => void;
}

function PresetRow({ name, override, globalStyle, onRename, onDelete, onChange }: PresetRowProps) {
  const [nameDraft, setNameDraft] = useState(name);
  const effective = mergeSubtitleStyle(globalStyle, undefined, undefined, override);

  return (
    <Section variant="transparent" padding={0} paddingBlock={2} dividers={["bottom"]}>
      <HStack gap={3} wrap="wrap" vAlign="center">
        <TextInput
          label="Name"
          value={nameDraft}
          onChange={(value) => setNameDraft(value)}
          onBlur={() => {
            if (nameDraft.trim() !== "" && nameDraft.trim() !== name) {
              onRename(nameDraft.trim());
            } else {
              setNameDraft(name);
            }
          }}
        />
        {/* Compact preview - same overlay CSS/merge helper the Edit step's video and the global
            style's own preview stage use, so this can never visually drift from the real thing. */}
        <div {...stylex.props(styles.previewChip)}>
          <span
            className={`video-subtitle-overlay-text ${stylex.props(styles.previewText).className}`}
            style={{
              color: effective.color,
              fontFamily: effective.font,
              fontSize: toCqw(effective.size, 640),
              ...subtitleOutlineStyle(effective.outlineWidth, toCqw(effective.outlineWidth, 640), effective.outlineColor),
              background: effective.background
                ? subtitleBackgroundRgba(effective.background.color, effective.background.opacity)
                : undefined,
            }}
          >
            Aa 123
          </span>
        </div>
        <Button label="Delete" variant="destructive" size="sm" onClick={onDelete} />
      </HStack>

      <Collapsible trigger={`Edit "${name}"`}>
        <FormLayout direction="horizontal-labels">
          {/* Stock Astryx TextInput (2026-07-11 stock-input migration) - unlike the other Size
              fields in this file's sibling components, this one isn't bound to useNumericField (no
              transient-text/commit decoupling here, just a directly-controlled value), so it goes
              straight on TextInput rather than through the ui/NumericInput adapter. TextInput's own
              `width` prop is a no-op in horizontal-labels mode (confirmed via Field's dist source),
              so `xstyle` is what actually keeps this short numeric field from stretching to the
              fields column's full width. */}
          <TextInput
            label="Size"
            type="text"
            value={String(override.size ?? globalStyle.size)}
            onChange={(value) => onChange({ size: Number(value) })}
            xstyle={styles.sizeField}
          />

          <ColorField
            label="Color"
            inputID={`preset-${name}-color`}
            value={override.color ?? globalStyle.color}
            onChange={(value) => onChange({ color: value })}
          />

          <ColorField
            label="Outline color"
            inputID={`preset-${name}-outline-color`}
            value={override.outlineColor ?? globalStyle.outlineColor}
            onChange={(value) => onChange({ outlineColor: value })}
          />

          {/* Value folded into the label, valueDisplay="none" (2026-07-09 diagnosed fix - see
              SegmentQuickFields/TitleGroup.tsx's Backdrop dim slider for the full rationale). */}
          {/* Field-wrapped (isLabelHidden) so Slider - not FormLayoutContext-aware - still emits a
              proper 2-cell horizontal-labels grid row instead of desyncing/self-misplacing (see
              SubtitleStyleSettings.tsx's file comment for the full diagnosis). */}
          <Field label="Edge margin" inputID={`preset-${name}-margin`} isLabelHidden>
            <Slider
              label={`Edge margin (${override.margin ?? globalStyle.margin ?? 40}px)`}
              value={override.margin ?? globalStyle.margin ?? 40}
              min={8}
              max={600}
              step={1}
              valueDisplay="none"
              onChange={(v: number) => onChange({ margin: v })}
            />
          </Field>
        </FormLayout>
      </Collapsible>
    </Section>
  );
}
