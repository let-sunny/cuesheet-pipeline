import { useEffect, useLayoutEffect, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import * as stylex from "@stylexjs/stylex";
import { Badge } from "@astryxdesign/core/Badge";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import type { Segment } from "@cuesheet/schema";
import type { ClipMoments } from "../../api.js";
import { useDomainConfig } from "../../hooks/useDomainConfig.js";
import { categoryBadgeVariant } from "../../lib/domainConfig.js";
import { shotTypeBadgeVariant } from "../../lib/momentCards.js";
import type { RowRect } from "../../lib/rowRect.js";
import { matchSceneInfo, shotTypeLabel } from "../../lib/sceneInfo.js";
import { styles } from "./CompactSegmentList.styles.js";

interface Props {
  segments: Segment[];
  selectedIndex: number;
  /** Rough-cut vision-read data — used to show what scene each cut is on the 2nd line. */
  moments: ClipMoments[];
  onSelect: (i: number) => void;
  onChangeSubtitle: (i: number, subtitle: string) => void;
  onRemove: (i: number) => void;
  onMove: (i: number, direction: -1 | 1) => void;
  /** While a BGM bar is being dragged in the side panel, the cut-row range it currently spans —
   * highlights those rows here so the drag reads against the list it's editing. Null otherwise. */
  bgmDragHighlight: { start: number; end: number } | null;
  /** Reports each row's measured viewport rect (top/height px) after every render — BgmSidePanel
   * (a flex sibling in EditStep, not owned by this component) uses these to position its bars
   * against the cut rows without needing any DOM access to them itself. */
  onRowRectsChange: (rects: RowRect[]) => void;
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
 * BGM editing lives in the side-by-side `BgmSidePanel` component now (2026-07-12 relocation —
 * previously this component also owned a collapsible BGM gutter+header stacked above these rows,
 * which put a once-per-episode concern in the primary vertical hierarchy). This component only
 * reports each row's measured rect upward (`onRowRectsChange`) so that panel can still anchor its
 * bars to cut boundaries without needing its own DOM access to the rows — see measureRows' comment
 * for why raw `getBoundingClientRect` (not `offsetTop`) is what makes that safe across components.
 */
export function CompactSegmentList({
  segments,
  selectedIndex,
  moments,
  onSelect,
  onChangeSubtitle,
  onRemove,
  onMove,
  bgmDragHighlight,
  onRowRectsChange,
}: Props) {
  const { config } = useDomainConfig();
  const rowRefs = useRef<Array<HTMLTextAreaElement | null>>([]);
  const rowDivRefs = useRef<Array<HTMLDivElement | null>>([]);
  const prevRowRectsRef = useRef<RowRect[]>([]);

  useEffect(() => {
    rowRefs.current = rowRefs.current.slice(0, segments.length);
    rowDivRefs.current = rowDivRefs.current.slice(0, segments.length);
  }, [segments.length]);

  // Reports each row's own on-screen (viewport-relative) top/height after each render, via
  // getBoundingClientRect rather than raw `el.offsetTop` — `offsetTop` is relative to an element's
  // nearest positioned ancestor, which can differ between this component's rows and wherever
  // BgmSidePanel's gutter ends up positioned, so a raw offsetTop value here could silently carry
  // an unrelated ancestor offset into the bar geometry BgmSidePanel derives from it (this is the
  // exact bug found 2026-07-10 when both lived in one component and shared the same containing
  // block by coincidence). A `getBoundingClientRect` value is always viewport-absolute, so
  // whichever component consumes it can freely subtract its own reference point.
  const measureRows = () => {
    const next = rowDivRefs.current.map((el) => {
      if (!el) {
        return { top: 0, height: 0 };
      }
      const rect = el.getBoundingClientRect();
      return { top: rect.top, height: rect.height };
    });
    // This effect has no dependency array (it needs to re-measure after every render, since a row
    // can grow/shrink from a subtitle edit without segments.length changing) - guarding on an
    // actual value change before calling back up is what keeps that from looping forever.
    if (!rectsEqual(prevRowRectsRef.current, next)) {
      prevRowRectsRef.current = next;
      onRowRectsChange(next);
    }
  };

  // Re-measures every row's on-screen top/height after each render — BgmSidePanel's bars are
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll the selected row into view whenever the cut count changes (duplicate/delete) - the
  // duplicate is inserted right after the original (in the middle of a possibly-long list), so
  // without this the newly created cut could land off-screen ("did it even duplicate?").
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

  return (
    <div {...stylex.props(styles.list)}>
      {segments.map((seg, i) => {
        const tooltip = seg.subtitle.trim() !== "" ? `${seg.subtitle.trim()} (${seg.clip || "(no filename)"})` : seg.clip || "(no filename)";
        const sceneInfo = matchSceneInfo(seg, moments);
        const sceneText = sceneInfo.kind === "none" ? "No scene info" : sceneInfo.memo;
        const sceneTooltip =
          sceneInfo.kind === "moment"
            ? `${shotTypeLabel(sceneInfo.shotType, config)} · ${sceneInfo.memo}`
            : sceneText;
        const bgmHighlighted =
          bgmDragHighlight != null && i >= bgmDragHighlight.start && i <= bgmDragHighlight.end;
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
                  line-height/overflow-y rule on `subtitleInput` in CompactSegmentList.styles.ts. */}
              <textarea
                ref={(el) => {
                  rowRefs.current[i] = el;
                }}
                {...stylex.props(styles.subtitleInput)}
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
                  <Badge
                    variant={shotTypeBadgeVariant(sceneInfo.shotType, config)}
                    label={shotTypeLabel(sceneInfo.shotType, config)}
                    xstyle={styles.sceneBadge}
                  />
                ) : null}
                {sceneInfo.kind === "monotonous" ? (
                  <Badge
                    variant={categoryBadgeVariant(config, config.rangeCategory)}
                    label="Timelapse cut"
                    xstyle={styles.sceneBadge}
                  />
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
                {/* Only flag the ACTIONABLE state - a cut with no subtitle yet (2026-07-11): the
                    old always-present filled dot marked every subtitled cut too, so a
                    fully-subtitled list was a wall of identical dots that read as noise (the
                    user asked "what is this dot?"). Now a subtitled cut shows nothing; only a
                    missing-subtitle cut shows a small amber "todo" dot. */}
                {!seg.subtitle ? (
                  <span {...stylex.props(styles.subtitleDot)} title="No subtitle yet" />
                ) : null}
                {/* Row actions (2026-07-11 stock-component migration) - stock Astryx
                    IconButtons replace the old raw `.plain-button` triplet. */}
                <div {...stylex.props(styles.actions)}>
                  <IconButton
                    icon={<Icon icon="arrowUp" size="sm" />}
                    label="Move up"
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onMove(i, -1);
                    }}
                    isDisabled={i === 0}
                    data-testid={`cut-row-move-up-${i}`}
                  />
                  <IconButton
                    icon={<Icon icon="arrowDown" size="sm" />}
                    label="Move down"
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onMove(i, 1);
                    }}
                    isDisabled={i === segments.length - 1}
                    data-testid={`cut-row-move-down-${i}`}
                  />
                  <IconButton
                    icon={<Icon icon="close" size="sm" />}
                    label="Delete"
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(i);
                    }}
                    isDisabled={segments.length <= 1}
                    data-testid={`cut-row-delete-${i}`}
                  />
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function rectsEqual(a: RowRect[], b: RowRect[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((r, i) => r.top === b[i]?.top && r.height === b[i]?.height);
}
