import { useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Field } from "@astryxdesign/core/Field";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { TextInput } from "@astryxdesign/core/TextInput";
import type { Project } from "@cuesheet/schema";
import { useNumericField } from "../../hooks/useNumericField.js";
import { styles } from "./ProjectMetaFields.styles.js";

interface Props {
  project: Project;
  clipDir: string;
  onChange: (patch: Partial<Project>) => void;
  onClipDirChange: (value: string) => void;
}

/** Rounds to the nearest even integer (ties round up) - width/height must be even for video encoding. */
function nearestEven(n: number): number {
  const rounded = Math.round(n);
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

/** Project meta fields (name/fps/resolution) shown inside the settings dialog — values that don't change per episode. */
export function ProjectMetaFields({ project, clipDir, onChange, onClipDirChange }: Props) {
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
    // horizontal-labels: labels beside inputs (FormLayout.doc.mjs's own settings-page guidance),
    // collapsing to vertical under 480px. Width/Height/Fade fields keep the native <input> bound to
    // useNumericField (transient in-progress text decoupled from the committed value - see that
    // hook's file comment) rather than swapping to NumberInput, whose value/onChange/onBlur shape
    // doesn't match the hook's DOM-binding contract - kept native, wrapped in Field for the
    // label/status/layout only.
    <FormLayout direction="horizontal-labels">
      <TextInput
        label="Source folder"
        value={clipDir}
        onChange={(value) => onClipDirChange(value)}
        description="Folder holding the raw footage. Change this to relink all cuts after moving the footage."
        data-testid="project-clip-dir"
      />
      <TextInput label="Name" value={project.name} onChange={(value) => onChange({ name: value })} />
      <Field label="FPS" inputID="project-fps">
        <input id="project-fps" type="number" min={1} {...stylex.props(styles.numberInput)} {...fpsField} />
      </Field>
      <Field
        label="Width"
        inputID="project-width"
        status={widthNote ? { type: "warning", message: widthNote } : undefined}
      >
        <input
          id="project-width"
          type="number"
          min={2}
          step={2}
          {...stylex.props(styles.numberInput)}
          {...widthField}
          onFocus={() => setWidthNote(null)}
        />
      </Field>
      <Field
        label="Height"
        inputID="project-height"
        status={heightNote ? { type: "warning", message: heightNote } : undefined}
      >
        <input
          id="project-height"
          type="number"
          min={2}
          step={2}
          {...stylex.props(styles.numberInput)}
          {...heightField}
          onFocus={() => setHeightNote(null)}
        />
      </Field>
      <Field label="Fade in" inputID="project-fade-in" description="Seconds faded in at the very start of the export.">
        <input
          id="project-fade-in"
          type="number"
          min={0}
          max={3}
          step={0.1}
          {...stylex.props(styles.numberInput)}
          {...fadeInField}
        />
      </Field>
      <Field label="Fade out" inputID="project-fade-out" description="Seconds faded out at the very end of the export.">
        <input
          id="project-fade-out"
          type="number"
          min={0}
          max={3}
          step={0.1}
          {...stylex.props(styles.numberInput)}
          {...fadeOutField}
        />
      </Field>
    </FormLayout>
  );
}
