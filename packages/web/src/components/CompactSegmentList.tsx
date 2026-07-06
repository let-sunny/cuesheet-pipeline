import type { Segment } from "@cuesheet/schema";

interface Props {
  segments: Segment[];
  selectedIndex: number;
  onSelect: (i: number) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
  onMove: (i: number, direction: -1 | 1) => void;
}

/**
 * 다듬기 단계(②)의 좌측 컴팩트 컷 리스트. 번호/클립/시간/자막 유무 아이콘만
 * 보여주고 클릭으로 선택한다. 순서 이동/삭제/추가도 여기서 접근한다
 * (핸들 드래그가 주된 트림 방법이라 in/out 숫자 편집은 우측 보조 필드로 옮김).
 */
export function CompactSegmentList({ segments, selectedIndex, onSelect, onAdd, onRemove, onMove }: Props) {
  return (
    <div className="compact-list">
      {segments.map((seg, i) => {
        const label = seg.subtitle.trim() !== "" ? seg.subtitle.trim() : seg.clip || "(파일명 없음)";
        // 좁은 한 줄 안에서 CSS ellipsis로만 잘리게 하고(자체 slice로 미리 끊지 않음),
        // title 툴팁엔 화면에 보이는 것과 같은 전문 + 파일명을 함께 담아 판단에
        // 필요한 텍스트가 실제로는 안 잘리게 한다.
        const tooltip =
          seg.subtitle.trim() !== "" ? `${label} (${seg.clip || "(파일명 없음)"})` : label;
        return (
          <div
            className={`compact-list-row${i === selectedIndex ? " selected" : ""}`}
            key={i}
            onClick={() => onSelect(i)}
          >
            <span className="compact-list-index">{i + 1}</span>
            <span className="compact-list-clip" title={tooltip}>
              {label}
            </span>
            <span className="compact-list-time">
              {seg.in.toFixed(1)}~{seg.out.toFixed(1)}s
            </span>
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
