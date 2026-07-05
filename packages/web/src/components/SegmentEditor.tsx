import type { Segment } from "@cuesheet/schema";

/** 세그먼트의 타임라인상 재생 길이(초). speed가 빠를수록 짧아진다. */
function playbackSeconds(seg: Segment): number {
  return (seg.out - seg.in) / seg.speed;
}

function numberInput(
  value: number,
  onChange: (v: number) => void,
  extra?: { min?: number; max?: number; step?: number },
) {
  return (
    <input
      type="number"
      value={Number.isFinite(value) ? value : 0}
      min={extra?.min}
      max={extra?.max}
      step={extra?.step ?? "any"}
      onChange={(e) => {
        const v = e.target.valueAsNumber;
        onChange(Number.isNaN(v) ? 0 : v);
      }}
    />
  );
}

interface Props {
  segments: Segment[];
  selectedIndex: number;
  onSelect: (i: number) => void;
  onChange: (i: number, patch: Partial<Segment>) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
  onMove: (i: number, direction: -1 | 1) => void;
  narrationEnabled: boolean;
}

export function SegmentEditor({
  segments,
  selectedIndex,
  onSelect,
  onChange,
  onAdd,
  onRemove,
  onMove,
  narrationEnabled,
}: Props) {
  const maxPlayback = Math.max(...segments.map(playbackSeconds), 1);

  return (
    <div className="segment-editor">
      <div className="timeline">
        {segments.map((seg, i) => {
          const dur = seg.out - seg.in;
          const play = playbackSeconds(seg);
          const width = 120 + (play / maxPlayback) * 360;
          return (
            <button
              type="button"
              key={i}
              className={`segment${i === selectedIndex ? " selected" : ""}`}
              style={{ width: `${width}px` }}
              onClick={() => onSelect(i)}
            >
              <div className="clip" title={seg.clip}>
                {seg.clip || "(파일명 없음)"}
              </div>
              <div className="meta">
                {seg.in}s → {seg.out}s · {dur.toFixed(2)}초
              </div>
              <div className="meta">
                {seg.speed}배속 · vol {Math.round(seg.volume * 100)}%
              </div>
              {seg.subtitle ? <div className="subtitle">{seg.subtitle}</div> : null}
            </button>
          );
        })}
      </div>

      <div className="segment-rows">
        {segments.map((seg, i) => (
          <div
            className={`segment-row${i === selectedIndex ? " selected" : ""}`}
            key={i}
            onClick={() => onSelect(i)}
          >
            <div className="segment-row-index">{i + 1}</div>
            <label className="segment-field">
              <span>clip</span>
              <input
                type="text"
                value={seg.clip}
                onChange={(e) => onChange(i, { clip: e.target.value })}
              />
            </label>
            <label className="segment-field narrow">
              <span>in</span>
              {numberInput(seg.in, (v) => onChange(i, { in: v }), { min: 0 })}
            </label>
            <label className="segment-field narrow">
              <span>out</span>
              {numberInput(seg.out, (v) => onChange(i, { out: v }), { min: 0 })}
            </label>
            <label className="segment-field narrow">
              <span>speed</span>
              {numberInput(seg.speed, (v) => onChange(i, { speed: v }), {
                min: 0.1,
                step: 0.1,
              })}
            </label>
            <label className="segment-field narrow">
              <span>volume</span>
              {numberInput(seg.volume, (v) => onChange(i, { volume: v }), {
                min: 0,
                max: 1,
                step: 0.05,
              })}
            </label>
            <label className="segment-field checkbox">
              <span>무음</span>
              <input
                type="checkbox"
                checked={seg.volume === 0}
                onChange={(e) => onChange(i, { volume: e.target.checked ? 0 : 1 })}
              />
            </label>
            <label className="segment-field wide">
              <span>subtitle</span>
              <input
                type="text"
                value={seg.subtitle}
                onChange={(e) => onChange(i, { subtitle: e.target.value })}
              />
            </label>
            {narrationEnabled ? (
              <label className="segment-field wide">
                <span>narration</span>
                <input
                  type="text"
                  value={seg.narration ?? ""}
                  placeholder="파일명 (없으면 비움)"
                  onChange={(e) =>
                    onChange(i, { narration: e.target.value === "" ? null : e.target.value })
                  }
                />
              </label>
            ) : null}
            <div className="segment-row-actions">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onMove(i, -1);
                }}
                disabled={i === 0}
              >
                위로
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onMove(i, 1);
                }}
                disabled={i === segments.length - 1}
              >
                아래로
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(i);
                }}
                disabled={segments.length <= 1}
              >
                삭제
              </button>
            </div>
          </div>
        ))}
      </div>

      <button type="button" className="add-button" onClick={onAdd}>
        세그먼트 추가
      </button>
    </div>
  );
}
