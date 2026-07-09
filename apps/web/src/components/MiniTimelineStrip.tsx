import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { Segment } from "@cuesheet/schema";
import { clamp } from "../lib/clamp.js";
import { formatClock, playbackSeconds } from "../lib/segmentTiming.js";
import { SegmentThumb } from "./SegmentThumb/index.js";

interface Props {
  segments: Segment[];
  selectedIndex: number;
  onSelect: (i: number) => void;
  /** Called on double-clicking a block — switches to the Edit step and selects that cut. */
  onGoToEdit: (i: number) => void;
}

/**
 * The always-visible thin timeline strip. Shows only segment blocks (excluding BGM), sized
 * purely proportionally to output duration; click to select, double-click to jump to the Edit
 * step, and shows the total duration on the right. Can be zoomed in (with horizontal scroll)
 * via Ctrl/Cmd+wheel or the +/- buttons, and once zoomed in, thumbnails reappear if the block
 * width is 24px or more. Shift+Z or double-clicking the background (not a block) returns to
 * fit view (1x zoom).
 * Always-visible regardless of step (unlike the BGM gutter, which lives next to the cut list in
 * the Edit step only — see CompactSegmentList).
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

  // Zoom in/out via Ctrl/Cmd+wheel — since browser page zoom (pinch-zoom) needs to be
  // intercepted, we attach a native non-passive listener directly instead of using React's
  // synthetic event (which is a passive listener, so preventDefault is blocked).
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

  // Return to fit view via Shift+Z (ignored while typing in an input field).
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

  // Double-clicking the background (not a block, e.g. the gap between tracks) returns to fit
  // view — a block's own double-click (onGoToEdit) never reaches here since each button calls stopPropagation.
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
            // The block is too narrow to hold text so no label is rendered; the content needed
            // for judgment (including the full subtitle text) is conveyed via the title tooltip instead.
            const label = seg.subtitle.trim() !== "" ? seg.subtitle.trim() : seg.clip || "(no filename)";
            const blockWidthPx = total > 0 ? (play / total) * contentWidth : 0;
            const prevClip = segments[i - 1]?.clip;
            const isClipBoundary = i > 0 && prevClip !== undefined && prevClip !== seg.clip;
            return (
              <button
                type="button"
                key={i}
                className={`plain-button mini-strip-block${i === selectedIndex ? " selected" : ""}${
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
        <button type="button" className="plain-button" onClick={() => setZoom((z) => clampZoom(z / BUTTON_ZOOM_FACTOR))} title="Zoom out">
          −
        </button>
        <button type="button" className="plain-button" onClick={() => setZoom(1)} title="Fit to width (Shift+Z)">
          Fit to width
        </button>
        <button type="button" className="plain-button" onClick={() => setZoom((z) => clampZoom(z * BUTTON_ZOOM_FACTOR))} title="Zoom in">
          +
        </button>
      </div>
      <span className="mini-strip-total">{formatClock(total, true)}</span>
    </div>
  );
}

function clampZoom(z: number): number {
  return clamp(z, MIN_ZOOM, MAX_ZOOM);
}

/** Blocks narrower than this width (px) skip the thumbnail and just keep the color (too narrow to make out anyway). */
const MIN_THUMB_BLOCK_PX = 24;

/** Zoom factor lower/upper bound. 1 = fit view (matches width). */
const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
/** Zoom factor change per wheel step (Ctrl/Cmd+wheel). */
const WHEEL_ZOOM_FACTOR = 1.2;
/** Zoom factor change per +/- button click. */
const BUTTON_ZOOM_FACTOR = 1.5;
