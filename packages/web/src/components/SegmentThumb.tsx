import { useEffect, useRef, useState } from "react";

/** 드래그 중 매 프레임 요청이 나가지 않도록 t 값을 늦춰 반영하는 디바운스 지연(ms). */
const DEBOUNCE_MS = 250;

interface Props {
  clip: string;
  /** 썸네일을 뽑을 시각(초). */
  t: number;
  className?: string;
}

/**
 * 세그먼트 썸네일 하나. IntersectionObserver로 화면 근처에 들어올 때만 요청해
 * 컷이 많을 때(수십~백여 개) 한꺼번에 요청이 몰리는 걸 피하고, in 값이 드래그로
 * 빠르게 바뀌는 동안은 디바운스된 t로만 갱신한다. 프록시가 없어 서버가 404를
 * 주면(onError) 빈 자리 placeholder로 남는다.
 */
export function SegmentThumb({ clip, t, className }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [debouncedT, setDebouncedT] = useState(t);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || visible) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedT(t), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [t]);

  useEffect(() => {
    setFailed(false);
  }, [clip, debouncedT]);

  const className_ = `segment-thumb${className ? ` ${className}` : ""}`;

  if (!clip || !visible || failed) {
    return <div ref={containerRef} className={className_} />;
  }

  return (
    <div ref={containerRef} className={className_}>
      <img
        src={`/api/thumb?clip=${encodeURIComponent(clip)}&t=${debouncedT.toFixed(1)}`}
        alt=""
        onError={() => setFailed(true)}
      />
    </div>
  );
}
