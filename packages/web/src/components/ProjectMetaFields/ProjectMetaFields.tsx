import { useState } from "react";
import type { Project } from "@cuesheet/schema";
import { useNumericField } from "../../hooks/useNumericField.js";

interface Props {
  project: Project;
  onChange: (patch: Partial<Project>) => void;
}

/** Rounds to the nearest even integer (ties round up) - width/height must be even for video encoding. */
function nearestEven(n: number): number {
  const rounded = Math.round(n);
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

/** Project meta fields (name/fps/resolution) shown inside the settings dialog — values that don't change per episode. */
export function ProjectMetaFields({ project, onChange }: Props) {
  // Transient "rounded to N" notes for width/height, shown briefly after a blur/Enter commit that
  // snapped an odd value to the nearest even one (schema requires width/height to be even).
  const [widthNote, setWidthNote] = useState<string | null>(null);
  const [heightNote, setHeightNote] = useState<string | null>(null);

  const fpsField = useNumericField({
    value: project.fps,
    coerce: (n) => Math.max(1, n),
    onCommit: (next) => onChange({ fps: next }),
  });
  const widthField = useNumericField({
    value: project.width,
    coerce: (n) => nearestEven(Math.max(2, n)),
    onAdjusted: (typed, adjusted) => setWidthNote(`Rounded to ${adjusted} (must be even) - typed ${typed}`),
    onCommit: (next) => onChange({ width: next }),
  });
  const heightField = useNumericField({
    value: project.height,
    coerce: (n) => nearestEven(Math.max(2, n)),
    onAdjusted: (typed, adjusted) => setHeightNote(`Rounded to ${adjusted} (must be even) - typed ${typed}`),
    onCommit: (next) => onChange({ height: next }),
  });
  // Episode-level fade in/out at the very start/end of the export (PRD backlog #3) - omitted
  // (undefined) reads as 0 (no episode fade), matching an existing cuesheet saved before this
  // field existed.
  const fadeInField = useNumericField({
    value: project.fadeInS ?? 0,
    coerce: (n) => Math.min(3, Math.max(0, n)),
    onCommit: (next) => onChange({ fadeInS: next }),
  });
  const fadeOutField = useNumericField({
    value: project.fadeOutS ?? 0,
    coerce: (n) => Math.min(3, Math.max(0, n)),
    onCommit: (next) => onChange({ fadeOutS: next }),
  });

  return (
    <div className="settings-group">
      <label className="settings-field field-text-medium">
        <span>Name</span>
        <input
          type="text"
          className="plain-field"
          value={project.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </label>
      <label className="settings-field field-narrow">
        <span>FPS</span>
        <input type="number" className="plain-field" min={1} {...fpsField} />
      </label>
      <label className="settings-field field-narrow">
        <span>Width</span>
        <input
          type="number"
          className="plain-field"
          min={2}
          step={2}
          {...widthField}
          onFocus={() => setWidthNote(null)}
        />
      </label>
      {widthNote ? <p className="qf-note">{widthNote}</p> : null}
      <label className="settings-field field-narrow">
        <span>Height</span>
        <input
          type="number"
          className="plain-field"
          min={2}
          step={2}
          {...heightField}
          onFocus={() => setHeightNote(null)}
        />
      </label>
      {heightNote ? <p className="qf-note">{heightNote}</p> : null}
      {/* Episode fade in/out (PRD backlog #3) - a pair, so they sit side by side (screen-spec
          rule 4), matching the Width/Height row's field width above. */}
      <label className="settings-field field-narrow">
        <span>Fade in</span>
        <input type="number" className="plain-field" min={0} max={3} step={0.1} {...fadeInField} />
        <span className="qf-suffix">s</span>
      </label>
      <label className="settings-field field-narrow">
        <span>Fade out</span>
        <input type="number" className="plain-field" min={0} max={3} step={0.1} {...fadeOutField} />
        <span className="qf-suffix">s</span>
      </label>
    </div>
  );
}
