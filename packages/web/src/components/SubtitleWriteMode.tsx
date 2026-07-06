import { useEffect, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { Segment } from "@cuesheet/schema";

interface Props {
  segments: Segment[];
  selectedIndex: number;
  onSelect: (i: number) => void;
  onChangeSubtitle: (i: number, subtitle: string) => void;
  narrationEnabled: boolean;
}

/**
 * 자막 쓰기 모드: 세그먼트별 자막 입력창을 세로 리스트로 펼쳐서 몰아 쓰는 뷰.
 * 입력창에 포커스하면 그 컷이 선택되어 VideoPreview가 구간 반복 재생을 따라간다.
 * Tab/Shift+Tab으로 다음/이전 컷 입력창으로 이동(기본 Tab 동작은 막고 직접 focus 이동).
 */
export function SubtitleWriteMode({
  segments,
  selectedIndex,
  onSelect,
  onChangeSubtitle,
  narrationEnabled,
}: Props) {
  const rowRefs = useRef<Array<HTMLTextAreaElement | null>>([]);

  useEffect(() => {
    rowRefs.current = rowRefs.current.slice(0, segments.length);
  }, [segments.length]);

  // 자막 전문이 잘리지 않고 항상 다 보이게 줄 수에 맞춰 textarea 높이를 늘린다
  // (고정 rows=2는 시작 최소 높이일 뿐, 넘치면 스크롤이 아니라 높이가 늘어난다).
  const autoResize = (el: HTMLTextAreaElement | null) => {
    if (!el) {
      return;
    }
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  // 처음 로드 시(이미 여러 줄인 기존 자막 포함) 모든 행 높이를 내용에 맞춘다.
  useEffect(() => {
    rowRefs.current.forEach((el) => autoResize(el));
  }, [segments]);

  const focusRow = (i: number) => {
    if (i < 0 || i >= segments.length) {
      return;
    }
    rowRefs.current[i]?.focus();
  };

  const handleKeyDown =
    (i: number) => (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Tab") {
        e.preventDefault();
        focusRow(i + (e.shiftKey ? -1 : 1));
      }
    };

  return (
    <div className="subtitle-write-mode">
      {segments.map((seg, i) => (
        <div className={`subtitle-write-row${i === selectedIndex ? " selected" : ""}`} key={i}>
          <div className="subtitle-write-meta">
            <span className="subtitle-write-index">{i + 1}</span>
            <span className="subtitle-write-range">
              {seg.in.toFixed(1)}s ~ {seg.out.toFixed(1)}s
            </span>
            {narrationEnabled ? (
              <span className="subtitle-write-narration">
                내레이션: {seg.narration ?? "(없음)"}
              </span>
            ) : null}
          </div>
          <textarea
            ref={(el) => {
              rowRefs.current[i] = el;
              autoResize(el);
            }}
            value={seg.subtitle}
            rows={2}
            placeholder="자막을 입력하세요"
            onFocus={() => onSelect(i)}
            onChange={(e) => {
              onChangeSubtitle(i, e.target.value);
              autoResize(e.target);
            }}
            onKeyDown={handleKeyDown(i)}
          />
        </div>
      ))}
    </div>
  );
}
