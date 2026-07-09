import * as stylex from "@stylexjs/stylex";

/**
 * Component anatomy migration (docs/styling-migration.md, StyleX migration batch 4) — ported 1:1
 * from the old `.segment-thumb`/`.segment-thumb img` classes in styles.css. Consumers
 * (CompactSegmentList, MiniTimelineStrip) still pass their own sizing via the `className` prop -
 * see SegmentThumb.tsx's plain-string concatenation for why that stays a raw className instead of
 * composing stylex style objects (the consumer classNames aren't always stylex style objects this
 * component could accept - MiniTimelineStrip isn't migrated yet and passes a plain CSS class).
 */
export const styles = stylex.create({
  segmentThumb: {
    // Background is intentionally fixed dark regardless of theme - a video frame thumbnail canvas
    // (spec item 3).
    backgroundColor: "var(--stage-bg)",
  },
  img: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
});
