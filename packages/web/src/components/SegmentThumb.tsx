import { useEffect, useRef, useState } from "react";

interface Props {
  clip: string;
  /** Timestamp (seconds) to grab the thumbnail from. */
  t: number;
  className?: string;
}

/**
 * A single segment thumbnail. Uses IntersectionObserver to request it only when it comes near
 * the viewport, avoiding a flood of requests all at once when there are many cuts (tens to
 * hundreds), and updates only with the debounced t while the in value is changing rapidly from
 * dragging. If there's no proxy and the server returns 404 (onError), it's left as an empty
 * placeholder.
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

/** Debounce delay (ms) for applying the t value with a delay so a request isn't fired for every frame during a drag. */
const DEBOUNCE_MS = 250;
