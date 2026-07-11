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
 * the row number, a textarea for editing the subtitle right there is always visible
 * (clicking/focusing a row selects that cut, and the video/fields on the right follow it),
 * and Tab/Shift+Tab moves to the next/previous cut's subtitle input, supporting a bulk-writing
 * flow. The 2nd line shows the rough-cut vision-read scene description (memo). No thumbnail here
 * (2026-07-11 QA fix) — the subtitle text + scene description already identify the cut, and
 * clicking a row shows it in the right-side VideoPreview, so a thumbnail was redundant width
 * spent on a compact list whose whole point is fitting beside the video column (the Scenes tab's
 * MomentPalette cards are where thumbnails still earn their keep, since that screen has no
 * right-side preview to fall back on).
 *
 * A collapsible BGM gutter sits to the left of the list (screen-spec section 3) — each bgm cue
 * renders as a vertical bar spanning the cut rows it covers, anchored to cut boundaries (not
 * arbitrary pixels), so the user places music changes while reading cut content instead of
 * against a blank timeline. Bar geometry is derived directly from the actual rendered row
 * elements' bounding rects (measured relative to the gutter container itself, not raw
 * `offsetTop`/`offsetHeight` — see measureRows' comment for why that distinction matters), not
 * from a separate proportional time axis, so it's pixel-exact with the cut strip by construction
 * rather than by coincidence.
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
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const [rowRects, setRowRects] = useState<Array<{ top: number; height: number }>>([]);
  const [bgmGutterCollapsed, setBgmGutterCollapsed] = useState(false);
  const [dragHighlight, setDragHighlight] = useState<{ start: number; end: number } | null>(null);
  const dragRef = useRef<BgmDragState | null>(null);

  useEffect(() => {
    rowRefs.current = rowRefs.current.slice(0, segments.length);
    rowDivRefs.current = rowDivRefs.current.slice(0, segments.length);
  }, [segments.length]);

  // Row tops are measured relative to the gutter container's own box, NOT raw `el.offsetTop`
  // (bug found 2026-07-10, QA report: BGM bars rendered a constant amount below their target row,
  // worsening for nothing - it was a fixed offset for every bar). `offsetTop` is relative to an
  // element's nearest positioned ancestor, and the bars' CSS `top` is interpreted relative to
  // `gutter`'s own box (its actual containing block, since `gutter` has `position: relative`) -
  // but the row divs live in a completely different sibling (`.list`), so their offsetTop is
  // relative to whatever shared ancestor happens to be positioned (often just `<body>`, if
  // nothing between here and the page root sets `position`), not to `gutter`. Using that raw value
  // as a bar's `top` silently added gutter's own offset from that ancestor on top of every bar's
  // position. Measuring both rects with getBoundingClientRect and subtracting sidesteps the
  // offsetParent chain entirely - the delta between two simultaneous viewport-relative
  // measurements is correct regardless of what (if anything) is positioned above them.
  const measureRows = () => {
    const gutterTop = gutterRef.current?.getBoundingClientRect().top ?? 0;
    const next = rowDivRefs.current.map((el) => {
      if (!el) {
        return { top: 0, height: 0 };
      }
      const rect = el.getBoundingClientRect();
      return { top: rect.top - gutterTop, height: rect.height };
    });
    // This effect has no dependency array (it needs to re-measure after every render, since a row
    // can grow/shrink from a subtitle edit without segments.length changing) - guarding on an
    // actual value change is what keeps that from looping forever, since setting a new array
    // reference unconditionally would re-render, which would re-run this same effect, forever.
    setRowRects((prev) => (rectsEqual(prev, next) ? prev : next));
  };

  // Re-measures every row's on-screen top/height after each render — the BGM gutter's bars are
  // positioned from this. Kept dependency-free (re-measures on every render, not just row-count
  // changes) defensively: row height is uniform today (the subtitle textarea is now a fixed
  // 2-line height and the scene-info line is single-line/ellipsized, both non-wrapping), but this
  // is what keeps bars correct without re-auditing this effect the next time row content grows a
  // wrapping element.
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
  // Collapsed OR no tracks yet both fall back to the thin collapsed width (2026-07-11 QA fix) -
  // with 0 tracks, `lanes` still reserved a full lane's width (`Math.max(1, ...)`, needed so a
  // single bar has somewhere to sit once one exists) for an empty strip with nothing to show.
  const gutterWidth =
    bgmGutterCollapsed || bgm.length === 0 ? BGM_GUTTER_COLLAPSED_WIDTH : lanes * BGM_LANE_TOTAL_WIDTH;

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
      // Also suppresses the browser's default drag behavior (2026-07-11 QA fix) - without this,
      // dragging the pointer (button held) across a cut row's subtitle textarea mid-drag can
      // trigger the browser's native text-field focus-on-drag-over behavior, silently stealing
      // focus onto that textarea's cut (which calls onSelect -> setSelectedBgmIndex(null),
      // dropping back to Cut settings mid-drag). Diagnosed via a real E2E drag-reliability
      // regression exposed once CompactSegmentList's rows got shorter (thumbnail removed).
      e.preventDefault();
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
        <div
          {...stylex.props(styles.gutter)}
          style={{ width: gutterWidth }}
          ref={gutterRef}
          data-testid="bgm-gutter"
        >
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
                <div {...stylex.props(styles.text)}>
                  {/* Fixed 2-line height with internal scroll (QA finding 2026-07-10) - this row
                      is a compact quick-edit surface, not the primary place to write long
                      subtitles (that's the right panel's Subtitle group), so it deliberately does
                      NOT grow to fit arbitrarily long pasted text anymore; see the height/
                      line-height/overflow-y rule on .compact-list-subtitle-input in styles.css. */}
                  <textarea
                    ref={(el) => {
                      rowRefs.current[i] = el;
                    }}
                    className="plain-field plain-field-textarea compact-list-subtitle-input"
                    value={seg.subtitle}
                    rows={2}
                    placeholder={seg.clip || "(no filename)"}
                    title={tooltip}
                    onFocus={() => onSelect(i)}
                    onChange={(e) => onChangeSubtitle(i, e.target.value)}
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
