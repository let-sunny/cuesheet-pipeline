import type { Segment } from "@cuesheet/schema";

/** 세그먼트의 출력 타임라인상 재생 길이(초). speed가 빠를수록 짧아진다. */
function playbackSeconds(seg: Segment): number {
  return (seg.out - seg.in) / seg.speed;
}

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.round(totalSeconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

interface Props {
  segments: Segment[];
  selectedIndex: number;
  onSelect: (i: number) => void;
  /** 블록 더블클릭 시 호출 — 다듬기 단계로 전환하고 그 컷을 선택한다. */
  onGoToTrim: (i: number) => void;
}

/**
 * 항상 표시되는 얇은 타임라인 스트립. 세그먼트 블록만(BGM 제외) 출력 길이
 * 순수 비례(폭 fit-to-width, 최소 폭 없음)로 보여주고, 클릭으로 선택,
 * 더블클릭으로 다듬기 단계 이동, 우측에 총 길이를 표시한다.
 * TimelineView(풀버전, 마무리 단계 전용)와는 별개의 얇은 전용 컴포넌트.
 */
export function MiniTimelineStrip({ segments, selectedIndex, onSelect, onGoToTrim }: Props) {
  const total = segments.reduce((sum, s) => sum + playbackSeconds(s), 0);

  return (
    <div className="mini-strip">
      <div className="mini-strip-track">
        {segments.map((seg, i) => {
          const play = playbackSeconds(seg);
          return (
            <button
              type="button"
              key={i}
              className={`mini-strip-block${i === selectedIndex ? " selected" : ""}`}
              style={{ flexGrow: play, flexBasis: 0 }}
              onClick={() => onSelect(i)}
              onDoubleClick={() => onGoToTrim(i)}
              title={`${i + 1}. ${seg.clip || "(파일명 없음)"} · ${seg.in.toFixed(1)}s~${seg.out.toFixed(1)}s (더블클릭: 다듬기로 이동)`}
            />
          );
        })}
      </div>
      <span className="mini-strip-total">{formatDuration(total)}</span>
    </div>
  );
}
