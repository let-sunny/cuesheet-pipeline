import type { NarrationConfig, SubtitleStyle } from "@cuesheet/schema";

interface Props {
  subtitleStyle: SubtitleStyle;
  narration: NarrationConfig | undefined;
  onSubtitleStyleChange: (patch: Partial<SubtitleStyle>) => void;
  onNarrationChange: (patch: Partial<NarrationConfig>) => void;
}

/** 마무리 단계(④)의 자막 스타일 + 내레이션 폼. 프로젝트 메타(이름/fps/해상도)는 헤더 설정 다이얼로그로 분리됨. */
export function FinishingSettings({
  subtitleStyle,
  narration,
  onSubtitleStyleChange,
  onNarrationChange,
}: Props) {
  return (
    <div className="settings">
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

      <div className="settings-group">
        <h3>내레이션</h3>
        <label className="settings-field">
          <span>사용</span>
          <input
            type="checkbox"
            checked={narration?.enabled ?? false}
            onChange={(e) => onNarrationChange({ enabled: e.target.checked })}
          />
        </label>
        {narration?.enabled ? (
          <>
            <label className="settings-field">
              <span>폴더</span>
              <input
                type="text"
                value={narration.dir}
                placeholder="media/narration"
                onChange={(e) => onNarrationChange({ dir: e.target.value })}
              />
            </label>
            <label className="settings-field">
              <span>볼륨 ({Math.round(narration.volume * 100)}%)</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={narration.volume}
                onChange={(e) => onNarrationChange({ volume: e.target.valueAsNumber })}
              />
            </label>
          </>
        ) : null}
      </div>
    </div>
  );
}
