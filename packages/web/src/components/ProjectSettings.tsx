import type { Project, SubtitleStyle } from "@cuesheet/schema";

interface Props {
  project: Project;
  subtitleStyle: SubtitleStyle;
  onProjectChange: (patch: Partial<Project>) => void;
  onSubtitleStyleChange: (patch: Partial<SubtitleStyle>) => void;
}

export function ProjectSettings({
  project,
  subtitleStyle,
  onProjectChange,
  onSubtitleStyleChange,
}: Props) {
  return (
    <div className="settings">
      <div className="settings-group">
        <h3>프로젝트</h3>
        <label className="settings-field">
          <span>이름</span>
          <input
            type="text"
            value={project.name}
            onChange={(e) => onProjectChange({ name: e.target.value })}
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
              onProjectChange({ fps: Number.isNaN(v) ? 0 : v });
            }}
          />
        </label>
        <label className="settings-field">
          <span>너비</span>
          <input
            type="number"
            value={project.width}
            min={1}
            step={1}
            onChange={(e) => {
              const v = e.target.valueAsNumber;
              onProjectChange({ width: Number.isNaN(v) ? 0 : v });
            }}
          />
        </label>
        <label className="settings-field">
          <span>높이</span>
          <input
            type="number"
            value={project.height}
            min={1}
            step={1}
            onChange={(e) => {
              const v = e.target.valueAsNumber;
              onProjectChange({ height: Number.isNaN(v) ? 0 : v });
            }}
          />
        </label>
      </div>

      <div className="settings-group">
        <h3>자막 스타일</h3>
        <label className="settings-field">
          <span>폰트</span>
          <input
            type="text"
            value={subtitleStyle.font}
            onChange={(e) => onSubtitleStyleChange({ font: e.target.value })}
          />
        </label>
        <label className="settings-field">
          <span>크기</span>
          <input
            type="number"
            value={subtitleStyle.size}
            min={1}
            onChange={(e) => {
              const v = e.target.valueAsNumber;
              onSubtitleStyleChange({ size: Number.isNaN(v) ? 0 : v });
            }}
          />
        </label>
        <label className="settings-field">
          <span>
            색상 <span className="swatch" style={{ background: subtitleStyle.color }} />
          </span>
          <input
            type="text"
            value={subtitleStyle.color}
            onChange={(e) => onSubtitleStyleChange({ color: e.target.value })}
          />
        </label>
        <label className="settings-field">
          <span>
            외곽선 색상{" "}
            <span className="swatch" style={{ background: subtitleStyle.outlineColor }} />
          </span>
          <input
            type="text"
            value={subtitleStyle.outlineColor}
            onChange={(e) => onSubtitleStyleChange({ outlineColor: e.target.value })}
          />
        </label>
        <label className="settings-field">
          <span>외곽선 두께</span>
          <input
            type="number"
            value={subtitleStyle.outlineWidth}
            min={0}
            onChange={(e) => {
              const v = e.target.valueAsNumber;
              onSubtitleStyleChange({ outlineWidth: Number.isNaN(v) ? 0 : v });
            }}
          />
        </label>
        <label className="settings-field">
          <span>위치</span>
          <select
            value={subtitleStyle.position}
            onChange={(e) =>
              onSubtitleStyleChange({
                position: e.target.value as SubtitleStyle["position"],
              })
            }
          >
            <option value="bottom">bottom</option>
            <option value="top">top</option>
            <option value="center">center</option>
          </select>
        </label>
      </div>
    </div>
  );
}
