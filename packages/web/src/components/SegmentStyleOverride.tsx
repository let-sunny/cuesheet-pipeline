import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { Slider } from "@astryxdesign/core/Slider";
import { Button } from "@astryxdesign/core/Button";
import type { Segment, SubtitleBackground, SubtitleStyle, SubtitleStyleOverride } from "@cuesheet/schema";
import { toColorInputValue } from "../lib/subtitleOverlay.js";

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
 * 자막(G3) 그룹 하위의 "이 컷만 자막 스타일" - 켜면 segment.styleOverride가(초기엔
 * 전역 스타일을 그대로 복사한 값으로) 생겨 size/color/outlineColor/배경/margin을 이
 * 컷만 따로 편집할 수 있다. 켜고 끄는 토글(데이터 변경)과 세부 필드를 접고 펼치는
 * 디스클로저(순수 UI)를 분리했다 - Astryx Collapsible의 트리거는 통째로 버튼이라
 * 그 안에 체크박스를 중첩하면(무효한 HTML 중첩 + 클릭 버블링 충돌) 펼치기만 해도
 * 오버라이드가 켜지는 사고가 날 수 있어서다. 좌측 세로선(.qf-style-override)으로
 * "자막 소속"임을 표시한다 - 독립 섹션처럼 보이지 않게 하는 것이 이 컴포넌트의
 * 핵심 존재 이유(screen-spec 4절 "현행 문제의 핵심 교정").
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
    <div className="qf-style-override">
      <div className="qf-style-override-toggle">
        <CheckboxInput label="Subtitle style for this cut" value={!!override} onChange={onToggle} />
      </div>

      {override ? (
        <Collapsible trigger="Style details" defaultIsOpen>
          <div className="style-override-fields">
            <label className="settings-field">
              <span>Size</span>
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
                Color <span className="swatch" style={{ background: override.color ?? globalStyle.color }} />
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
                Outline color{" "}
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

            <CheckboxInput
              label="Background box"
              value={override.background != null}
              onChange={(checked) =>
                onChangeOverride({
                  background: checked ? override.background ?? DEFAULT_OVERRIDE_BACKGROUND : null,
                })
              }
            />
            {override.background ? (
              <>
                <label className="settings-field">
                  <span>
                    Background color <span className="swatch" style={{ background: override.background.color }} />
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
                <Slider
                  label="Background opacity"
                  value={Math.round(override.background.opacity * 100)}
                  min={0}
                  max={100}
                  step={5}
                  valueDisplay="text"
                  onChange={(v: number) =>
                    onChangeOverride({ background: { ...override.background!, opacity: v / 100 } })
                  }
                />
              </>
            ) : null}

            <Slider
              label="Edge margin"
              value={override.margin ?? globalStyle.margin ?? 40}
              min={8}
              max={600}
              step={1}
              valueDisplay="text"
              onChange={(v: number) => onChangeOverride({ margin: v })}
            />

            <div className="style-override-actions">
              <Button label="Apply to all cuts" variant="secondary" size="sm" onClick={onPromote} />
              <Button label="Remove override" variant="ghost" size="sm" onClick={onClear} />
            </div>
          </div>
        </Collapsible>
      ) : null}
    </div>
  );
}
