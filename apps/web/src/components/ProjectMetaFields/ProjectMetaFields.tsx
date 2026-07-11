import { useState } from "react";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { TextInput } from "@astryxdesign/core/TextInput";
import type { Project } from "@cuesheet/schema";
import { useNumericField } from "../../hooks/useNumericField.js";
import { NumericInput } from "../ui/NumericInput/index.js";

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
    // collapsing to vertical under 480px. Width/Height/Fade fields are a stock Astryx TextInput
    // via the shared ui/NumericInput adapter, bound to useNumericField (transient in-progress text
    // decoupled from the committed value - see that hook's file comment) - not NumberInput, whose
    // value/onChange/onBlur shape doesn't match the hook's DOM-binding contract (2026-07-11 native-
    // input stock-audit).
    <FormLayout direction="horizontal-labels">
      <TextInput
        label="Source folder"
        value={clipDir}
        onChange={(value) => onClipDirChange(value)}
        description="Folder holding the raw footage. Change this to relink all cuts after moving the footage."
        data-testid="project-clip-dir"
      />
      <TextInput label="Name" value={project.name} onChange={(value) => onChange({ name: value })} />
      <NumericInput field={fpsField} label="FPS" />
      <NumericInput
        field={widthField}
        label="Width"
        status={widthNote ? { type: "warning", message: widthNote } : undefined}
        onFocus={() => setWidthNote(null)}
      />
      <NumericInput
        field={heightField}
        label="Height"
        status={heightNote ? { type: "warning", message: heightNote } : undefined}
        onFocus={() => setHeightNote(null)}
      />
      <NumericInput
        field={fadeInField}
        label="Fade in"
        description="Seconds faded in at the very start of the export."
      />
      <NumericInput
        field={fadeOutField}
        label="Fade out"
        description="Seconds faded out at the very end of the export."
      />
    </FormLayout>
  );
}
