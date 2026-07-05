import { useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { BgmCue, Segment } from "@cuesheet/schema";

/** BGM 큐 드래그 시 최소 길이(초). */
const MIN_BGM_LEN = 0.5;
/** 세그먼트 블록 최소 폭(px) — 짧은 세그먼트도 라벨이 보이도록 보장. */
const MIN_BLOCK_PX = 64;

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

/** 세그먼트의 출력 타임라인상 재생 길이(초). speed가 빠를수록 짧아진다. */
function playbackSeconds(seg: Segment): number {
  return (seg.out - seg.in) / seg.speed;
}

/** 총 길이에 맞춰 눈금이 대략 6~10개 나오도록 간격(초)을 고른다. */
function pickTickStep(total: number): number {
  const steps = [5, 10, 15, 30, 60, 120, 300, 600];
  const target = total / 8;
  return steps.find((s) => s >= target) ?? 600;
}

interface MoveDrag {
  index: number;
  startClientX: number;
  cueStart: number;
  cueEnd: number;
}

interface Props {
  segments: Segment[];
  bgm: BgmCue[];
  selectedIndex: number;
  onSelectSegment: (i: number) => void;
  onChangeBgm: (i: number, patch: Partial<BgmCue>) => void;
}

/**
 * 본편 전체 구성을 한눈에 보는 타임라인.
 * 위: 세그먼트 순서/길이 블록(클릭 시 선택 동기화).
 * 아래: 같은 시간축 위의 BGM 큐 — 몸통 드래그로 이동, 양끝 핸들 드래그로 구간 조정.
 */
export function TimelineView({
  segments,
  bgm,
  selectedIndex,
  onSelectSegment,
  onChangeBgm,
}: Props) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const moveDrag = useRef<MoveDrag | null>(null);

  const totalDuration = Math.max(
    segments.reduce((sum, s) => sum + playbackSeconds(s), 0),
    0.001,
  );
  const tickStep = pickTickStep(totalDuration);
  const ticks: number[] = [];
  for (let t = 0; t <= totalDuration; t += tickStep) {
    ticks.push(t);
  }

  const timeAtClientX = (clientX: number): number => {
    const el = trackRef.current;
    if (!el) {
      return 0;
    }
    const rect = el.getBoundingClientRect();
    const fraction = clamp((clientX - rect.left) / rect.width, 0, 1);
    return fraction * totalDuration;
  };

  const pct = (t: number): number => clamp((t / totalDuration) * 100, 0, 100);

  const startMoveDrag =
    (i: number, cue: BgmCue) => (e: ReactPointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      moveDrag.current = {
        index: i,
        startClientX: e.clientX,
        cueStart: cue.start,
        cueEnd: cue.end,
      };
    };

  const onMovePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = moveDrag.current;
    const el = trackRef.current;
    if (!drag || !el || e.buttons === 0) {
      return;
    }
    const rect = el.getBoundingClientRect();
    const deltaTime = ((e.clientX - drag.startClientX) / rect.width) * totalDuration;
    const length = drag.cueEnd - drag.cueStart;
    const newStart = Math.max(drag.cueStart + deltaTime, 0);
    onChangeBgm(drag.index, { start: newStart, end: newStart + length });
  };

  const startHandleDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const dragHandle =
    (i: number, cue: BgmCue, which: "start" | "end") =>
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.buttons === 0) {
        return;
      }
      e.stopPropagation();
      const t = timeAtClientX(e.clientX);
      if (which === "start") {
        onChangeBgm(i, { start: clamp(t, 0, cue.end - MIN_BGM_LEN) });
      } else {
        onChangeBgm(i, { end: clamp(t, cue.start + MIN_BGM_LEN, totalDuration) });
      }
    };

  return (
    <div className="timeline-view">
      <div className="timeline-ticks">
        {ticks.map((t) => (
          <div className="timeline-tick" key={t} style={{ left: `${pct(t)}%` }}>
            <span>{t}s</span>
          </div>
        ))}
      </div>

      <div className="segment-track">
        {segments.map((seg, i) => {
          const play = playbackSeconds(seg);
          const label = seg.subtitle ? seg.subtitle.slice(0, 12) : seg.clip || "(파일명 없음)";
          return (
            <button
              type="button"
              key={i}
              className={`timeline-block${i === selectedIndex ? " selected" : ""}`}
              style={{ flexGrow: play, flexBasis: 0, minWidth: `${MIN_BLOCK_PX}px` }}
              onClick={() => onSelectSegment(i)}
              title={`${seg.clip || "(파일명 없음)"} · ${seg.in.toFixed(1)}s~${seg.out.toFixed(1)}s · ${seg.speed}배속`}
            >
              {i + 1}. {label}
            </button>
          );
        })}
      </div>

      <div className="bgm-track" ref={trackRef}>
        <div className="bgm-track-bg" />
        {bgm.length === 0 ? <div className="bgm-track-empty">BGM 없음</div> : null}
        {bgm.map((cue, i) => (
          <div
            className="bgm-cue"
            key={i}
            style={{
              left: `${pct(cue.start)}%`,
              width: `${Math.max(0, pct(cue.end) - pct(cue.start))}%`,
            }}
            onPointerDown={startMoveDrag(i, cue)}
            onPointerMove={onMovePointerMove}
            title={`${cue.file || "(파일명 없음)"} · ${cue.start.toFixed(1)}s~${cue.end.toFixed(1)}s`}
          >
            <div
              className="bgm-handle left"
              onPointerDown={startHandleDrag}
              onPointerMove={dragHandle(i, cue, "start")}
            />
            <span className="bgm-cue-label">{cue.file || "(파일명 없음)"}</span>
            <div
              className="bgm-handle right"
              onPointerDown={startHandleDrag}
              onPointerMove={dragHandle(i, cue, "end")}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
