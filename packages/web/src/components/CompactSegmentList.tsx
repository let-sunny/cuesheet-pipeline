import { useEffect, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { Segment } from "@cuesheet/schema";
import type { ClipMoments } from "../api.js";
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
}

/**
 * Left-side cut list for the Edit step (②) — combined touch-up/bulk-write mode. Alongside
 * the number/thumbnail, a textarea for editing the subtitle right there is always visible
 * (clicking/focusing a row selects that cut, and the video/fields on the right follow it),
 * and Tab/Shift+Tab moves to the next/previous cut's subtitle input, supporting a bulk-writing
 * flow. The 2nd line shows the rough-cut vision-read scene description (memo).
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
}: Props) {
  const rowRefs = useRef<Array<HTMLTextAreaElement | null>>([]);

  useEffect(() => {
    rowRefs.current = rowRefs.current.slice(0, segments.length);
  }, [segments.length]);

  // Grow the textarea height to fit the number of lines so the full subtitle text is visible
  // without being cut off (the fixed rows=1 is just the starting minimum height; overflow
  // grows the height instead of scrolling).
  const autoResize = (el: HTMLTextAreaElement | null) => {
    if (!el) {
      return;
    }
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  // On initial load (including existing subtitles that already span multiple lines), fit every row's height to its content.
  useEffect(() => {
    rowRefs.current.forEach((el) => autoResize(el));
  }, [segments]);

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

  return (
    <div className="compact-list">
      {segments.map((seg, i) => {
        const tooltip = seg.subtitle.trim() !== "" ? `${seg.subtitle.trim()} (${seg.clip || "(no filename)"})` : seg.clip || "(no filename)";
        const sceneInfo = matchSceneInfo(seg, moments);
        const sceneText = sceneInfo.kind === "none" ? "No scene info" : sceneInfo.memo;
        const sceneTooltip =
          sceneInfo.kind === "moment"
            ? `${shotTypeLabel(sceneInfo.shotType)} · ${sceneInfo.memo}`
            : sceneText;
        return (
          <div
            className={`compact-list-row${i === selectedIndex ? " selected" : ""}`}
            key={i}
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
  );
}
