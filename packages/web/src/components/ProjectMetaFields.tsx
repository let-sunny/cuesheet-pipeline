import type { Project } from "@cuesheet/schema";

interface Props {
  project: Project;
  onChange: (patch: Partial<Project>) => void;
}

/** Project meta fields (name/fps/resolution) shown inside the settings dialog — values that don't change per episode. */
export function ProjectMetaFields({ project, onChange }: Props) {
  return (
    <div className="settings-group">
      <label className="settings-field">
        <span>Name</span>
        <input
          type="text"
          value={project.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </label>
      <label className="settings-field">
        <span>FPS</span>
        <input
          type="number"
          value={project.fps}
          min={1}
          onChange={(e) => {
            const v = e.target.valueAsNumber;
            onChange({ fps: Number.isNaN(v) ? 0 : v });
          }}
        />
      </label>
      <label className="settings-field">
        <span>Width</span>
        <input
          type="number"
          value={project.width}
          min={1}
          step={1}
          onChange={(e) => {
            const v = e.target.valueAsNumber;
            onChange({ width: Number.isNaN(v) ? 0 : v });
          }}
        />
      </label>
      <label className="settings-field">
        <span>Height</span>
        <input
          type="number"
          value={project.height}
          min={1}
          step={1}
          onChange={(e) => {
            const v = e.target.valueAsNumber;
            onChange({ height: Number.isNaN(v) ? 0 : v });
          }}
        />
      </label>
    </div>
  );
}
