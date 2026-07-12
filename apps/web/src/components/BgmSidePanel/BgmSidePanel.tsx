import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import * as stylex from "@stylexjs/stylex";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import type { BgmCue, Segment } from "@cuesheet/schema";
import { baseName } from "../../clipPaths.js";
import { bgmCutRange, cumulativeCutStarts } from "../../lib/bgmCutMapping.js";
import { assignBgmLanes, laneCount } from "../../lib/bgmLanes.js";
import { extendBgmDrag, resolveRowIndexFromBounds, startBgmDrag } from "../../lib/bgmTrackDrag.js";
import type { BgmDragMode, BgmDragState } from "../../lib/bgmTrackDrag.js";
import type { RowRect } from "../../lib/rowRect.js";
import { styles } from "./BgmSidePanel.styles.js";

interface Props {
  bgm: BgmCue[];
  segments: Segment[];
  selectedBgmIndex: number | null;
  onSelectBgm: (i: number) => void;
  /** Adds a new track defaulting to span just the currently selected cut. */
  onAddBgmTrack: () => void;
  /** A track's cut-index range changed (via drag move/resize or the settings panel's numeric fields) — converted to seconds by the caller. */
  onChangeBgmRange: (bgmIndex: number, startCutIdx: number, endCutIdx: number) => void;
  /** Each cut row's measured viewport rect (top/height px), reported by CompactSegmentList (a flex
   * sibling in EditStep, not a parent/child of this panel) — bars are positioned against these
   * without this panel needing any DOM access to the cut rows itself. */
  rowRects: RowRect[];
  /** While a bar drag is in progress, reports the cut-row range it currently spans so
   * CompactSegmentList can highlight those rows — null once the drag ends. */
  onDragHighlightChange: (range: { start: number; end: number } | null) => void;
  /** Whether the rail is collapsed to a narrow icon strip. Lifted up to EditStep (2026-07-12 Y-
   * misalignment fix) rather than kept as this component's own local state - toggling it must
   * re-render CompactSegmentList too (see this file's header comment), which only happens if the
   * state lives in their shared parent; a sibling's local state change never re-renders the other
   * sibling. */
  collapsed: boolean;
  setCollapsed: Dispatch<SetStateAction<boolean>>;
}

/**
 * Collapsible side panel for BGM editing (2) Edit step, docked beside the cut list rather than
 * stacked above it (2026-07-12 relocation — previously this whole section, including its header,
 * sat in-flow above CompactSegmentList's rows, claiming prime vertical hierarchy for a
 * once-per-episode concern). Collapsed by default to a narrow icon rail; expanding it reveals the
 * bar gutter beside the rail, both docked to the right of the cut list.
 *
 * Follows VS Code's Activity Bar + Side Bar convention (a persistent narrow icon rail holds the
 * toggle/actions; opening a section reveals a wider panel docked immediately beside the rail,
 * rather than a horizontal disclosure header above the content) — chosen over a horizontal
 * collapsible-header (this file's previous shape, still used for the Export step's Intro/Outro
 * section) specifically because a header row above the bar gutter would misalign every bar from
 * its cut row: bars anchor to `rowRects`, which CompactSegmentList measures with no header above
 * its own rows, so the gutter column here must also start with nothing above it — the rail sits
 * *beside* the gutter, never above it.
 *
 * `collapsed` is a controlled prop, not local state (2026-07-12 Y-misalignment fix - QA report:
 * add a track, collapse the rail, expand it again, and the bar's Y drifted off its cut row).
 * Root cause: `rowRects` is measured by CompactSegmentList (a flex sibling, not a parent/child of
 * this panel - see the prop's own comment) and only gets re-measured when CompactSegmentList
 * itself re-renders. `gutterTop` below is measured by this component on every one of ITS OWN
 * renders. As long as `collapsed` lived here as this component's own `useState`, toggling it only
 * ever re-rendered THIS component - CompactSegmentList never re-rendered in response, so its
 * `rowRects` snapshot could go stale relative to this panel's freshly-remeasured `gutterTop` the
 * moment anything shifted the cut rows without also changing one of CompactSegmentList's own
 * props (this repo's current CSS happens to keep the cut list a fixed width immune to this panel's
 * own width changes, which is why the drift wasn't pixel-visible in every layout - but that's a
 * CSS coincidence, not a guarantee). Lifting `collapsed` to EditStep (the actual shared parent -
 * already how `rowRects`/`bgmDragHighlight` cross this same boundary) means every collapse/expand
 * re-renders EditStep, which re-renders CompactSegmentList too, so it re-measures and reports
 * current rowRects in lockstep with this panel's own gutterTop remeasurement, every time.
 */
