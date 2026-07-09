import { useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { Slider } from "@astryxdesign/core/Slider";
import type { SubtitleStyle, SubtitleStyleOverride, SubtitleStylePresets } from "@cuesheet/schema";
import { mergeSubtitleStyle, subtitleBackgroundRgba, subtitleOutlineStyle, toCqw, toColorInputValue } from "../../lib/subtitleOverlay.js";
import { Swatch } from "../Swatch/index.js";

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
 * "Subtitle style presets" section of the Export step (PRD backlog #1) - reusable named overrides
 * (e.g. "inner-voice"/"shout") a cut can opt into via the Cut settings SUBTITLE group's preset
 * select, without needing its own per-cut override. Editing a preset uses the same field set as
 * the per-cut override (size/color/outline/background/margin) - every field is optional here too,
 * an unset field simply falls back to the global style (same merge rule as segment.styleOverride,
 * just one merge step earlier - see ARCHITECTURE.md).
 */
export function SubtitleStylePresetsSettings({ presets, globalStyle, onCreate, onRename, onDelete, onChangePreset }: SubtitleStylePresetsSettingsProps) {
  const [newName, setNewName] = useState("");
  const names = Object.keys(presets ?? {});

  return (
    <div className="settings-group settings-group-wide">
      <h3>Subtitle style presets</h3>
      <p className="settings-note">
        Reusable named styles (e.g. "inner-voice", "shout") a cut can opt into from its Style preset
        select - each field left unset falls back to the global subtitle style above.
      </p>

      {names.length === 0 ? (
        <p className="settings-note">No presets yet - create one below.</p>
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

      {/* Export-step tokens (settings-field's 120px label column), not Cut settings' qf-field
          (40px, only meant for short labels like In/Out/Speed) - "New preset name" was clipping
          in the 40px column before this fix (2026-07-09 diagnosed fix). */}
      <div className="settings-create-row">
        <label className="settings-field field-text-medium">
          <span>New preset name</span>
          <input
            type="text"
            className="plain-field"
            value={newName}
            placeholder="e.g. inner-voice"
            onChange={(e) => setNewName(e.target.value)}
          />
        </label>
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
      </div>
    </div>
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
    <div className="preset-row">
      <div className="preset-row-header">
        <label className="settings-field field-text-medium">
          <span>Name</span>
          <input
            type="text"
            className="plain-field"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={() => {
              if (nameDraft.trim() !== "" && nameDraft.trim() !== name) {
                onRename(nameDraft.trim());
              } else {
                setNameDraft(name);
              }
            }}
          />
        </label>
        {/* Compact preview - same overlay CSS/merge helper the Edit step's video and the global
            style's own preview stage use, so this can never visually drift from the real thing. */}
        <div className="preset-preview-chip">
          <span
            className="video-subtitle-overlay-text preset-preview-text"
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
      </div>

      <Collapsible trigger={`Edit "${name}"`}>
        <div className="style-override-fields">
          <label className="settings-field field-narrow">
            <span>Size</span>
            <input
              type="number"
              className="plain-field"
              min={1}
              value={override.size ?? globalStyle.size}
              onChange={(e) => onChange({ size: Number(e.target.value) })}
            />
          </label>

          <label className="settings-field">
            <span>
              Color <Swatch color={override.color ?? globalStyle.color} />
            </span>
            <div className="color-field-inputs">
              <input
                type="color"
                value={toColorInputValue(override.color ?? globalStyle.color)}
                onChange={(e) => onChange({ color: e.target.value })}
              />
              <input
                type="text"
                className="plain-field"
                value={override.color ?? globalStyle.color}
                onChange={(e) => onChange({ color: e.target.value })}
              />
            </div>
          </label>

          <label className="settings-field">
            <span>
              Outline color{" "}
              <Swatch color={override.outlineColor ?? globalStyle.outlineColor} />
            </span>
            <div className="color-field-inputs">
              <input
                type="color"
                value={toColorInputValue(override.outlineColor ?? globalStyle.outlineColor)}
                onChange={(e) => onChange({ outlineColor: e.target.value })}
              />
              <input
                type="text"
                className="plain-field"
                value={override.outlineColor ?? globalStyle.outlineColor}
                onChange={(e) => onChange({ outlineColor: e.target.value })}
              />
            </div>
          </label>

          <Slider
            label="Edge margin"
            value={override.margin ?? globalStyle.margin ?? 40}
            min={8}
            max={600}
            step={1}
            valueDisplay="text"
            onChange={(v: number) => onChange({ margin: v })}
          />
        </div>
      </Collapsible>
    </div>
  );
}
