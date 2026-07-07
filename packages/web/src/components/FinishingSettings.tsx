import type { NarrationConfig, SubtitleBackground, SubtitleStyle } from "@cuesheet/schema";

interface Props {
  subtitleStyle: SubtitleStyle;
  narration: NarrationConfig | undefined;
  onSubtitleStyleChange: (patch: Partial<SubtitleStyle>) => void;
  onNarrationChange: (patch: Partial<NarrationConfig>) => void;
}

const DEFAULT_BACKGROUND: SubtitleBackground = { color: "#000000", opacity: 0.75, padding: 8 };

/**
 * schema의 subtitleStyle.margin 기본값(40)과 동일 — GET /api/cuesheet는 파일을
 * 검증 없이 그대로 서빙하므로, margin 필드가 없는(스키마 추가 이전) 기존 큐시트를
 * 저장 전 상태로 열었을 때도 이 값으로 안전하게 표시하기 위한 방어적 fallback.
 */
const DEFAULT_MARGIN = 40;

/** input[type=color]는 #rrggbb만 받는다 — #rgb 축약형을 늘려서 넘긴다. */
function toColorInputValue(hex: string): string {
  const m = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/.exec(hex);
  if (m) {
    const [, r, g, b] = m;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#000000";
}

/** 마무리 단계(④)의 자막 스타일 + 내레이션 폼. 프로젝트 메타(이름/fps/해상도)는 헤더 설정 다이얼로그로 분리됨. */
export function FinishingSettings({
  subtitleStyle,
  narration,
  onSubtitleStyleChange,
  onNarrationChange,
}: Props) {
  const background = subtitleStyle.background ?? null;
  const margin = subtitleStyle.margin ?? DEFAULT_MARGIN;

  function handleBackgroundToggle(enabled: boolean) {
    onSubtitleStyleChange({ background: enabled ? background ?? DEFAULT_BACKGROUND : null });
  }

  function patchBackground(patch: Partial<SubtitleBackground>) {
    const base = background ?? DEFAULT_BACKGROUND;
    onSubtitleStyleChange({ background: { ...base, ...patch } });
  }

  return (
    <div className="settings">
      <div className="settings-group settings-group-wide">
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
          <div className="color-field-inputs">
            <input
              type="color"
              value={toColorInputValue(subtitleStyle.color)}
              onChange={(e) => onSubtitleStyleChange({ color: e.target.value })}
            />
            <input
              type="text"
              value={subtitleStyle.color}
              onChange={(e) => onSubtitleStyleChange({ color: e.target.value })}
            />
          </div>
        </label>
        <label className="settings-field">
          <span>
            외곽선 색상{" "}
            <span className="swatch" style={{ background: subtitleStyle.outlineColor }} />
          </span>
          <div className="color-field-inputs">
            <input
              type="color"
              value={toColorInputValue(subtitleStyle.outlineColor)}
              onChange={(e) => onSubtitleStyleChange({ outlineColor: e.target.value })}
            />
            <input
              type="text"
              value={subtitleStyle.outlineColor}
              onChange={(e) => onSubtitleStyleChange({ outlineColor: e.target.value })}
            />
          </div>
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
        <label className="settings-field">
          <span>가장자리 여백 ({margin}px)</span>
          <input
            type="range"
            min={8}
            max={600}
            step={1}
            value={margin}
            disabled={subtitleStyle.position === "center"}
            onChange={(e) => onSubtitleStyleChange({ margin: Number(e.target.value) })}
          />
        </label>

        <label className="settings-field">
          <span>배경 박스</span>
          <input
            type="checkbox"
            checked={background != null}
            onChange={(e) => handleBackgroundToggle(e.target.checked)}
          />
        </label>
        {background ? (
          <>
            <label className="settings-field">
              <span>
                배경 색상 <span className="swatch" style={{ background: background.color }} />
              </span>
              <div className="color-field-inputs">
                <input
                  type="color"
                  value={toColorInputValue(background.color)}
                  onChange={(e) => patchBackground({ color: e.target.value })}
                />
                <input
                  type="text"
                  value={background.color}
                  onChange={(e) => patchBackground({ color: e.target.value })}
                />
              </div>
            </label>
            <label className="settings-field">
              <span>배경 투명도 ({Math.round(background.opacity * 100)}%)</span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={Math.round(background.opacity * 100)}
                onChange={(e) => patchBackground({ opacity: Number(e.target.value) / 100 })}
              />
            </label>
            <label className="settings-field">
              <span>배경 여백(px)</span>
              <input
                type="number"
                min={0}
                max={120}
                value={background.padding}
                onChange={(e) => {
                  const v = e.target.valueAsNumber;
                  patchBackground({ padding: Number.isNaN(v) ? 0 : v });
                }}
              />
            </label>
          </>
        ) : null}

        <p className="settings-note">미리보기는 ② 편집의 비디오에서 실시간 확인</p>
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
            <p className="narration-guide">
              폴더에 음성 파일(mp3/m4a/wav)을 넣고, 각 컷에서 파일을 선택하면 그 컷 시작에
              맞춰 믹싱됩니다.
            </p>
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
