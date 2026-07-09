import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import * as stylex from "@stylexjs/stylex";
import { ToolbarButton } from "../ui/ToolbarButton/index.js";
import { formatClock } from "../../lib/segmentTiming.js";
import { clamp } from "../../lib/clamp.js";
import {
  MIN_GAP_S,
  computeDefaultTrimWindow,
  filmstripThumbTimes,
  fitClipViewport,
  moveTrimWindow,
  panViewport,
  resizeViewportEdge,
  zoomViewportAtTime,
  zoomViewportCentered,
} from "../../lib/trimWindow.js";
import type { TrimWindow } from "../../lib/trimWindow.js";
import { SegmentThumb } from "../SegmentThumb/index.js";
import { styles } from "./TrimStrip.styles.js";

export interface TrimStripProps {
  /** Source clip filename - all filmstrip thumbnails come from this one clip. */
  clip: string;
  durationS: number;
  inS: number;
  outS: number;
  currentTimeS: number;
  /** Changing this recomputes the default viewport (`computeDefaultTrimWindow`) - pass the
   * selected cut's index so switching cuts resets the zoom, without resetting on every in/out edit. */
  resetKey: number | string;
  onChangeIn: (t: number) => void;
  onChangeOut: (t: number) => void;
  /** Seeks the preview - fired on any scrub-track interaction and on every handle drag (so the
   * preview shows the trimmed frame while trimming, per trim-ux-conventions.md section 4.4). */
  onSeek: (t: number) => void;
  /** Reports the current viewport (seconds) - purely informational, e.g. for VideoPreview's
   * "Now/In/Out" readout to also show the visible range while zoomed. */
  onViewportChange?: (viewport: TrimWindow) => void;
}

/**
 * A single zoomable filmstrip strip replacing the old two-level trim (overview bar + detail bar) -
 * see docs/research/trim-ux-conventions.md section 4 (the Premiere Source Monitor model: one
 * scrub surface, precision via zooming that same surface, plus a scrollbar-styled pan control
 * that only appears once zoomed in). Renders filmstrip thumbnails of the visible viewport
 * (falling back to ruler ticks per cell while a thumbnail is loading/unavailable), the existing
 * shaded in/out range + drag handles + playhead overlaid on top, a zoom control row, and the pan
 * control.
 */
