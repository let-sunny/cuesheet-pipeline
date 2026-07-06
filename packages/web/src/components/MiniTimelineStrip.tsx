import { useEffect, useRef, useState } from "react";
import type { Segment } from "@cuesheet/schema";
import { SegmentThumb } from "./SegmentThumb.js";

/** 이 폭(px) 미만인 블록은 썸네일을 넣지 않고 색만 유지한다(너무 좁아 알아볼 수 없음). */
const MIN_THUMB_BLOCK_PX = 24;

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
  /** 블록 더블클릭 시 호출 — 편집 단계로 전환하고 그 컷을 선택한다. */
  onGoToEdit: (i: number) => void;
}

/**
 * 항상 표시되는 얇은 타임라인 스트립. 세그먼트 블록만(BGM 제외) 출력 길이
 * 순수 비례(폭 fit-to-width, 최소 폭 없음)로 보여주고, 클릭으로 선택,
 * 더블클릭으로 편집 단계 이동, 우측에 총 길이를 표시한다.
 * TimelineView(풀버전, 마무리 단계 전용)와는 별개의 얇은 전용 컴포넌트.
 */
export function MiniTimelineStrip({ segments, selectedIndex, onSelect, onGoToEdit }: Props) {
  const total = segments.reduce((sum, s) => sum + playbackSeconds(s), 0);

  const trackRef = useRef<HTMLDivElement | null>(null);
  const [trackWidth, setTrackWidth] = useState(0);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setTrackWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="mini-strip">
      <div className="mini-strip-track" ref={trackRef}>
        {segments.map((seg, i) => {
          const play = playbackSeconds(seg);
          // 블록이 텍스트를 담기엔 너무 좁아 라벨을 렌더하지 않으므로, 판단에 필요한
          // 내용(자막 전문 포함)은 title 툴팁으로 전달한다.
          const label = seg.subtitle.trim() !== "" ? seg.subtitle.trim() : seg.clip || "(파일명 없음)";
          // flexGrow 비례 기준 이 블록의 대략적인 렌더 폭(px). gap은 무시한 근사치 —
          // 썸네일을 넣을지 말지 정하는 임계값 판정용이라 정밀할 필요는 없다.
          const blockWidthPx = total > 0 ? (play / total) * trackWidth : 0;
          return (
            <button
              type="button"
              key={i}
              className={`mini-strip-block${i === selectedIndex ? " selected" : ""}`}
              style={{ flexGrow: play, flexBasis: 0 }}
              onClick={() => onSelect(i)}
              onDoubleClick={() => onGoToEdit(i)}
              title={`${i + 1}. ${label} · ${seg.in.toFixed(1)}s~${seg.out.toFixed(1)}s (더블클릭: 편집으로 이동)`}
            >
              {blockWidthPx >= MIN_THUMB_BLOCK_PX ? (
                <SegmentThumb clip={seg.clip} t={seg.in + 0.3} className="mini-strip-thumb" />
              ) : null}
            </button>
          );
        })}
      </div>
      <span className="mini-strip-total">{formatDuration(total)}</span>
    </div>
  );
}
