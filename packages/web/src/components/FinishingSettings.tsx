import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { NarrationConfig, SubtitleBackground, SubtitleStyle } from "@cuesheet/schema";

interface Props {
  subtitleStyle: SubtitleStyle;
  narration: NarrationConfig | undefined;
  /** 미리보기 화면비 + 비례 스케일 계산 기준이 되는 project.width. */
  projectWidth: number;
  /** 미리보기 화면비 계산 기준이 되는 project.height. */
  projectHeight: number;
  /** 미리보기 배경으로 쓸 실제 영상 프레임(첫 세그먼트 클립/시각). 없으면 그라데이션 폴백. */
  previewClip: { clip: string; t: number } | undefined;
  onSubtitleStyleChange: (patch: Partial<SubtitleStyle>) => void;
  onNarrationChange: (patch: Partial<NarrationConfig>) => void;
}

/** 미리보기 박스의 목표 폭(px) — CSS에서 `min(이 값, 100%)`로 좁은 화면에서도 반응형 축소. */
const PREVIEW_TARGET_WIDTH_PX = 680;
/** 미리보기 배경 썸네일 요청 폭(px) — 목표 폭보다 여유 있게 커서 확대해도 선명하도록. */
const PREVIEW_THUMB_WIDTH = 960;

/**
 * project 픽셀 단위 값(폰트 크기·여백·외곽선 두께 등)을 미리보기 박스 폭 기준
 * cqw(container query width) 단위 문자열로 바꾼다. 미리보기 박스에 `container-type:
 * inline-size`가 걸려 있어 1cqw = 박스의 실제 렌더 폭의 1% — 즉 박스가 어떤 크기로
 * 렌더되든(반응형 축소 포함) "project.width 대비 몇 %인가"라는 진짜 비율이 항상
 * 그대로 유지된다. 슬라이스 확대 없이 프레임 전체 + 정확한 사이즈감을 동시에 만족.
 */
function toCqw(px: number, projectWidth: number): string {
  return `${(px / Math.max(1, projectWidth)) * 100}cqw`;
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

/** #rgb 또는 #rrggbb + 0~1 투명도 -> css rgba() 문자열. */
function hexToRgba(hex: string, opacity: number): string {
  const full = toColorInputValue(hex).slice(1);
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/** drawtext 재현이 아니라 대략적인 외곽선 미리보기용 텍스트 그림자. width는 CSS 길이 문자열(cqw 등). */
function outlineShadow(color: string, width: number, widthCss: string): string | undefined {
  if (width <= 0) {
    return undefined;
  }
  const w = widthCss;
  return [
    `-${w} -${w} 0 ${color}`,
    `${w} -${w} 0 ${color}`,
    `-${w} ${w} 0 ${color}`,
    `${w} ${w} 0 ${color}`,
  ].join(", ");
}

/** 마무리 단계(④)의 자막 스타일 + 내레이션 폼. 프로젝트 메타(이름/fps/해상도)는 헤더 설정 다이얼로그로 분리됨. */
export function FinishingSettings({
  subtitleStyle,
  narration,
  projectWidth,
  projectHeight,
  previewClip,
  onSubtitleStyleChange,
  onNarrationChange,
}: Props) {
  const background = subtitleStyle.background ?? null;
  const margin = subtitleStyle.margin ?? DEFAULT_MARGIN;
  const [thumbFailed, setThumbFailed] = useState(false);

  useEffect(() => {
    setThumbFailed(false);
  }, [previewClip?.clip, previewClip?.t]);

  // 프레임 전체를 project 화면비 그대로 보여주고, 폰트/외곽선/여백은 전부
  // cqw(미리보기 박스 실제 렌더 폭 대비 %)로 환산 — 박스 크기가 바뀌어도
  // "project.width 대비 몇 %인가"라는 진짜 비율이 항상 유지된다.
  const previewFontSize = toCqw(subtitleStyle.size, projectWidth);
  const previewOutlineWidth = toCqw(subtitleStyle.outlineWidth, projectWidth);
  const previewOutlineWidthPx = subtitleStyle.outlineWidth;
  const previewMargin = toCqw(margin, projectWidth);

  const previewTextStyle: CSSProperties =
    subtitleStyle.position === "top"
      ? { top: previewMargin, left: "50%", transform: "translateX(-50%)" }
      : subtitleStyle.position === "bottom"
        ? { bottom: previewMargin, left: "50%", transform: "translateX(-50%)" }
        : { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };

  const thumbUrl = previewClip
    ? `/api/thumb?clip=${encodeURIComponent(previewClip.clip)}&t=${previewClip.t.toFixed(1)}&w=${PREVIEW_THUMB_WIDTH}`
    : undefined;

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
            max={200}
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

        <div className="subtitle-style-preview">
          <div
            className="subtitle-style-preview-stage"
            style={{
              width: `min(${PREVIEW_TARGET_WIDTH_PX}px, 100%)`,
              aspectRatio: `${projectWidth} / ${projectHeight}`,
            }}
          >
            {thumbUrl && !thumbFailed ? (
              <img
                key={thumbUrl}
                src={thumbUrl}
                alt=""
                className="subtitle-style-preview-bg"
                onError={() => setThumbFailed(true)}
              />
            ) : null}
            <span
              className="subtitle-style-preview-text"
              style={{
                ...previewTextStyle,
                fontFamily: subtitleStyle.font,
                fontSize: previewFontSize,
                color: subtitleStyle.color,
                textShadow: outlineShadow(subtitleStyle.outlineColor, previewOutlineWidthPx, previewOutlineWidth),
                background: background ? hexToRgba(background.color, background.opacity) : undefined,
                padding: background ? toCqw(background.padding, projectWidth) : undefined,
              }}
            >
              자막 미리보기 문구는 이렇게 보여요
            </span>
          </div>
          <p className="subtitle-style-preview-note">
            실제 출력 {projectWidth}x{projectHeight} 기준 비례 표시
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
