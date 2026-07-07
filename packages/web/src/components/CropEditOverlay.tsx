import { useRef } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import type { Crop } from "@cuesheet/schema";

/** crop.w/crop.h는 schema상 0.1보다 커야 하므로(gt, 이상 아님) 살짝 여유를 둔 하한. */
const MIN_SIZE = 0.11;

type HandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

const HANDLE_IDS: HandleId[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

interface Props {
  crop: Crop;
  /** crop 오버레이가 그려질 컨테이너(비디오를 감싼 프레임) — 픽셀↔비율 환산 기준. */
  frameRef: RefObject<HTMLDivElement | null>;
  onChange: (crop: Crop) => void;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

/**
 * 크롭 편집 모드에서 비디오 위에 얹히는 오버레이: box-shadow 트릭으로 크롭 밖을
 * 어둡게 덮고, 밝은 사각형(현재 크롭 영역)을 드래그(이동)·8방향 핸들(리사이즈)로
 * 조절한다. 좌표는 전부 0~1 비율(frameRef 크기 기준)로 계산해 onChange로 즉시
 * 부모(VideoPreview)에 알린다 — 적용/취소 커밋은 부모가 관리한다.
 */
export function CropEditOverlay({ crop, frameRef, onChange }: Props) {
  const dragStart = useRef<{
    crop: Crop;
    clientX: number;
    clientY: number;
    handle: HandleId | "move";
  } | null>(null);

  const startDrag = (handle: HandleId | "move") => (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStart.current = { crop, clientX: e.clientX, clientY: e.clientY, handle };
  };

  const onDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const start = dragStart.current;
    const el = frameRef.current;
    if (!start || !el || e.buttons === 0) {
      return;
    }
    e.stopPropagation();
    const rect = el.getBoundingClientRect();
    const dx = rect.width > 0 ? (e.clientX - start.clientX) / rect.width : 0;
    const dy = rect.height > 0 ? (e.clientY - start.clientY) / rect.height : 0;
    const s = start.crop;

    if (start.handle === "move") {
      onChange({
        x: clamp(s.x + dx, 0, 1 - s.w),
        y: clamp(s.y + dy, 0, 1 - s.h),
        w: s.w,
        h: s.h,
      });
      return;
    }

    let { x, y, w, h } = s;
    if (start.handle.includes("e")) {
      w = clamp(s.w + dx, MIN_SIZE, 1 - s.x);
    }
    if (start.handle.includes("w")) {
      const newX = clamp(s.x + dx, 0, s.x + s.w - MIN_SIZE);
      w = s.x + s.w - newX;
      x = newX;
    }
    if (start.handle.includes("s")) {
      h = clamp(s.h + dy, MIN_SIZE, 1 - s.y);
    }
    if (start.handle.includes("n")) {
      const newY = clamp(s.y + dy, 0, s.y + s.h - MIN_SIZE);
      h = s.y + s.h - newY;
      y = newY;
    }
    onChange({ x, y, w, h });
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    dragStart.current = null;
  };

  const boxStyle = {
    left: `${crop.x * 100}%`,
    top: `${crop.y * 100}%`,
    width: `${crop.w * 100}%`,
    height: `${crop.h * 100}%`,
  };

  return (
    <div className="crop-edit-overlay">
      <div
        className="crop-edit-box"
        style={boxStyle}
        onPointerDown={startDrag("move")}
        onPointerMove={onDrag}
        onPointerUp={endDrag}
      >
        {HANDLE_IDS.map((id) => (
          <div
            key={id}
            className={`crop-edit-handle handle-${id}`}
            onPointerDown={startDrag(id)}
            onPointerMove={onDrag}
            onPointerUp={endDrag}
          />
        ))}
      </div>
    </div>
  );
}
