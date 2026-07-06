import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { NarrationConfig, SubtitleBackground, SubtitleStyle } from "@cuesheet/schema";

interface Props {
  subtitleStyle: SubtitleStyle;
  narration: NarrationConfig | undefined;
  /** 미리보기 크기를 실제 렌더 해상도 대비 비율로 근사하기 위한 project.height. */
  projectHeight: number;
  /** 미리보기 배경으로 쓸 실제 영상 프레임(첫 세그먼트 클립/시각). 없으면 그라데이션 폴백. */
  previewClip: { clip: string; t: number } | undefined;
  onSubtitleStyleChange: (patch: Partial<SubtitleStyle>) => void;
  onNarrationChange: (patch: Partial<NarrationConfig>) => void;
}

/**
 * "project.height가 이 px로 렌더된다"고 가정했을 때의 가상 전체 프레임 높이.
 * 실제 프레임 전체를 보여주는 대신 이 스케일로 계산한 자막 영역만 잘라 보여줘서
 * (PREVIEW_SLICE_RATIO) 자막 텍스트가 에디터에서 실제 읽히는 크기로 보이게 한다.
 */
const FULL_FRAME_HEIGHT_PX = 640;
/** 잘라 보여줄 세로 슬라이스 비율(자막이 놓이는 상/중/하 영역). */
const PREVIEW_SLICE_RATIO = 0.35;
/** 미리보기 배경 썸네일 요청 폭(px) — 기본 160px 세그먼트 썸네일보다 훨씬 크게. */
const PREVIEW_THUMB_WIDTH = 640;

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

  // FULL_FRAME_HEIGHT_PX을 "전체 프레임이 이 높이로 보인다"고 가정한 스케일 —
  // 기존(220px 전체 프레임 축소판)보다 훨씬 크게 잡아, 잘라낸 자막 영역 안에서
  // 텍스트가 실제로 읽히는 크기가 되게 한다.
  const scale = FULL_FRAME_HEIGHT_PX / Math.max(1, projectHeight);
  const previewBoxHeightPx = Math.round(FULL_FRAME_HEIGHT_PX * PREVIEW_SLICE_RATIO);
  const previewFontSize = Math.max(8, subtitleStyle.size * scale);
  const previewOutlineWidth = subtitleStyle.outlineWidth * scale;
  const previewMargin = margin * scale;

  // 배경 이미지(프록시 시크 추출 프레임)는 전체 프레임 폭 기준으로 요청하고,
  // object-position으로 top/center/bottom 슬라이스만 드러낸다 — 이미지 자체는
  // 원본 화면비를 유지하므로 폭만 맞추면(100% width, height auto) 세로 크롭이 된다.
  const previewBgStyle: CSSProperties =
    subtitleStyle.position === "top"
      ? { top: 0 }
      : subtitleStyle.position === "bottom"
        ? { bottom: 0 }
        : { top: "50%", transform: "translateY(-50%)" };

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
          <div className="subtitle-style-preview-stage" style={{ height: previewBoxHeightPx }}>
            {thumbUrl && !thumbFailed ? (
              <img
                key={thumbUrl}
                src={thumbUrl}
                alt=""
                className="subtitle-style-preview-bg"
                style={previewBgStyle}
                onError={() => setThumbFailed(true)}
              />
            ) : null}
            <div className="subtitle-style-preview-dim" />
            <span
              className="subtitle-style-preview-text"
              style={{
                ...previewTextStyle,
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
            자막이 놓이는 영역만 확대해 보여줍니다 — 픽셀 단위까지 정확하지는 않습니다.
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
