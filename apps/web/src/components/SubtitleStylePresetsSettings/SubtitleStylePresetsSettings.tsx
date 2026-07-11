import { useEffect, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import type { SubtitleStyle, SubtitleStyleOverride, SubtitleStylePresets } from "@cuesheet/schema";
import { mergeSubtitleStyle } from "../../lib/subtitleOverlay.js";
import { SelectField } from "../ui/SelectField/index.js";
import { SubtitleStyleSettings } from "../SubtitleStyleSettings/index.js";

export interface SubtitleStylePresetsSettingsProps {
  /** The global subtitle style - both an edit target of its own (when "Global" is selected) and
   * the fallback base every preset's unset fields resolve to. */
  subtitleStyle: SubtitleStyle;
  onSubtitleStyleChange: (patch: Partial<SubtitleStyle>) => void;
  presets: SubtitleStylePresets | undefined;
  onCreate: (name: string) => void;
  onRename: (oldName: string, newName: string) => void;
  onDelete: (name: string) => void;
  onChangePreset: (name: string, patch: Partial<SubtitleStyleOverride>) => void;
  /** Used (with projectHeight) to render the live preview stage at the true on-screen proportions. */
  projectWidth: number;
  projectHeight: number;
  /** First cut's clip/timestamp, for the preview stage's background frame - undefined if there are no cuts yet. */
  previewClip: string | undefined;
  previewClipTimeS: number;
}

/**
 * "Subtitle style" section's fields column, in full (2026-07-11 fold-in) - one editor for both the
 * global style and every named preset (e.g. "inner-voice"/"shout" a cut can opt into from its Style
 * preset select), switched by the "Editing" target select rather than stacking one full field-set
 * per preset (the old per-preset Collapsible layout got unwieldy past a couple of presets). The
 * target select's options are "Global (default)" plus one option per existing preset name; a
 * preset target additionally shows Preset name (rename-on-blur) and Delete controls above the
 * shared field set (SubtitleStyleSettings, unchanged apart from being parameterized by
 * value/onChange - see that component's file comment). Adding a preset goes through the "New
 * preset" button (prompts for a name, same collision/empty guard `createSubtitleStylePreset`
 * already applies) rather than a dedicated inline form, then switches the target to the new preset
 * so it's edited immediately.
 */
export function SubtitleStylePresetsSettings({
  subtitleStyle,
  onSubtitleStyleChange,
  presets,
  onCreate,
  onRename,
  onDelete,
  onChangePreset,
  projectWidth,
  projectHeight,
  previewClip,
  previewClipTimeS,
}: SubtitleStylePresetsSettingsProps) {
  // "" = editing the global style; anything else names the preset being edited.
  const [target, setTarget] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const names = Object.keys(presets ?? {});
  const isPreset = target !== "" && names.includes(target);

  // If the currently-edited preset stops existing (deleted, or a rename elsewhere), fall back to
  // the global target rather than pointing the select at a value with no matching option.
  useEffect(() => {
    if (target !== "" && !names.includes(target)) {
      setTarget("");
    }
  }, [target, presets]);

  useEffect(() => {
    setNameDraft(target);
  }, [target]);

  function handleNew() {
    const typed = window.prompt("New preset name");
    if (typed == null) {
      return;
    }
    const trimmed = typed.trim();
    if (!trimmed) {
      return;
    }
    if (presets?.[trimmed]) {
      window.alert(`A preset named "${trimmed}" already exists.`);
      return;
    }
    onCreate(trimmed);
    setTarget(trimmed);
  }

  function handleRenameCommit() {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === target) {
      setNameDraft(target);
      return;
    }
    if (presets?.[trimmed]) {
      window.alert(`A preset named "${trimmed}" already exists.`);
      setNameDraft(target);
      return;
    }
    onRename(target, trimmed);
    setTarget(trimmed);
  }

  function handleDelete() {
    onDelete(target);
  }

  const override = isPreset ? presets?.[target] : undefined;
  const effectiveValue = isPreset
    ? mergeSubtitleStyle(subtitleStyle, undefined, undefined, override ?? {})
    : subtitleStyle;
  const handleFieldChange = isPreset
    ? (patch: Partial<SubtitleStyle>) => onChangePreset(target, patch)
    : onSubtitleStyleChange;

  return (
    <VStack gap={3}>
      <HStack gap={3} vAlign="end">
        <SelectField
          label="Editing"
          value={target}
          onChange={setTarget}
          options={[{ value: "", label: "Global (default)" }, ...names.map((name) => ({ value: name, label: name }))]}
          width={220}
        />
        <Button label="New preset" variant="secondary" size="sm" onClick={handleNew} />
      </HStack>

      {isPreset ? (
        <HStack gap={3} vAlign="end">
          <TextInput label="Preset name" value={nameDraft} onChange={setNameDraft} onBlur={handleRenameCommit} />
          <Button label="Delete preset" variant="destructive" size="sm" onClick={handleDelete} />
        </HStack>
      ) : null}

      <SubtitleStyleSettings
        value={effectiveValue}
        onChange={handleFieldChange}
        projectWidth={projectWidth}
        projectHeight={projectHeight}
        previewClip={previewClip}
        previewClipTimeS={previewClipTimeS}
      />
    </VStack>
  );
}
