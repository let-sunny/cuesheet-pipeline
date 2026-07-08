import { useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { BgmCue, Segment } from "@cuesheet/schema";

/** Minimum length (seconds) when dragging a BGM cue. */
const MIN_BGM_LEN = 0.5;
/** Minimum segment block width (px) — ensures the label is visible even for short segments. */
const MIN_BLOCK_PX = 64;

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

/** Playback length (seconds) of the segment on the output timeline. Shorter as speed increases. */
function playbackSeconds(seg: Segment): number {
  return (seg.out - seg.in) / seg.speed;
}

/** Picks a tick interval (seconds) so roughly 6-10 ticks appear across the total length. */
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
 * A timeline showing the entire cut's composition at a glance.
 * Top: segment order/length blocks (click to sync selection).
 * Bottom: BGM cues on the same time axis — drag the body to move, drag either end handle to adjust the range.
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

      <div className="segment-track-scroll">
        <div className="segment-track">
          {segments.map((seg, i) => {
            const play = playbackSeconds(seg);
            const label = seg.subtitle.trim() !== "" ? seg.subtitle.trim() : seg.clip || "(no filename)";
            // The block is narrow so the label gets clipped by CSS ellipsis; the title tooltip
            // carries the same full text shown on screen so the text needed for judgment isn't actually cut off.
            return (
              <button
                type="button"
                key={i}
                className={`timeline-block${i === selectedIndex ? " selected" : ""}`}
                style={{ flexGrow: play, flexBasis: 0, minWidth: `${MIN_BLOCK_PX}px` }}
                onClick={() => onSelectSegment(i)}
                title={`${label} · ${seg.clip || "(no filename)"} · ${seg.in.toFixed(1)}s~${seg.out.toFixed(1)}s · ${seg.speed}x speed`}
              >
                {i + 1}. {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="bgm-track" ref={trackRef}>
        <div className="bgm-track-bg" />
        {bgm.length === 0 ? <div className="bgm-track-empty">No background music</div> : null}
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
            title={`${cue.file || "(no filename)"} · ${cue.start.toFixed(1)}s~${cue.end.toFixed(1)}s`}
          >
            <div
              className="bgm-handle left"
              onPointerDown={startHandleDrag}
              onPointerMove={dragHandle(i, cue, "start")}
            />
            <span className="bgm-cue-label">{cue.file || "(no filename)"}</span>
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
