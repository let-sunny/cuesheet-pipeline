import { Slider } from "@astryxdesign/core/Slider";
import type { Segment } from "@cuesheet/schema";
import { INTRO_OUTRO_MAX_DURATION_S } from "../clipPaths.js";

interface Props {
  segment: Segment | undefined;
  narrationEnabled: boolean;
  onChange: (patch: Partial<Segment>) => void;
  /** 이 컷 원본 클립 파일의 길이 근사치(초). 초벌 하이라이트 데이터에 없는 클립이면 undefined. */
  clipDurationS: number | undefined;
  /** 이 컷의 원본 클립 파일 전체(in/out 무시)를 인트로/아웃트로로 지정한다. */
  onSetIntro: () => void;
  onSetOutro: () => void;
}

/**
 * 편집 단계(②) 우측 인스펙터: 자막 textarea가 주고(트리밍하면서 그 컷 자막을
 * 바로 고침), 배속/볼륨 입력이 그다음, clip 파일명·내레이션·in/out 숫자 입력은
 * 보조로 축소되어 있다(핸들 드래그가 주된 트림 방법).
 */
export function SegmentQuickFields({
  segment,
  narrationEnabled,
  onChange,
  clipDurationS,
  onSetIntro,
  onSetOutro,
}: Props) {
  if (!segment) {
    return null;
  }

  const tooLongForIntroOutro =
    clipDurationS === undefined || clipDurationS > INTRO_OUTRO_MAX_DURATION_S;
  const introOutroDisabledTitle =
    clipDurationS === undefined
      ? "이 클립의 길이를 확인할 수 없어 비활성화되었습니다(초벌 하이라이트 데이터에 없는 클립)"
      : tooLongForIntroOutro
        ? `15초를 넘는 클립(추정 ${clipDurationS.toFixed(1)}s)은 인트로/아웃트로로 쓸 수 없습니다`
        : null;

  return (
    <div className="quick-fields">
      <label className="quick-fields-subtitle">
        <span>자막</span>
        <textarea
          value={segment.subtitle}
          rows={2}
          placeholder="자막을 입력하세요"
          onChange={(e) => onChange({ subtitle: e.target.value })}
        />
      </label>

      <div className="quick-fields-primary">
        <label className="settings-field">
          <span>배속</span>
          <input
            type="number"
            value={segment.speed}
            min={0.1}
            step={0.1}
            onChange={(e) => {
              const v = e.target.valueAsNumber;
              onChange({ speed: Number.isNaN(v) ? 1 : v });
            }}
          />
        </label>
        <div className="volume-field">
          <Slider
            label="볼륨"
            value={Math.round(segment.volume * 100)}
            min={0}
            max={100}
            step={5}
            valueDisplay="text"
            width={220}
            onChange={(v: number) => onChange({ volume: v / 100 })}
          />
          <input
            type="number"
            className="volume-number-input"
            value={Math.round(segment.volume * 100)}
            min={0}
            max={100}
            step={1}
            onChange={(e) => {
              const v = e.target.valueAsNumber;
              if (Number.isNaN(v)) {
                return;
              }
              onChange({ volume: Math.min(100, Math.max(0, v)) / 100 });
            }}
          />
          <span className="volume-unit">%</span>
        </div>
      </div>

      <div className="quick-fields-secondary">
        <label className="segment-field wide">
          <span>clip</span>
          <input
            type="text"
            value={segment.clip}
            onChange={(e) => onChange({ clip: e.target.value })}
          />
        </label>
        <label className="segment-field narrow">
          <span>in</span>
          <input
            type="number"
            value={segment.in}
            min={0}
            onChange={(e) => {
              const v = e.target.valueAsNumber;
              onChange({ in: Number.isNaN(v) ? 0 : v });
            }}
          />
        </label>
        <label className="segment-field narrow">
          <span>out</span>
          <input
            type="number"
            value={segment.out}
            min={0}
            onChange={(e) => {
              const v = e.target.valueAsNumber;
              onChange({ out: Number.isNaN(v) ? 0 : v });
            }}
          />
        </label>
        {narrationEnabled ? (
          <label className="segment-field wide">
            <span>narration</span>
            <input
              type="text"
              value={segment.narration ?? ""}
              placeholder="파일명 (없으면 비움)"
              onChange={(e) =>
                onChange({ narration: e.target.value === "" ? null : e.target.value })
              }
            />
          </label>
        ) : null}
      </div>

      <div className="quick-fields-io">
        <span className="quick-fields-io-label">이 컷의 원본 클립 전체를</span>
        <button
          type="button"
          className="moment-io-button"
          disabled={tooLongForIntroOutro}
          title={
            introOutroDisabledTitle ??
            "구간(in/out)은 무시되고 클립 전체가 인트로로 삽입됩니다"
          }
          onClick={onSetIntro}
        >
          인트로로 지정
        </button>
        <button
          type="button"
          className="moment-io-button"
          disabled={tooLongForIntroOutro}
          title={
            introOutroDisabledTitle ??
            "구간(in/out)은 무시되고 클립 전체가 아웃트로로 삽입됩니다"
          }
          onClick={onSetOutro}
        >
          아웃트로로 지정
        </button>
        <span className="quick-fields-io-note">
          (현재 컷의 in/out 구간은 무시되고 클립 전체가 통째로 들어갑니다)
        </span>
      </div>
    </div>
  );
}