export function BgmSidePanel({
  bgm,
  segments,
  selectedBgmIndex,
  onSelectBgm,
  onAddBgmTrack,
  onChangeBgmRange,
  rowRects,
  onDragHighlightChange,
  collapsed,
  setCollapsed,
}: Props) {
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const [gutterTop, setGutterTop] = useState(0);
  const dragRef = useRef<BgmDragState | null>(null);

  // Re-measures the gutter column's own on-screen top after each render (dependency-free, guarded
  // to avoid looping forever — same pattern CompactSegmentList's row measurement uses) — bars are
  // positioned relative to this, not to the rail or the panel root, since only the gutter column
  // is guaranteed to start flush with row 0 (see this file's header comment).
  useLayoutEffect(() => {
    const top = gutterRef.current?.getBoundingClientRect().top ?? 0;
    setGutterTop((prev) => (prev === top ? prev : top));
  });

  const cumStart = cumulativeCutStarts(segments);
  const laneItems = assignBgmLanes(bgm, cumStart);
  const lanes = Math.max(1, laneCount(laneItems));
  const gutterWidth = lanes * BGM_LANE_TOTAL_WIDTH;

  const rowIndexAtClientY = (clientY: number): number => {
    const bottoms = rowRects.map((r) => r.top + r.height);
    return resolveRowIndexFromBounds(bottoms, clientY);
  };

  // Drag reliability (ported from the old CompactSegmentList-owned gutter, 2026-07-09 diagnosed
  // fix): listens on `window` for the duration of the drag rather than the bar/handle element
  // itself, so a fast or slightly-off-target drag doesn't lose pointer capture.
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
    onDragHighlightChange({ start, end });
    onChangeBgmRange(drag.bgmIndex, start, end);
  };

  const endTrackDrag = () => {
    dragRef.current = null;
    onDragHighlightChange(null);
    if (trackDragMoveHandler.current) {
      window.removeEventListener("pointermove", trackDragMoveHandler.current);
      trackDragMoveHandler.current = null;
    }
    if (trackDragUpHandler.current) {
      window.removeEventListener("pointerup", trackDragUpHandler.current);
      trackDragUpHandler.current = null;
    }
  };

  // Belt-and-suspenders: if this panel unmounts mid-drag (e.g. switching steps), drop any
  // still-registered window listeners rather than leaking them.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => endTrackDrag, []);

  const startTrackDrag =
    (bgmIndex: number, mode: BgmDragMode) =>
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      // Also suppresses the browser's native drag-over-a-text-field focus behavior (see
      // CompactSegmentList's cut-row textarea) that could otherwise steal focus mid-drag.
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

  return (
    <div {...stylex.props(styles.root)} data-testid="bgm-side-panel">
      <div {...stylex.props(styles.rail)}>
        <IconButton
          icon={<Icon icon={collapsed ? "chevronLeft" : "chevronRight"} size="xsm" color="tertiary" />}
          label={collapsed ? "Expand background music panel" : "Collapse background music panel"}
          tooltip={collapsed ? "Expand background music panel" : "Collapse background music panel"}
          variant="ghost"
          size="sm"
          onClick={() => setCollapsed((c) => !c)}
          data-testid="bgm-panel-toggle"
        />
        {bgm.length > 0 ? <span {...stylex.props(styles.railCountBadge)}>{bgm.length}</span> : null}
        {/* Label leads (section identity); the add-track "+" sits at the rail's bottom via the
            label's flexGrow, matching editors' "add at the end of the list" convention rather than
            prefixing the section name with a "+" (2026-07-12 user feedback). */}
        <span {...stylex.props(styles.railLabel)}>Background music</span>
        {!collapsed ? (
          <IconButton
            icon={<span aria-hidden="true">+</span>}
            label="Add background music track"
            tooltip="Add background music track"
            variant="ghost"
            size="sm"
            onClick={onAddBgmTrack}
            data-testid="bgm-add-track"
          />
        ) : null}
      </div>

      {!collapsed ? (
        <div
          {...stylex.props(styles.gutter)}
          style={{ width: gutterWidth }}
          ref={gutterRef}
          data-testid="bgm-gutter"
        >
          {laneItems.map((item) => {
            const top = (rowRects[item.startCutIdx]?.top ?? 0) - gutterTop;
            const endRect = rowRects[item.endCutIdx];
            const bottom = endRect ? endRect.top + endRect.height - gutterTop : top;
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
          })}
        </div>
      ) : null}
    </div>
  );
}

/** BGM gutter lane geometry (px) — unchanged from the previous CompactSegmentList-owned gutter. */
const BGM_LANE_WIDTH = 26;
const BGM_LANE_GAP = 6;
const BGM_LANE_TOTAL_WIDTH = BGM_LANE_WIDTH + BGM_LANE_GAP;
const BGM_MIN_BAR_HEIGHT = 26;
