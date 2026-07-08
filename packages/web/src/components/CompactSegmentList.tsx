import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import type { BgmCue, Segment } from "@cuesheet/schema";
import type { ClipMoments } from "../api.js";
import { baseName } from "../clipPaths.js";
import { bgmCutRange, cumulativeCutStarts } from "../lib/bgmCutMapping.js";
import { assignBgmLanes, laneCount } from "../lib/bgmLanes.js";
import { matchSceneInfo, shotTypeLabel } from "../lib/sceneInfo.js";
import { SegmentThumb } from "./SegmentThumb.js";

interface Props {
  segments: Segment[];
  selectedIndex: number;
  /** Rough-cut vision-read data — used to show what scene each cut is on the 2nd line. */
  moments: ClipMoments[];
  onSelect: (i: number) => void;
  onChangeSubtitle: (i: number, subtitle: string) => void;
  /** Duplicates the selected cut right after it (not adding an empty cut — see addSegment in App.tsx). */
  onAdd: () => void;
  onRemove: (i: number) => void;
  onMove: (i: number, direction: -1 | 1) => void;
  bgm: BgmCue[];
  selectedBgmIndex: number | null;
  onSelectBgm: (i: number) => void;
  /** Adds a new track defaulting to span just the currently selected cut. */
  onAddBgmTrack: () => void;
  /** A track's cut-index range changed (via drag move/resize or the settings panel's numeric fields) — converted to seconds by the caller. */
  onChangeBgmRange: (bgmIndex: number, startCutIdx: number, endCutIdx: number) => void;
}

