import { Slider } from "@astryxdesign/core/Slider";
import type { Segment } from "@cuesheet/schema";

interface Props {
  segment: Segment | undefined;
  narrationEnabled: boolean;
  onChange: (patch: Partial<Segment>) => void;
}

/**
 * 편집 단계(②) 우측 인스펙터: 자막 textarea가 주고(트리밍하면서 그 컷 자막을
 * 바로 고침), 배속/볼륨 입력이 그다음, clip 파일명·내레이션·in/out 숫자 입력은
 * 보조로 축소되어 있다(핸들 드래그가 주된 트림 방법).
 */
export function SegmentQuickFields({ segment, narrationEnabled, onChange }: Props) {
  if (!segment) {
    return null;
  }

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
    </div>
  );
}
