import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import * as stylex from "@stylexjs/stylex";
import type { BgmCue, Segment } from "@cuesheet/schema";
import type { ClipMoments } from "../../api.js";
import { baseName } from "../../clipPaths.js";
import { bgmCutRange, cumulativeCutStarts } from "../../lib/bgmCutMapping.js";
import { assignBgmLanes, laneCount } from "../../lib/bgmLanes.js";
import { extendBgmDrag, resolveRowIndexFromBounds, startBgmDrag } from "../../lib/bgmTrackDrag.js";
import type { BgmDragMode, BgmDragState } from "../../lib/bgmTrackDrag.js";
import { matchSceneInfo, shotTypeLabel } from "../../lib/sceneInfo.js";
import { SegmentThumb } from "../SegmentThumb/index.js";
import { styles } from "./CompactSegmentList.styles.js";

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
  const dragRef = useRef<BgmDragState | null>(null);

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
      if (e.key !== "Tab") {
        return;
      }
      const target = i + (e.shiftKey ? -1 : 1);
      if (target < 0 || target >= segments.length) {
        // At the first/last row, let native Tab traversal continue past the list (e.g. into the
        // right-hand cut settings panel) instead of trapping focus inside it.
        return;
      }
      e.preventDefault();
      focusRow(target);
    };

  // --- BGM gutter geometry/drag ---
  const cumStart = cumulativeCutStarts(segments);
  const laneItems = assignBgmLanes(bgm, cumStart);
  const lanes = Math.max(1, laneCount(laneItems));
  const gutterWidth = bgmGutterCollapsed ? BGM_GUTTER_COLLAPSED_WIDTH : lanes * BGM_LANE_TOTAL_WIDTH;

  const rowIndexAtClientY = (clientY: number): number => {
    const bottoms = rowDivRefs.current.map((el) => el?.getBoundingClientRect().bottom ?? null);
    return resolveRowIndexFromBounds(bottoms, clientY);
  };

  // Drag reliability (2026-07-09 diagnosed fix): previously each bar/handle only listened to its
  // own onPointerMove/onPointerUp (plus setPointerCapture on that same small element) - this made
  // dragging fragile both for real users (a fast or slightly-off-target drag could leave the
  // pointer over a sibling row instead of the ~22px-wide bar) and for automated pointer drags
  // (synthetic move events dispatched over the page don't reliably keep landing on the captured
  // element either). Listening on `window` for the duration of the drag instead means every
  // pointermove/pointerup is heard regardless of what's directly under the pointer - the standard,
  // robust pattern for drag interactions - so grabbing/dragging no longer depends on staying
  // pixel-precise over a thin bar.
  const trackDragMoveHandler = useRef<((e: PointerEvent) => void) | null>(null);
  const trackDragUpHandler = useRef<(() => void) | null>(null);

  const applyTrackDrag = (clientY: number) => {
    const drag = dragRef.current;
    if (!drag) {
      return;
    }
    const rowIdx = rowIndexAtClientY(clientY);
    const lastIdx = segments.length - 1;
    const { start, end } = extendBgmDrag(drag, rowIdx, lastIdx);
    setDragHighlight({ start, end });
    onChangeBgmRange(drag.bgmIndex, start, end);
  };

  const endTrackDrag = () => {
    dragRef.current = null;
    setDragHighlight(null);
    if (trackDragMoveHandler.current) {
      window.removeEventListener("pointermove", trackDragMoveHandler.current);
      trackDragMoveHandler.current = null;
    }
    if (trackDragUpHandler.current) {
      window.removeEventListener("pointerup", trackDragUpHandler.current);
      trackDragUpHandler.current = null;
    }
  };

  // Belt-and-suspenders: if this component unmounts mid-drag (e.g. switching steps), drop any
  // still-registered window listeners rather than leaking them.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => endTrackDrag, []);

  const startTrackDrag =
    (bgmIndex: number, mode: BgmDragMode) =>
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      endTrackDrag(); // clears any stale listeners left over from an interrupted previous drag

      const range = bgmCutRange(bgm[bgmIndex]!, cumStart);
      dragRef.current = startBgmDrag(bgmIndex, mode, range, rowIndexAtClientY(e.clientY));
      onSelectBgm(bgmIndex);

      const onMove = (ev: PointerEvent) => applyTrackDrag(ev.clientY);
      const onUp = () => endTrackDrag();
      trackDragMoveHandler.current = onMove;
      trackDragUpHandler.current = onUp;
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    };

  const actionsWrapperProps = stylex.props(styles.actions);
  const addButtonProps = stylex.props(styles.addButton);

  return (
    <div {...stylex.props(styles.panel)}>
      <div {...stylex.props(styles.gutterHeader)}>
        <button
          type="button"
          className="plain-button bgm-gutter-toggle"
          onClick={() => setBgmGutterCollapsed((c) => !c)}
          title={bgmGutterCollapsed ? "Expand the background music gutter" : "Collapse the background music gutter"}
          data-testid="bgm-gutter-toggle"
        >
          {bgmGutterCollapsed ? "▸" : "▾"} Background music
          {bgm.length > 0 ? <span {...stylex.props(styles.gutterCountBadge)}>{bgm.length}</span> : null}
        </button>
        {!bgmGutterCollapsed ? (
          <button type="button" className="plain-button" onClick={onAddBgmTrack} data-testid="bgm-add-track">
            + Add track
          </button>
        ) : null}
      </div>

      <div {...stylex.props(styles.listBody)}>
        <div {...stylex.props(styles.gutter)} style={{ width: gutterWidth }}>
          {!bgmGutterCollapsed
            ? laneItems.map((item) => {
                const top = rowRects[item.startCutIdx]?.top ?? 0;
                const endRect = rowRects[item.endCutIdx];
                const bottom = endRect ? endRect.top + endRect.height : top;
                const cue = bgm[item.bgmIndex];
                return (
                  <div
                    key={item.bgmIndex}
                    {...stylex.props(styles.gutterBar, item.bgmIndex === selectedBgmIndex && styles.gutterBarSelected)}
                    style={{
                      top,
                      height: Math.max(bottom - top, BGM_MIN_BAR_HEIGHT),
                      left: item.lane * BGM_LANE_TOTAL_WIDTH,
                      width: BGM_LANE_WIDTH,
                    }}
                    onPointerDown={startTrackDrag(item.bgmIndex, "move")}
                    title={`${cue?.file ? baseName(cue.file) : "(no file)"} · cuts ${item.startCutIdx + 1}-${item.endCutIdx + 1}`}
                    data-testid={`bgm-bar-${item.bgmIndex}`}
                  >
                    <div
                      {...stylex.props(styles.gutterHandle)}
                      onPointerDown={startTrackDrag(item.bgmIndex, "resize-start")}
                      data-testid={`bgm-bar-${item.bgmIndex}-handle-start`}
                    />
                    <span {...stylex.props(styles.gutterBarLabel)}>{cue?.file ? baseName(cue.file) : "(no file)"}</span>
                    <div
                      {...stylex.props(styles.gutterHandle)}
                      onPointerDown={startTrackDrag(item.bgmIndex, "resize-end")}
                      data-testid={`bgm-bar-${item.bgmIndex}-handle-end`}
                    />
                  </div>
                );
              })
            : null}
        </div>

        <div {...stylex.props(styles.list)}>
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
                {...stylex.props(
                  styles.row,
                  i === selectedIndex && styles.rowSelected,
                  bgmHighlighted && styles.rowBgmDragHighlight,
                )}
                key={i}
                ref={(el) => {
                  rowDivRefs.current[i] = el;
                }}
                onClick={() => onSelect(i)}
                data-testid={`cut-row-${i}`}
              >
                <span {...stylex.props(styles.index)}>{i + 1}</span>
                <SegmentThumb clip={seg.clip} t={seg.in + 0.3} className={stylex.props(styles.thumb).className} />
                <div {...stylex.props(styles.text)}>
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
                    data-testid={`cut-row-subtitle-${i}`}
                  />
                  <span
                    {...stylex.props(styles.scene, sceneInfo.kind === "none" && styles.sceneEmpty)}
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
                  {/* Second line (13-inch density pass, 2026-07-10) - time/style badge/subtitle
                      dot/reorder+delete used to sit beside `text` as row-level siblings, which only
                      worked at the list column's old, wider 480px basis. Moved inside `text`'s own
                      column onto their own line so the row stays usable at the narrower 300px
                      column (see CompactSegmentList.styles.ts's `list`/`metaRow` comments). */}
                  <div {...stylex.props(styles.metaRow)}>
                    <span {...stylex.props(styles.time)}>
                      {seg.in.toFixed(1)}~{seg.out.toFixed(1)}s
                    </span>
                    {seg.styleOverride ? (
                      <span {...stylex.props(styles.styleBadge)} title="This cut has its own subtitle style">
                        Style
                      </span>
                    ) : null}
                    <span
                      {...stylex.props(styles.subtitleDot, !!seg.subtitle && styles.subtitleDotFilled)}
                      title={seg.subtitle ? "Has subtitle" : "No subtitle"}
                    />
                    <div
                      className={`compact-list-actions ${actionsWrapperProps.className ?? ""}`}
                      style={actionsWrapperProps.style}
                    >
                      <button
                        type="button"
                        className="plain-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onMove(i, -1);
                        }}
                        disabled={i === 0}
                        title="Move up"
                        data-testid={`cut-row-move-up-${i}`}
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
                        data-testid={`cut-row-move-down-${i}`}
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
                        data-testid={`cut-row-delete-${i}`}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          <button
            type="button"
            className={`plain-button ${addButtonProps.className ?? ""}`}
            style={addButtonProps.style}
            onClick={onAdd}
            title="Duplicates the selected cut right after it (useful for splitting a long clip into separate cuts)"
            data-testid="cut-list-add"
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

/** BGM gutter lane geometry (px). Widened slightly (2026-07-09 diagnosed drag-reliability fix,
 * alongside the window-level pointer listeners above) - a 22px-wide bar with 6px-tall resize
 * handles left very little room to grab either the move area or the handles, which was reported
 * as "hard to grab" even before accounting for the pointer-tracking bug itself. */
const BGM_LANE_WIDTH = 26;
const BGM_LANE_GAP = 6;
const BGM_LANE_TOTAL_WIDTH = BGM_LANE_WIDTH + BGM_LANE_GAP;
const BGM_GUTTER_COLLAPSED_WIDTH = 10;
const BGM_MIN_BAR_HEIGHT = 26;
