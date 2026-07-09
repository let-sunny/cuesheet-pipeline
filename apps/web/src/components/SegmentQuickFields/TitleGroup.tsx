import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Slider } from "@astryxdesign/core/Slider";
import type { Title } from "@cuesheet/schema";
import type { NumericFieldBindings } from "../../hooks/useNumericField.js";

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
    <div className="qf-group" data-testid="cut-settings-group-title">
      <div className="qf-group-label">Title</div>
      {/* CheckboxInput (unlike Button/Tab/Slider) doesn't forward arbitrary data-* props to the
          DOM (no `...rest` spread in its implementation) - select this in tests by ARIA role +
          accessible name instead: getByRole("checkbox", { name: "Title card for this cut" }). */}
      <CheckboxInput label="Title card for this cut" value={!!title} onChange={onToggle} />
      {title ? (
        <>
          <label className="qf-field field-full">
            <span>Text</span>
            <input
              type="text"
              className="plain-field"
              maxLength={80}
              value={title.text}
              onChange={(e) => onChangeTitle({ text: e.target.value })}
              data-testid="cut-field-title-text"
            />
          </label>
          <div className="qf-row">
            <label className="qf-field field-medium">
              <span>Preset</span>
              <select
                className="plain-field"
                value={title.preset}
                onChange={(e) => onChangeTitle({ preset: e.target.value as Title["preset"] })}
                data-testid="cut-field-title-preset"
              >
                <option value="typing">Typing</option>
                <option value="gooey">Gooey</option>
                <option value="melt">Melt</option>
                <option value="particle">Particle</option>
              </select>
            </label>
            <label className="qf-field field-narrow">
              {/* "Dur." (not "Duration") - the row's fixed 40px label column (screen-spec section 4's
                  measured G1/G2 width tokens, reused here) was tuned for short labels like
                  Speed/Volume; "Duration" overflowed it and visually collided with the input. */}
              <span>Dur.</span>
              <input type="number" className="plain-field" min={0.5} max={10} step={0.5} {...titleDurationField} />
              <span className="qf-suffix">s</span>
            </label>
          </div>
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
    </div>
  );
}
