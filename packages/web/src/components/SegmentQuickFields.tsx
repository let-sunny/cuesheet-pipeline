import { Slider } from "@astryxdesign/core/Slider";
import type { Segment } from "@cuesheet/schema";

interface Props {
  segment: Segment | undefined;
  narrationEnabled: boolean;
  onChange: (patch: Partial<Segment>) => void;
}

/**
 * 다듬기 단계(②) 우측: 배속/볼륨 입력이 주고, clip 파일명·내레이션·in/out
 * 숫자 입력은 보조로 축소되어 있다(핸들 드래그가 주된 트림 방법).
 */
export function SegmentQuickFields({ segment, narrationEnabled, onChange }: Props) {
  if (!segment) {
    return null;
  }

  return (
    <div className="quick-fields">
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
        <Slider
          label="볼륨"
          value={Math.round(segment.volume * 100)}
          min={0}
          max={100}
          step={5}
          valueDisplay="text"
          onChange={(v: number) => onChange({ volume: v / 100 })}
        />
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