/**
 * Left-side cut list for the Edit step (②) — combined touch-up/bulk-write mode. Alongside
 * the number/thumbnail, a textarea for editing the subtitle right there is always visible
 * (clicking/focusing a row selects that cut, and the video/fields on the right follow it),
 * and Tab/Shift+Tab moves to the next/previous cut's subtitle input, supporting a bulk-writing
 * flow. The 2nd line shows the rough-cut vision-read scene description (memo).
 *
 * A collapsible BGM gutter sits to the left of the list (screen-spec section 3) — each bgm cue
 * renders as a vertical bar spanning the cut rows it covers, anchored to cut boundaries (not
 * arbitrary pixels), so the user places music changes while reading cut content instead of
 * against a blank timeline. Bar geometry is derived directly from the actual rendered row
 * elements (offsetTop/offsetHeight), not from a separate proportional time axis, so it's
 * pixel-exact with the cut strip by construction rather than by coincidence.
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
  bgm,
  selectedBgmIndex,
  onSelectBgm,
  onAddBgmTrack,
  onChangeBgmRange,
}: Props) {
  const rowRefs = useRef<Array<HTMLTextAreaElement | null>>([]);
  const rowDivRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [rowRects, setRowRects] = useState<Array<{ top: number; height: number }>>([]);
  const [bgmGutterCollapsed, setBgmGutterCollapsed] = useState(false);
  const [dragHighlight, setDragHighlight] = useState<{ start: number; end: number } | null>(null);
  const dragRef = useRef<{
    bgmIndex: number;
    mode: "move" | "resize-start" | "resize-end";
    originStartCutIdx: number;
    originEndCutIdx: number;
    originRowIdx: number;
  } | null>(null);

  useEffect(() => {
    rowRefs.current = rowRefs.current.slice(0, segments.length);
    rowDivRefs.current = rowDivRefs.current.slice(0, segments.length);
  }, [segments.length]);

  // Grow the textarea height to fit the number of lines so the full subtitle text is visible
  // without being cut off (the fixed rows=1 is just the starting minimum height; overflow
  // grows the height instead of scrolling). Also runs inline in the ref callback below, so by
  // the time this fires the heights are usually already correct — kept as a backstop.
  const autoResize = (el: HTMLTextAreaElement | null) => {
    if (!el) {
      return;
    }
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  useEffect(() => {
    rowRefs.current.forEach((el) => autoResize(el));
  }, [segments]);

  const measureRows = () => {
    const next = rowDivRefs.current.map((el) => (el ? { top: el.offsetTop, height: el.offsetHeight } : { top: 0, height: 0 }));
    // This effect has no dependency array (it needs to re-measure after every render, since a row
    // can grow/shrink from a subtitle edit without segments.length changing) - guarding on an
    // actual value change is what keeps that from looping forever, since setting a new array
    // reference unconditionally would re-render, which would re-run this same effect, forever.
    setRowRects((prev) => (rectsEqual(prev, next) ? prev : next));
  };

  // Re-measures every row's on-screen top/height after each render (ref-callback autoResize above
  // has already run by this point in the same commit) — the BGM gutter's bars are positioned from
  // this, so a row growing/shrinking (subtitle text wrapping, cut added/removed) keeps bars aligned.
  useLayoutEffect(() => {
    measureRows();
  });

  // The trim workspace can reflow on viewport resize independently of a React re-render.
  useEffect(() => {
    window.addEventListener("resize", measureRows);
    return () => window.removeEventListener("resize", measureRows);
  }, []);

  // Scroll the selected row into view whenever the cut count changes (duplicate/delete). The
  // "Duplicate selected cut" button sits at the bottom of the list, so clicking it makes the
  // browser scroll there, but the duplicate is inserted right after the original (in the middle
  // of the list) — leaving this alone would leave the newly created cut off-screen, reviving the
  // original "did it even duplicate?" problem in a different form.
  useEffect(() => {
    rowRefs.current[selectedIndex]?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments.length]);

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

  // --- BGM gutter geometry/drag ---
  const cumStart = cumulativeCutStarts(segments);
  const laneItems = assignBgmLanes(bgm, cumStart);
  const lanes = Math.max(1, laneCount(laneItems));
  const gutterWidth = bgmGutterCollapsed ? BGM_GUTTER_COLLAPSED_WIDTH : lanes * BGM_LANE_TOTAL_WIDTH;

  const rowIndexAtClientY = (clientY: number): number => {
    const rows = rowDivRefs.current;
    for (let i = 0; i < rows.length; i += 1) {
      const el = rows[i];
      if (!el) {
        continue;
      }
      if (clientY <= el.getBoundingClientRect().bottom) {
        return i;
      }
    }
    return Math.max(0, rows.length - 1);
  };

  const startTrackDrag =
    (bgmIndex: number, mode: "move" | "resize-start" | "resize-end") =>
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      const range = bgmCutRange(bgm[bgmIndex]!, cumStart);
      dragRef.current = {
        bgmIndex,
        mode,
        originStartCutIdx: range.startCutIdx,
        originEndCutIdx: range.endCutIdx,
        originRowIdx: rowIndexAtClientY(e.clientY),
      };
      onSelectBgm(bgmIndex);
    };

  const onTrackDragMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || e.buttons === 0) {
      return;
    }
    const rowIdx = rowIndexAtClientY(e.clientY);
    const lastIdx = segments.length - 1;
    let newStart = drag.originStartCutIdx;
    let newEnd = drag.originEndCutIdx;
    if (drag.mode === "move") {
      const delta = rowIdx - drag.originRowIdx;
      const length = drag.originEndCutIdx - drag.originStartCutIdx;
      newStart = Math.max(0, Math.min(lastIdx - length, drag.originStartCutIdx + delta));
      newEnd = newStart + length;
    } else if (drag.mode === "resize-start") {
      newStart = Math.max(0, Math.min(drag.originEndCutIdx, rowIdx));
    } else {
      newEnd = Math.min(lastIdx, Math.max(drag.originStartCutIdx, rowIdx));
    }
    setDragHighlight({ start: newStart, end: newEnd });
    onChangeBgmRange(drag.bgmIndex, newStart, newEnd);
  };

  const endTrackDrag = () => {
    dragRef.current = null;
    setDragHighlight(null);
  };

  return (
    <div className="compact-list-panel">
      <div className="bgm-gutter-header">
        <button
          type="button"
          className="plain-button bgm-gutter-toggle"
          onClick={() => setBgmGutterCollapsed((c) => !c)}
          title={bgmGutterCollapsed ? "Expand the background music gutter" : "Collapse the background music gutter"}
        >
          {bgmGutterCollapsed ? "▸" : "▾"} Background music
          {bgm.length > 0 ? <span className="bgm-gutter-count-badge">{bgm.length}</span> : null}
        </button>
        {!bgmGutterCollapsed ? (
          <button type="button" className="plain-button" onClick={onAddBgmTrack}>
            + Add track
          </button>
        ) : null}
      </div>

      <div className="compact-list-body">
        <div className="bgm-gutter" style={{ width: gutterWidth }}>
          {!bgmGutterCollapsed
            ? laneItems.map((item) => {
                const top = rowRects[item.startCutIdx]?.top ?? 0;
                const endRect = rowRects[item.endCutIdx];
                const bottom = endRect ? endRect.top + endRect.height : top;
                const cue = bgm[item.bgmIndex];
                return (
                  <div
                    key={item.bgmIndex}
                    className={`bgm-gutter-bar${item.bgmIndex === selectedBgmIndex ? " selected" : ""}`}
                    style={{
                      top,
                      height: Math.max(bottom - top, BGM_MIN_BAR_HEIGHT),
                      left: item.lane * BGM_LANE_TOTAL_WIDTH,
                      width: BGM_LANE_WIDTH,
                    }}
                    onPointerDown={startTrackDrag(item.bgmIndex, "move")}
                    onPointerMove={onTrackDragMove}
                    onPointerUp={endTrackDrag}
                    title={`${cue?.file ? baseName(cue.file) : "(no file)"} · cuts ${item.startCutIdx + 1}-${item.endCutIdx + 1}`}
                  >
                    <div
                      className="bgm-gutter-handle top"
                      onPointerDown={startTrackDrag(item.bgmIndex, "resize-start")}
                      onPointerMove={onTrackDragMove}
                      onPointerUp={endTrackDrag}
                    />
                    <span className="bgm-gutter-bar-label">{cue?.file ? baseName(cue.file) : "(no file)"}</span>
                    <div
                      className="bgm-gutter-handle bottom"
                      onPointerDown={startTrackDrag(item.bgmIndex, "resize-end")}
                      onPointerMove={onTrackDragMove}
                      onPointerUp={endTrackDrag}
                    />
                  </div>
                );
              })
            : null}
        </div>

        <div className="compact-list">
          {segments.map((seg, i) => {
            const tooltip = seg.subtitle.trim() !== "" ? `${seg.subtitle.trim()} (${seg.clip || "(no filename)"})` : seg.clip || "(no filename)";
            const sceneInfo = matchSceneInfo(seg, moments);
            const sceneText = sceneInfo.kind === "none" ? "No scene info" : sceneInfo.memo;
            const sceneTooltip =
              sceneInfo.kind === "moment"
                ? `${shotTypeLabel(sceneInfo.shotType)} · ${sceneInfo.memo}`
                : sceneText;
            const bgmHighlighted = dragHighlight != null && i >= dragHighlight.start && i <= dragHighlight.end;
            return (
              <div
                className={`compact-list-row${i === selectedIndex ? " selected" : ""}${bgmHighlighted ? " bgm-drag-highlight" : ""}`}
                key={i}
                ref={(el) => {
                  rowDivRefs.current[i] = el;
                }}
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
                    className="plain-field plain-field-textarea compact-list-subtitle-input"
                    value={seg.subtitle}
                    rows={1}
                    placeholder={seg.clip || "(no filename)"}
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
                      <span className="scene-shot-badge shot-monotonous">Timelapse cut</span>
                    ) : null}
                    {sceneText}
                  </span>
                </div>
                <span className="compact-list-time">
                  {seg.in.toFixed(1)}~{seg.out.toFixed(1)}s
                </span>
                {seg.styleOverride ? (
                  <span className="compact-list-style-badge" title="This cut has its own subtitle style">
                    Style
                  </span>
                ) : null}
                <span
                  className={`compact-list-subtitle-dot${seg.subtitle ? " filled" : ""}`}
                  title={seg.subtitle ? "Has subtitle" : "No subtitle"}
                />
                <div className="compact-list-actions">
                  <button
                    type="button"
                    className="plain-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onMove(i, -1);
                    }}
                    disabled={i === 0}
                    title="Move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="plain-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onMove(i, 1);
                    }}
                    disabled={i === segments.length - 1}
                    title="Move down"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="plain-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(i);
                    }}
                    disabled={segments.length <= 1}
                    title="Delete"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
          <button
            type="button"
            className="plain-button add-button"
            onClick={onAdd}
            title="Duplicates the selected cut right after it (useful for splitting a long clip into separate cuts)"
          >
            Duplicate selected cut
          </button>
        </div>
      </div>
    </div>
  );
}

function rectsEqual(a: Array<{ top: number; height: number }>, b: Array<{ top: number; height: number }>): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((r, i) => r.top === b[i]?.top && r.height === b[i]?.height);
}

/** BGM gutter lane geometry (px). */
const BGM_LANE_WIDTH = 22;
const BGM_LANE_GAP = 6;
const BGM_LANE_TOTAL_WIDTH = BGM_LANE_WIDTH + BGM_LANE_GAP;
const BGM_GUTTER_COLLAPSED_WIDTH = 10;
const BGM_MIN_BAR_HEIGHT = 20;
