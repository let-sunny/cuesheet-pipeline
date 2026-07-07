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
 * 리사이즈 핸들 드래그를 항상 w==h(정사각 비율 좌표)를 유지하도록 변환한다.
 * 소스·출력 종횡비가 같으면(이 프로젝트 기준 16:9) w==h인 크롭은 왜곡이 없다.
 *
 * - 모서리 핸들(nw/ne/se/sw): 반대쪽 모서리를 앵커로 고정하고, 두 드래그 축의
 *   평균(대각 방향 이동량)으로 정사각 한 변의 길이를 계산한다.
 * - 변 핸들(n/e/s/w): 앵커(반대쪽 변)를 고정한 채 한 축만으로 크기를 정하고,
 *   반대 축은 중심을 유지하며 같은 크기로 동기화한다.
 */
function resizeSquare(s: Crop, handle: HandleId, dx: number, dy: number): Crop {
  switch (handle) {
    case "se": {
      const bound = Math.min(1 - s.x, 1 - s.y);
      const size = clamp(s.w + (dx + dy) / 2, MIN_SIZE, bound);
      return { x: s.x, y: s.y, w: size, h: size };
    }
    case "nw": {
      const bound = Math.min(s.x + s.w, s.y + s.h);
      const size = clamp(s.w - (dx + dy) / 2, MIN_SIZE, bound);
      return { x: s.x + s.w - size, y: s.y + s.h - size, w: size, h: size };
    }
    case "ne": {
      const bound = Math.min(1 - s.x, s.y + s.h);
      const size = clamp(s.w + (dx - dy) / 2, MIN_SIZE, bound);
      return { x: s.x, y: s.y + s.h - size, w: size, h: size };
    }
    case "sw": {
      const bound = Math.min(s.x + s.w, 1 - s.y);
      const size = clamp(s.w + (dy - dx) / 2, MIN_SIZE, bound);
      return { x: s.x + s.w - size, y: s.y, w: size, h: size };
    }
    case "e": {
      const size = clamp(s.w + dx, MIN_SIZE, 1 - s.x);
      return { x: s.x, y: fitCrossAxis(size, s.y, s.h), w: size, h: size };
    }
    case "w": {
      const newX = clamp(s.x + dx, 0, s.x + s.w - MIN_SIZE);
      const size = s.x + s.w - newX;
      return { x: s.x + s.w - size, y: fitCrossAxis(size, s.y, s.h), w: size, h: size };
    }
    case "s": {
      const size = clamp(s.h + dy, MIN_SIZE, 1 - s.y);
      return { x: fitCrossAxis(size, s.x, s.w), y: s.y, w: size, h: size };
    }
    case "n": {
      const newY = clamp(s.y + dy, 0, s.y + s.h - MIN_SIZE);
      const size = s.y + s.h - newY;
      return { x: fitCrossAxis(size, s.x, s.w), y: s.y + s.h - size, w: size, h: size };
    }
    default:
      return s;
  }
}

/**
 * 변 핸들 드래그로 정해진 크기(size, 드래그 축 자체 앵커로만 결정됨)를, 반대 축에서는
 * 크기를 줄이지 않고 "가능한 한 현재 중심 유지, 프레임을 벗어나면 안쪽으로 밀어 넣기"로
 * 배치한다. size는 항상 <=1이므로(드래그 축 앵커가 이미 그 한도를 보장) 이 배치는 항상
 * 성립한다 — 예전엔 반대 축 중심 기준으로 size 자체를 깎아버려서(다른 핸들로 이미 프레임
 * 경계에 닿은 크롭을 한 변만 당겨도 확장이 막히는 버그가 있었다), 그 버그를 없앤 버전.
 */
function fitCrossAxis(size: number, otherAxisPos: number, otherAxisLen: number): number {
  const center = otherAxisPos + otherAxisLen / 2;
  return clamp(center - size / 2, 0, 1 - size);
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
      // 이동은 w/h를 안 건드리므로 정사각(w==h) 불변이 자동으로 유지된다.
      onChange({
        x: clamp(s.x + dx, 0, 1 - s.w),
        y: clamp(s.y + dy, 0, 1 - s.h),
        w: s.w,
        h: s.h,
      });
      return;
    }

    onChange(resizeSquare(s, start.handle, dx, dy));
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
