import type { NarrationConfig, SubtitleBackground, SubtitleStyle } from "@cuesheet/schema";

interface Props {
  subtitleStyle: SubtitleStyle;
  narration: NarrationConfig | undefined;
  /** 미리보기 크기를 실제 렌더 해상도 대비 비율로 근사하기 위한 project.height. */
  projectHeight: number;
  onSubtitleStyleChange: (patch: Partial<SubtitleStyle>) => void;
  onNarrationChange: (patch: Partial<NarrationConfig>) => void;
}

/** 미리보기 무대의 고정 표시 높이(px). project.height 대비 스케일 비율 계산에 쓰인다. */
const PREVIEW_STAGE_HEIGHT_PX = 220;

const DEFAULT_BACKGROUND: SubtitleBackground = { color: "#000000", opacity: 0.75, padding: 8 };

/** input[type=color]는 #rrggbb만 받는다 — #rgb 축약형을 늘려서 넘긴다. */
function toColorInputValue(hex: string): string {
  const m = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/.exec(hex);
  if (m) {
    const [, r, g, b] = m;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#000000";
}

/** #rgb 또는 #rrggbb + 0~1 투명도 -> css rgba() 문자열. */
function hexToRgba(hex: string, opacity: number): string {
  const full = toColorInputValue(hex).slice(1);
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/** drawtext 재현이 아니라 대략적인 외곽선 미리보기용 텍스트 그림자. */
function outlineShadow(color: string, width: number): string | undefined {
  if (width <= 0) {
    return undefined;
  }
  const w = width;
  return [
    `-${w}px -${w}px 0 ${color}`,
    `${w}px -${w}px 0 ${color}`,
    `-${w}px ${w}px 0 ${color}`,
    `${w}px ${w}px 0 ${color}`,
  ].join(", ");
}

/** 마무리 단계(④)의 자막 스타일 + 내레이션 폼. 프로젝트 메타(이름/fps/해상도)는 헤더 설정 다이얼로그로 분리됨. */
export function FinishingSettings({
  subtitleStyle,
  narration,
  projectHeight,
  onSubtitleStyleChange,
  onNarrationChange,
}: Props) {
  const background = subtitleStyle.background ?? null;

  const scale = PREVIEW_STAGE_HEIGHT_PX / Math.max(1, projectHeight);
  const previewFontSize = Math.max(8, subtitleStyle.size * scale);
  const previewOutlineWidth = subtitleStyle.outlineWidth * scale;
  const previewJustify =
    subtitleStyle.position === "top"
      ? "flex-start"
      : subtitleStyle.position === "center"
        ? "center"
        : "flex-end";

  function handleBackgroundToggle(enabled: boolean) {
    onSubtitleStyleChange({ background: enabled ? background ?? DEFAULT_BACKGROUND : null });
  }

  function patchBackground(patch: Partial<SubtitleBackground>) {
    const base = background ?? DEFAULT_BACKGROUND;
    onSubtitleStyleChange({ background: { ...base, ...patch } });
  }

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
                max={40}
                value={background.padding}
                onChange={(e) => {
                  const v = e.target.valueAsNumber;
                  patchBackground({ padding: Number.isNaN(v) ? 0 : v });
                }}
              />
            </label>
          </>
        ) : null}

        <div className="subtitle-style-preview" style={{ height: PREVIEW_STAGE_HEIGHT_PX }}>
          <div className="subtitle-style-preview-stage" style={{ justifyContent: previewJustify }}>
            <span
              className="subtitle-style-preview-text"
              style={{
                fontFamily: subtitleStyle.font,
                fontSize: `${previewFontSize}px`,
                color: subtitleStyle.color,
                textShadow: outlineShadow(subtitleStyle.outlineColor, previewOutlineWidth),
                background: background ? hexToRgba(background.color, background.opacity) : undefined,
                padding: background ? `${background.padding * scale}px` : undefined,
              }}
            >
              자막 미리보기 문구는 이렇게 보여요
            </span>
          </div>
          <p className="subtitle-style-preview-note">
            미리보기는 실제 렌더 화면비를 근사한 것으로, 픽셀 단위까지 정확하지는 않습니다.
          </p>
        </div>
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
