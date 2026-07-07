import { useEffect, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { Segment } from "@cuesheet/schema";
import type { ClipMoments } from "../api.js";
import { matchSceneInfo, shotTypeLabel } from "../sceneInfo.js";
import { SegmentThumb } from "./SegmentThumb.js";

interface Props {
  segments: Segment[];
  selectedIndex: number;
  /** 초벌 비전 판독 데이터 — 각 컷이 무슨 장면인지 2번째 줄에 보여주는 데 쓴다. */
  moments: ClipMoments[];
  onSelect: (i: number) => void;
  onChangeSubtitle: (i: number, subtitle: string) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
  onMove: (i: number, direction: -1 | 1) => void;
}

/**
 * 편집 단계(②)의 좌측 컷 리스트 — 다듬기/몰아쓰기 모드 통합본. 번호/썸네일과 함께
 * 자막을 그 자리에서 바로 고칠 수 있는 textarea가 상시 보이고(행 클릭/포커스 시 그
 * 컷이 선택되어 우측 비디오·필드가 따라온다), Tab/Shift+Tab으로 다음/이전 컷 자막
 * 입력창으로 이동해 몰아 쓰는 흐름을 그대로 지원한다. 2번째 줄엔 초벌 비전 판독
 * 장면 묘사(memo)를 보여준다.
 */
export function CompactSegmentList({
  segments,
  selectedIndex,
  moments,
  onSelect,
  onChangeSubtitle,
  onAdd,
  onRemove,
  onMove,
}: Props) {
  const rowRefs = useRef<Array<HTMLTextAreaElement | null>>([]);

  useEffect(() => {
    rowRefs.current = rowRefs.current.slice(0, segments.length);
  }, [segments.length]);

  // 자막 전문이 잘리지 않고 다 보이게 줄 수에 맞춰 textarea 높이를 늘린다(고정 rows=1은
  // 시작 최소 높이일 뿐, 넘치면 스크롤이 아니라 높이가 늘어난다).
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

  const handleSubtitleKeyDown =
    (i: number) => (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Tab") {
        e.preventDefault();
        focusRow(i + (e.shiftKey ? -1 : 1));
      }
    };

  return (
    <div className="compact-list">
      {segments.map((seg, i) => {
        const tooltip = seg.subtitle.trim() !== "" ? `${seg.subtitle.trim()} (${seg.clip || "(파일명 없음)"})` : seg.clip || "(파일명 없음)";
        const sceneInfo = matchSceneInfo(seg, moments);
        const sceneText = sceneInfo.kind === "none" ? "장면 정보 없음" : sceneInfo.memo;
        const sceneTooltip =
          sceneInfo.kind === "moment"
            ? `${shotTypeLabel(sceneInfo.shotType)} · ${sceneInfo.memo}`
            : sceneText;
        return (
          <div
            className={`compact-list-row${i === selectedIndex ? " selected" : ""}`}
            key={i}
            onClick={() => onSelect(i)}
          >
            <span className="compact-list-index">{i + 1}</span>
            <SegmentThumb clip={seg.clip} t={seg.in + 0.3} className="compact-list-thumb" />
            <div className="compact-list-text">
              <textarea
                ref={(el) => {
                  rowRefs.current[i] = el;
                  autoResize(el);
                }}
                className="compact-list-subtitle-input"
                value={seg.subtitle}
                rows={1}
                placeholder={seg.clip || "(파일명 없음)"}
                title={tooltip}
                onFocus={() => onSelect(i)}
                onChange={(e) => {
                  onChangeSubtitle(i, e.target.value);
                  autoResize(e.target);
                }}
                onKeyDown={handleSubtitleKeyDown(i)}
              />
              <span
                className={`compact-list-scene${sceneInfo.kind === "none" ? " empty" : ""}`}
                title={sceneTooltip}
              >
                {sceneInfo.kind === "moment" ? (
                  <span className={`scene-shot-badge shot-${sceneInfo.shotType}`}>
                    {shotTypeLabel(sceneInfo.shotType)}
                  </span>
                ) : null}
                {sceneInfo.kind === "monotonous" ? (
                  <span className="scene-shot-badge shot-monotonous">배속구간</span>
                ) : null}
                {sceneText}
              </span>
            </div>
            <span className="compact-list-time">
              {seg.in.toFixed(1)}~{seg.out.toFixed(1)}s
            </span>
            {seg.styleOverride ? (
              <span className="compact-list-style-badge" title="이 컷만 자막 스타일이 다릅니다">
                스타일
              </span>
            ) : null}
            <span
              className={`compact-list-subtitle-dot${seg.subtitle ? " filled" : ""}`}
              title={seg.subtitle ? "자막 있음" : "자막 없음"}
            />
            <div className="compact-list-actions">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onMove(i, -1);
                }}
                disabled={i === 0}
                title="위로"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onMove(i, 1);
                }}
                disabled={i === segments.length - 1}
                title="아래로"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(i);
                }}
                disabled={segments.length <= 1}
                title="삭제"
              >
                ✕
              </button>
            </div>
          </div>
        );
      })}
      <button type="button" className="add-button" onClick={onAdd}>
        세그먼트 추가
      </button>
    </div>
  );
}