export function TrimStrip({
  clip,
  durationS,
  inS,
  outS,
  currentTimeS,
  resetKey,
  onChangeIn,
  onChangeOut,
  onSeek,
  onViewportChange,
}: TrimStripProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const panTroughRef = useRef<HTMLDivElement | null>(null);
  const panDragOffsetTRef = useRef(0);
  const [viewport, setViewport] = useState<TrimWindow>({ start: 0, end: 0 });
  // Starts at a reasonable placeholder (rather than 0) so the very first paint - before
  // ResizeObserver's first (async) callback reports the real width - still renders at least one
  // filmstrip cell instead of a blank track (trim-ux-conventions.md section 4.1: "never a blank
  // track").
  const [trackWidthPx, setTrackWidthPx] = useState(DEFAULT_TRACK_WIDTH_PX);

  // Resets the viewport to the default (cut's in/out padded, floored at 20s) whenever the
  // selected cut changes or the clip's duration updates (metadata just loaded) - deliberately
  // excludes inS/outS from the deps so dragging the handles doesn't fight itself by resetting the
  // very viewport it's being dragged within (same rule the old two-level trim followed).
  useEffect(() => {
    setViewport(computeDefaultTrimWindow(inS, outS, durationS));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, durationS]);

  useEffect(() => {
    onViewportChange?.(viewport);
  }, [viewport, onViewportChange]);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setTrackWidthPx(entry.contentRect.width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Ctrl/Cmd+wheel zooms centered on the cursor's time position (same gesture as
  // MiniTimelineStrip) - attached as a native non-passive listener since preventDefault on a
  // wheel event needs that (React's synthetic wheel handler is passive).
  useEffect(() => {
    const el = trackRef.current;
    if (!el) {
      return;
    }
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) {
        return;
      }
      e.preventDefault();
      const anchorT = timeAtClientX(el, viewport, e.clientX);
      setViewport((v) => zoomViewportAtTime(v, durationS, anchorT, e.deltaY < 0 ? WHEEL_ZOOM_FACTOR : 1 / WHEEL_ZOOM_FACTOR));
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport, durationS]);

  // Shift+Z resets to Fit clip (matches MiniTimelineStrip's fit shortcut) - ignored while typing.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";
      if (isTyping) {
        return;
      }
      if (e.shiftKey && (e.key === "Z" || e.key === "z")) {
        e.preventDefault();
        setViewport(fitClipViewport(durationS));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [durationS]);

  const viewportWidth = viewport.end - viewport.start;
  const pctFor = (t: number): number =>
    viewportWidth > 0 ? clamp(((t - viewport.start) / viewportWidth) * 100, 0, 100) : 0;

  const handleTrackPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (viewportWidth <= 0) {
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    onSeek(timeAtClientX(trackRef.current, viewport, e.clientX));
  };

  const handleTrackPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.buttons === 0 || viewportWidth <= 0) {
      return;
    }
    onSeek(timeAtClientX(trackRef.current, viewport, e.clientX));
  };

  const startHandleDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const dragHandle = (which: "in" | "out") => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.buttons === 0 || viewportWidth <= 0) {
      return;
    }
    e.stopPropagation();
    const t = timeAtClientX(trackRef.current, viewport, e.clientX);
    const next = which === "in" ? clamp(t, 0, outS - MIN_GAP_S) : clamp(t, inS + MIN_GAP_S, durationS);
    if (which === "in") {
      onChangeIn(next);
    } else {
      onChangeOut(next);
    }
    onSeek(next);
  };

  const zoomAtPlayhead = (factor: number) => setViewport((v) => zoomViewportCentered(v, durationS, currentTimeS, factor));

  const troughTimeAtClientX = (clientX: number): number => {
    const el = panTroughRef.current;
    if (!el || durationS <= 0) {
      return 0;
    }
    const rect = el.getBoundingClientRect();
    const fraction = clamp((clientX - rect.left) / rect.width, 0, 1);
    return fraction * durationS;
  };

  const handleTroughPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setViewport((v) => moveTrimWindow(v, durationS, troughTimeAtClientX(e.clientX)));
  };

  const startThumbDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    panDragOffsetTRef.current = troughTimeAtClientX(e.clientX) - viewport.start;
  };

  const dragThumbBody = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.buttons === 0) {
      return;
    }
    e.stopPropagation();
    const desiredStart = troughTimeAtClientX(e.clientX) - panDragOffsetTRef.current;
    setViewport((v) => panViewport(v, durationS, desiredStart - v.start));
  };

  const dragThumbEdge = (edge: "start" | "end") => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.buttons === 0) {
      return;
    }
    e.stopPropagation();
    const t = troughTimeAtClientX(e.clientX);
    setViewport((v) => resizeViewportEdge(v, durationS, edge, t));
  };

  // The pan control only shows once zoomed in past Fit clip - nothing dead on screen at fit
  // (trim-ux-conventions.md section 4.3).
  const isZoomedIn = durationS > 0 && viewportWidth < durationS - FIT_EPSILON_S;
  const thumbTimes = filmstripThumbTimes(viewport, trackWidthPx, THUMB_STRIDE_PX);

  return (
    <div {...stylex.props(styles.root)} data-testid="trim-strip">
      <div
        {...stylex.props(styles.track)}
        ref={trackRef}
        data-testid="trim-strip-filmstrip"
        onPointerDown={handleTrackPointerDown}
        onPointerMove={handleTrackPointerMove}
      >
        <div {...stylex.props(styles.filmstripRow)}>
          {thumbTimes.map((t, i) => (
            <FilmstripCell key={i} clip={clip} t={t} />
          ))}
        </div>
        <div
          {...stylex.props(styles.range)}
          style={{ left: `${pctFor(inS)}%`, width: `${Math.max(0, pctFor(outS) - pctFor(inS))}%` }}
        />
        <div
          {...stylex.props(styles.handle)}
          style={{ left: `${pctFor(inS)}%` }}
          onPointerDown={startHandleDrag}
          onPointerMove={dragHandle("in")}
          data-testid="trim-strip-handle-in"
        />
        <div
          {...stylex.props(styles.handle)}
          style={{ left: `${pctFor(outS)}%` }}
          onPointerDown={startHandleDrag}
          onPointerMove={dragHandle("out")}
          data-testid="trim-strip-handle-out"
        />
        <div {...stylex.props(styles.playhead)} style={{ left: `${pctFor(currentTimeS)}%` }} />
      </div>

      <div {...stylex.props(styles.zoomRow)}>
        <ToolbarButton
          label="-"
          variant="ghost"
          size="sm"
          onClick={() => zoomAtPlayhead(1 / BUTTON_ZOOM_FACTOR)}
          tooltip="Zoom out"
          data-testid="trim-strip-zoom-out"
        />
        <ToolbarButton
          label="Fit cut"
          variant="ghost"
          size="sm"
          onClick={() => setViewport(computeDefaultTrimWindow(inS, outS, durationS))}
          tooltip="Zoom to this cut's in/out range"
          data-testid="trim-strip-fit-cut"
        />
        <ToolbarButton
          label="Fit clip"
          variant="ghost"
          size="sm"
          onClick={() => setViewport(fitClipViewport(durationS))}
          tooltip="Zoom out to the whole clip (Shift+Z)"
          data-testid="trim-strip-fit-clip"
        />
        <ToolbarButton
          label="+"
          variant="ghost"
          size="sm"
          onClick={() => zoomAtPlayhead(BUTTON_ZOOM_FACTOR)}
          tooltip="Zoom in"
          data-testid="trim-strip-zoom-in"
        />
      </div>

      {isZoomedIn ? (
        <div {...stylex.props(styles.panTrough)} ref={panTroughRef} onPointerDown={handleTroughPointerDown} data-testid="trim-strip-pan">
          <div
            {...stylex.props(styles.panCutTick)}
            style={{
              left: `${durationS > 0 ? (inS / durationS) * 100 : 0}%`,
              width: `${durationS > 0 ? ((outS - inS) / durationS) * 100 : 0}%`,
            }}
          />
          <div
            {...stylex.props(styles.panThumb)}
            style={{
              left: `${durationS > 0 ? (viewport.start / durationS) * 100 : 0}%`,
              width: `${durationS > 0 ? (viewportWidth / durationS) * 100 : 0}%`,
            }}
            onPointerDown={startThumbDrag}
            onPointerMove={dragThumbBody}
            data-testid="trim-strip-pan-thumb"
          >
            <div {...stylex.props(styles.panEdge, styles.panEdgeStart)} onPointerDown={startThumbDrag} onPointerMove={dragThumbEdge("start")} data-testid="trim-strip-pan-edge-start" />
            <div {...stylex.props(styles.panEdge, styles.panEdgeEnd)} onPointerDown={startThumbDrag} onPointerMove={dragThumbEdge("end")} data-testid="trim-strip-pan-edge-end" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * One filmstrip cell: shows a ruler tick + time label until its `SegmentThumb` resolves (loads
 * successfully), then swaps to the thumbnail - "ruler-tick fallback while thumbs load", never a
 * blank track (trim-ux-conventions.md section 4.1). Stays on the ruler permanently if the
 * thumbnail request fails (no proxy/404).
 */
function FilmstripCell({ clip, t }: { clip: string; t: number }) {
  const [ok, setOk] = useState(false);

  return (
    <div {...stylex.props(styles.cell)}>
      {!ok ? (
        <div {...stylex.props(styles.ruler)}>
          <span {...stylex.props(styles.rulerTick)} />
          <span {...stylex.props(styles.rulerLabel)}>{formatClock(t, true)}</span>
        </div>
      ) : null}
      <div {...stylex.props(styles.cellThumb, !ok && styles.cellThumbHidden)}>
        <SegmentThumb clip={clip} t={t} onResult={setOk} />
      </div>
    </div>
  );
}

/** Maps a client X position to a time within `viewport`, given the track element's rect. */
function timeAtClientX(el: HTMLElement | null, viewport: TrimWindow, clientX: number): number {
  const width = viewport.end - viewport.start;
  if (!el || width <= 0) {
    return viewport.start;
  }
  const rect = el.getBoundingClientRect();
  const fraction = clamp((clientX - rect.left) / rect.width, 0, 1);
  return viewport.start + fraction * width;
}

/** Placeholder track width (px) used only until ResizeObserver reports the real measured width. */
const DEFAULT_TRACK_WIDTH_PX = 400;
/** One filmstrip thumbnail per this many pixels (trim-ux-conventions.md section 4.1). */
const THUMB_STRIDE_PX = 64;
/** Zoom factor per Ctrl/Cmd+wheel notch (matches MiniTimelineStrip's convention). */
const WHEEL_ZOOM_FACTOR = 1.2;
/** Zoom factor per +/- button click. */
const BUTTON_ZOOM_FACTOR = 1.5;
/** The pan control is hidden once the viewport is within this many seconds of the full clip
 * (floating-point slack around "Fit clip"). */
const FIT_EPSILON_S = 0.01;
