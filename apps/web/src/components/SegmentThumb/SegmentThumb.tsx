import { useEffect, useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { styles } from "./SegmentThumb.styles.js";

interface Props {
  clip: string;
  /** Timestamp (seconds) to grab the thumbnail from. */
  t: number;
  className?: string;
  /**
   * Reports whether the thumbnail ultimately resolved: `true` once the image loads, `false` for
   * "unavailable" (no clip filename, or the request 404s). Not called while a thumbnail is still
   * pending (not yet visible/loading) - only on a definite outcome. Used by consumers like
   * TrimStrip to fall back to a ruler-tick placeholder per cell when a thumbnail can't be shown.
   */
  onResult?: (ok: boolean) => void;
}

/**
 * A single segment thumbnail. Uses IntersectionObserver to request it only when it comes near
 * the viewport, avoiding a flood of requests all at once when there are many cuts (tens to
 * hundreds), and updates only with the debounced t while the in value is changing rapidly from
 * dragging. If there's no proxy and the server returns 404 (onError), it's left as an empty
 * placeholder.
 */
export function SegmentThumb({ clip, t, className, onResult }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [debouncedT, setDebouncedT] = useState(t);
  const [failed, setFailed] = useState(false);
  // Tracks the clip the debounce below is currently running for, so a clip change (e.g. this row
  // now points at an entirely different segment after a rapid undo/redo) can snap debouncedT to
  // the new t immediately instead of riding out the leftover debounce window for the OLD clip -
  // see the debounce effect's comment for why that matters.
  const prevClipRef = useRef(clip);

  useEffect(() => {
    if (!clip) {
      onResult?.(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip]);

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

  // Debounces t (so a drag doesn't fire a request per frame) - but only within the SAME clip.
  // Bug fixed (QA finding 2026-07-10): this effect used to depend on `[t]` alone, so when `clip`
  // changed without `t` happening to change too (or before the previous clip's pending timer had
  // fired), the rendered <img> combined the new (live, undebounced) `clip` with a `debouncedT`
  // still trailing the OLD clip - a mismatched (clip, t) pair that's often not even a valid
  // timestamp for the new clip (e.g. exceeds its duration), so /api/thumb 500s. A clip change now
  // snaps debouncedT to t immediately, skipping the debounce entirely - debouncing only ever made
  // sense for smoothing repeated t changes while scrubbing the same clip's in point.
  useEffect(() => {
    if (prevClipRef.current !== clip) {
      prevClipRef.current = clip;
      setDebouncedT(t);
      return;
    }
    const id = setTimeout(() => setDebouncedT(t), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [clip, t]);

  useEffect(() => {
    setFailed(false);
  }, [clip, debouncedT]);

  // consumer classNames (MiniTimelineStrip's plain `.mini-strip-thumb`, or CompactSegmentList's
  // already-stylex-generated className string) are appended as a plain string - see
  // SegmentThumb.styles.ts for why this stays a concatenation instead of stylex.props(base, extra).
  const containerClassName = `${stylex.props(styles.segmentThumb).className}${className ? ` ${className}` : ""}`;

  if (!clip || !visible || failed) {
    return <div ref={containerRef} className={containerClassName} />;
  }

  return (
    <div ref={containerRef} className={containerClassName}>
      <img
        {...stylex.props(styles.img)}
        src={`/api/thumb?clip=${encodeURIComponent(clip)}&t=${debouncedT.toFixed(1)}`}
        alt=""
        onLoad={() => onResult?.(true)}
        onError={() => {
          setFailed(true);
          onResult?.(false);
        }}
      />
    </div>
  );
}

/** Debounce delay (ms) for applying the t value with a delay so a request isn't fired for every frame during a drag. */
const DEBOUNCE_MS = 250;
