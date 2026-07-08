import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { Segment } from "@cuesheet/schema";
import { SegmentThumb } from "./SegmentThumb.js";

/** 이 폭(px) 미만인 블록은 썸네일을 넣지 않고 색만 유지한다(너무 좁아 알아볼 수 없음). */
const MIN_THUMB_BLOCK_PX = 24;

/** 줌 배율 하한/상한. 1 = 전체 보기(폭에 맞춤). */
const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
/** 휠(Ctrl/Cmd+휠) 한 스텝당 배율 변화량. */
const WHEEL_ZOOM_FACTOR = 1.2;
/** +/- 버튼 한 번 클릭당 배율 변화량. */
const BUTTON_ZOOM_FACTOR = 1.5;

function clampZoom(z: number): number {
  return Math.min(Math.max(z, MIN_ZOOM), MAX_ZOOM);
}

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
 * 항상 표시되는 얇은 타임라인 스트립. 세그먼트 블록만(BGM 제외) 출력 길이 순수
 * 비례로 보여주고, 클릭으로 선택, 더블클릭으로 편집 단계 이동, 우측에 총 길이를
 * 표시한다. Ctrl/Cmd+휠 또는 +/- 버튼으로 확대(가로 스크롤)할 수 있고, 확대 시
 * 블록 폭이 24px 이상이면 썸네일이 다시 보인다. Shift+Z 또는 블록이 아닌 배경
 * 더블클릭으로 전체 보기(줌 1배)로 복귀한다.
 * TimelineView(풀버전, 마무리 단계 전용)와는 별개의 얇은 전용 컴포넌트.
 */
export function MiniTimelineStrip({ segments, selectedIndex, onSelect, onGoToEdit }: Props) {
  const total = segments.reduce((sum, s) => sum + playbackSeconds(s), 0);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setViewportWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Ctrl/Cmd+휠로 확대/축소 — 브라우저 페이지 확대(pinch-zoom)를 가로채야 하므로
  // React의 합성 이벤트(passive 리스너라 preventDefault가 막힘)가 아니라 네이티브
  // non-passive 리스너로 직접 붙인다.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) {
      return;
    }
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) {
        return;
      }
      e.preventDefault();
      setZoom((z) => clampZoom(e.deltaY < 0 ? z * WHEEL_ZOOM_FACTOR : z / WHEEL_ZOOM_FACTOR));
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  // Shift+Z로 전체 보기 복귀(입력 필드 타이핑 중에는 무시).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";
      if (isTyping) {
        return;
      }
      if (e.shiftKey && (e.key === "Z" || e.key === "z")) {
        e.preventDefault();
        setZoom(1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // 블록이 아닌 배경(트랙 사이 여백 등) 더블클릭 시 전체 보기로 복귀한다 — 블록
  // 자체의 더블클릭(onGoToEdit)은 각 버튼에서 stopPropagation으로 여기까지 오지 않는다.
  const handleBackgroundDoubleClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      setZoom(1);
    }
  };

  const contentWidth = zoom > 1 ? viewportWidth * zoom : viewportWidth;

  return (
    <div className="mini-strip">
      <div className="mini-strip-viewport" ref={viewportRef} onDoubleClick={handleBackgroundDoubleClick}>
        <div
          className="mini-strip-track"
          style={zoom > 1 ? { width: `${contentWidth}px`, flex: "0 0 auto" } : undefined}
        >
          {segments.map((seg, i) => {
            const play = playbackSeconds(seg);
            // 블록이 텍스트를 담기엔 너무 좁아 라벨을 렌더하지 않으므로, 판단에 필요한
            // 내용(자막 전문 포함)은 title 툴팁으로 전달한다.
            const label = seg.subtitle.trim() !== "" ? seg.subtitle.trim() : seg.clip || "(no filename)";
            const blockWidthPx = total > 0 ? (play / total) * contentWidth : 0;
            const prevClip = segments[i - 1]?.clip;
            const isClipBoundary = i > 0 && prevClip !== undefined && prevClip !== seg.clip;
            return (
              <button
                type="button"
                key={i}
                className={`mini-strip-block${i === selectedIndex ? " selected" : ""}${
                  isClipBoundary ? " clip-boundary" : ""
                }`}
                style={{ flexGrow: play, flexBasis: 0 }}
                onClick={() => onSelect(i)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  onGoToEdit(i);
                }}
                title={`${i + 1}. ${label} · ${seg.in.toFixed(1)}s~${seg.out.toFixed(1)}s (double-click: go to Edit)`}
              >
                {blockWidthPx >= MIN_THUMB_BLOCK_PX ? (
                  <SegmentThumb clip={seg.clip} t={seg.in + 0.3} className="mini-strip-thumb" />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
      <div className="mini-strip-zoom-controls">
        <button type="button" onClick={() => setZoom((z) => clampZoom(z / BUTTON_ZOOM_FACTOR))} title="Zoom out">
          −
        </button>
        <button type="button" onClick={() => setZoom(1)} title="Fit to width (Shift+Z)">
          Fit to width
        </button>
        <button type="button" onClick={() => setZoom((z) => clampZoom(z * BUTTON_ZOOM_FACTOR))} title="Zoom in">
          +
        </button>
      </div>
      <span className="mini-strip-total">{formatDuration(total)}</span>
    </div>
  );
}
