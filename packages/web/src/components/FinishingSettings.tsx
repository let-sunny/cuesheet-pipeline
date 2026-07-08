import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Slider } from "@astryxdesign/core/Slider";
import type { NarrationConfig, SubtitleBackground, SubtitleStyle } from "@cuesheet/schema";
import { toColorInputValue } from "../lib/subtitleOverlay.js";

const DEFAULT_BACKGROUND: SubtitleBackground = { color: "#000000", opacity: 0.75, padding: 8 };

/**
 * schema의 subtitleStyle.margin 기본값(40)과 동일 — GET /api/cuesheet는 파일을
 * 검증 없이 그대로 서빙하므로, margin 필드가 없는(스키마 추가 이전) 기존 큐시트를
 * 저장 전 상태로 열었을 때도 이 값으로 안전하게 표시하기 위한 방어적 fallback.
 */
const DEFAULT_MARGIN = 40;

interface SubtitleStyleProps {
  subtitleStyle: SubtitleStyle;
  onSubtitleStyleChange: (patch: Partial<SubtitleStyle>) => void;
}

/**
 * 내보내기 단계(③) "자막 스타일(전역)" 섹션 — screen-spec 5절 순서: 크기·색·외곽선
 * 한 그룹 / 배경 박스 한 그룹(토글+색+투명도+여백) / 위치+가장자리 여백 한 행 /
 * 미리보기 안내. 컷별 개별 오버라이드(SegmentStyleOverride)와 컨트롤 패턴을 공유한다.
 */
export function SubtitleStyleSettings({ subtitleStyle, onSubtitleStyleChange }: SubtitleStyleProps) {
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
    <div className="settings-group settings-group-wide">
      <h3>자막 스타일 (전역)</h3>

      {/* 크기·색·외곽선 한 그룹 */}
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

      {/* 배경 박스 한 그룹(토글+색+투명도+여백) */}
      <CheckboxInput label="배경 박스" value={background != null} onChange={handleBackgroundToggle} />
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
          <Slider
            label="배경 투명도"
            value={Math.round(background.opacity * 100)}
            min={0}
            max={100}
            step={5}
            valueDisplay="text"
            onChange={(v: number) => patchBackground({ opacity: v / 100 })}
          />
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

      {/* 위치 + 가장자리 여백 한 행 */}
      <div className="qf-row">
        <label className="qf-field field-medium">
          <span>위치</span>
          <select
            value={subtitleStyle.position}
            onChange={(e) =>
              onSubtitleStyleChange({
                position: e.target.value as SubtitleStyle["position"],
              })
            }
          >
            <option value="bottom">아래</option>
            <option value="top">위</option>
            <option value="center">가운데</option>
          </select>
        </label>
        <Slider
          label="가장자리 여백"
          value={margin}
          min={8}
          max={600}
          step={1}
          valueDisplay="text"
          isDisabled={subtitleStyle.position === "center"}
          onChange={(v: number) => onSubtitleStyleChange({ margin: v })}
        />
      </div>

      <p className="settings-note">미리보기는 ② 다듬기의 비디오에서 실시간 확인</p>
    </div>
  );
}

interface NarrationProps {
  narration: NarrationConfig | undefined;
  onNarrationChange: (patch: Partial<NarrationConfig>) => void;
}

/** 내보내기 단계(③) "내레이션" 섹션 — 사용 토글·폴더·전체 볼륨·안내문. */
export function NarrationSettings({ narration, onNarrationChange }: NarrationProps) {
  return (
    <div className="settings-group">
      <h3>내레이션</h3>
      <CheckboxInput
        label="내레이션 사용"
        value={narration?.enabled ?? false}
        onChange={(enabled) => onNarrationChange({ enabled })}
      />
      {narration?.enabled ? (
        <>
          <p className="narration-guide">
            폴더에 음성 파일(mp3/m4a/wav)을 넣고, 각 컷에서 파일을 선택하면 그 컷 시작에
            맞춰 믹싱됩니다.
          </p>
          <label className="settings-field wide-input">
            <span>폴더</span>
            <input
              type="text"
              value={narration.dir}
              placeholder="media/narration"
              onChange={(e) => onNarrationChange({ dir: e.target.value })}
            />
          </label>
          <Slider
            label="전체 볼륨"
            value={Math.round(narration.volume * 100)}
            min={0}
            max={100}
            step={5}
            valueDisplay="text"
            onChange={(v: number) => onNarrationChange({ volume: v / 100 })}
          />
        </>
      ) : null}
    </div>
  );
}
