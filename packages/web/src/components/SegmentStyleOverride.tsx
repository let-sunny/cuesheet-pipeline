import type { Segment, SubtitleBackground, SubtitleStyle, SubtitleStyleOverride } from "@cuesheet/schema";
import { toColorInputValue } from "../subtitleOverlay.js";

const DEFAULT_OVERRIDE_BACKGROUND: SubtitleBackground = { color: "#000000", opacity: 0.75, padding: 8 };

interface Props {
  segment: Segment;
  /** 오버라이드가 생략한 필드의 실제 표시값(전역 스타일) — 편집 시작값과 슬라이더 표시에 쓴다. */
  globalStyle: SubtitleStyle;
  onToggle: (enabled: boolean) => void;
  onChangeOverride: (patch: Partial<SubtitleStyleOverride>) => void;
  onPromote: () => void;
  onClear: () => void;
}

/**
 * 편집 단계(②) 우측 필드 패널의 "이 컷만 스타일" 접이식 섹션. 켜면 segment.styleOverride가
 * (초기엔 전역 스타일을 그대로 복사한 값으로) 생겨 size/color/outlineColor/배경/margin을
 * 이 컷만 따로 편집할 수 있다. FinishingSettings의 컨트롤 패턴(슬라이더+색상 인풋 페어)을
 * 그대로 재사용한다.
 */
export function SegmentStyleOverride({
  segment,
  globalStyle,
  onToggle,
  onChangeOverride,
  onPromote,
  onClear,
}: Props) {
  const override = segment.styleOverride;

  return (
    <div className="quick-fields-style-override">
      <label className="settings-field">
        <span>이 컷만 스타일</span>
        <input type="checkbox" checked={!!override} onChange={(e) => onToggle(e.target.checked)} />
      </label>

      {override ? (
        <div className="style-override-fields">
          <label className="settings-field">
            <span>크기</span>
            <input
              type="number"
              min={1}
              value={override.size ?? globalStyle.size}
              onChange={(e) => {
                const v = e.target.valueAsNumber;
                onChangeOverride({ size: Number.isNaN(v) ? globalStyle.size : v });
              }}
            />
          </label>

          <label className="settings-field">
            <span>
              색상 <span className="swatch" style={{ background: override.color ?? globalStyle.color }} />
            </span>
            <div className="color-field-inputs">
              <input
                type="color"
                value={toColorInputValue(override.color ?? globalStyle.color)}
                onChange={(e) => onChangeOverride({ color: e.target.value })}
              />
              <input
                type="text"
                value={override.color ?? globalStyle.color}
                onChange={(e) => onChangeOverride({ color: e.target.value })}
              />
            </div>
          </label>

          <label className="settings-field">
            <span>
              외곽선 색상{" "}
              <span className="swatch" style={{ background: override.outlineColor ?? globalStyle.outlineColor }} />
            </span>
            <div className="color-field-inputs">
              <input
                type="color"
                value={toColorInputValue(override.outlineColor ?? globalStyle.outlineColor)}
                onChange={(e) => onChangeOverride({ outlineColor: e.target.value })}
              />
              <input
                type="text"
                value={override.outlineColor ?? globalStyle.outlineColor}
                onChange={(e) => onChangeOverride({ outlineColor: e.target.value })}
              />
            </div>
          </label>

          <label className="settings-field">
            <span>배경 박스</span>
            <input
              type="checkbox"
              checked={override.background != null}
              onChange={(e) =>
                onChangeOverride({
                  background: e.target.checked ? override.background ?? DEFAULT_OVERRIDE_BACKGROUND : null,
                })
              }
            />
          </label>
          {override.background ? (
            <>
              <label className="settings-field">
                <span>
                  배경 색상 <span className="swatch" style={{ background: override.background.color }} />
                </span>
                <div className="color-field-inputs">
                  <input
                    type="color"
                    value={toColorInputValue(override.background.color)}
                    onChange={(e) =>
                      onChangeOverride({ background: { ...override.background!, color: e.target.value } })
                    }
                  />
                  <input
                    type="text"
                    value={override.background.color}
                    onChange={(e) =>
                      onChangeOverride({ background: { ...override.background!, color: e.target.value } })
                    }
                  />
                </div>
              </label>
              <label className="settings-field">
                <span>배경 투명도 ({Math.round(override.background.opacity * 100)}%)</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={Math.round(override.background.opacity * 100)}
                  onChange={(e) =>
                    onChangeOverride({
                      background: { ...override.background!, opacity: Number(e.target.value) / 100 },
                    })
                  }
                />
              </label>
            </>
          ) : null}

          <label className="settings-field">
            <span>가장자리 여백 ({override.margin ?? globalStyle.margin ?? 40}px)</span>
            <input
              type="range"
              min={8}
              max={200}
              step={1}
              value={override.margin ?? globalStyle.margin ?? 40}
              onChange={(e) => onChangeOverride({ margin: Number(e.target.value) })}
            />
          </label>

          <div className="style-override-actions">
            <button type="button" onClick={onPromote}>
              전역 스타일로 승격
            </button>
            <button type="button" onClick={onClear}>
              오버라이드 해제
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
