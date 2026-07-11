import * as stylex from "@stylexjs/stylex";

/**
 * Component anatomy migration (docs/styling-migration.md, StyleX migration batch 3) — rules
 * ported 1:1 from the old `.compact-list-*`/`.bgm-gutter-*` classes in styles.css (all owned
 * solely by this component).
 *
 * NOT migrated here (stay plain CSS, see styles.css):
 * - `.scene-shot-badge` (+ `.shot-*` variants) — shared with VideoPreview.tsx (both render the
 *   same scene-info badge), so it's a shared token, not owned solely by this component.
 * - `.compact-list-subtitle-input` (+ `:focus`) — overrides `.plain-field`/`.plain-field-textarea`
 *   (border/background/border-radius/padding). Both are single-class selectors tied on
 *   specificity, and this app's StyleX output is injected *before* styles.css, so a same-
 *   specificity StyleX atomic class would lose that cascade tie to the later-in-source
 *   `.plain-field`/`.plain-field-textarea` rules for every overlapping property — styles.css's own
 *   comment on `.plain-field-textarea` documents this exact selector as the reason it's kept a
 *   bare single-class rule instead of `textarea.plain-field` in the first place. Same root cause as
 *   HeaderBar's theme toggle / BgmSettingsPanel's bgm-file-play/name.
 * - `.bgm-gutter-toggle` — this button also carries the `.plain-button` marker class and overrides
 *   several of its properties (background/border/padding, plus font-size/font-weight which
 *   `.plain-button`'s `font: inherit` shorthand implicitly sets too) — same injection-order tie
 *   loss as above, so it stays a same-specificity override that only wins via source order today.
 * - `.compact-list-actions button` — a descendant selector (1 class + tag, so higher specificity
 *   than `.plain-button` regardless of source order) that sets the row action buttons' padding;
 *   StyleX can't express that specificity edge, so it stays. The wrapper's own layout
 *   (`.compact-list-actions`'s flex/gap, below as `actions`) still moves to StyleX — the div keeps
 *   both the plain `compact-list-actions` className *and* the StyleX class so the descendant
 *   selector keeps matching (same hybrid pattern as BgmSettingsPanel's `bgm-file-row`).
 *
 * `background`/`border` shorthands are written out as their longhand equivalents
 * (`backgroundColor`, `borderWidth`+`borderStyle`+`borderColor`) — see HeaderBar.styles.ts's
 * comment for why (StyleX silently drops the shorthand form). `flex` (the 3-value shorthand) is
 * likewise avoided in favor of `flexGrow`/`flexShrink`/`flexBasis` on principle, matching that same
 * caution, even though it hasn't specifically been measured dropped.
 */
export const styles = stylex.create({
  panel: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "auto",
    minWidth: 0,
  },
  // Section-header separation (2026-07-11 QA fix, design-principles.md #4) - a thin bottom
  // border + a little breathing room below is what keeps this compact header reading as its own
  // section instead of blending into the first cut row right underneath it (the user's actual
  // complaint was misreading the header's "+ Add track" as a cut-list action, not just its icon).
  gutterHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--border-soft)",
  },
  gutterCountBadge: {
    padding: "0 5px",
    borderRadius: 8,
    fontSize: 11,
    fontWeight: 600,
    backgroundColor: "var(--bgm-cue-bg)",
    color: "var(--text-primary)",
  },
  listBody: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    minWidth: 0,
  },
  gutter: {
    position: "relative",
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "auto",
    alignSelf: "stretch",
    touchAction: "none",
  },
  gutterBar: {
    position: "absolute",
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    overflow: "hidden",
    backgroundColor: "var(--bgm-cue-bg)",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--bgm-cue-border)",
    borderRadius: 4,
    cursor: "grab",
  },
  gutterBarSelected: {
    borderColor: "var(--accent)",
    boxShadow: "0 0 0 1px var(--accent)",
  },
  // 6px -> 9px (2026-07-09 diagnosed drag-reliability fix) - a wider grab target for the
  // resize-start/resize-end handles, alongside the window-level pointer listeners in
  // CompactSegmentList.tsx that make the drag itself track reliably once grabbed.
  gutterHandle: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "auto",
    height: 9,
    cursor: "ns-resize",
    backgroundColor: "var(--bgm-cue-border)",
  },
  gutterBarLabel: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "auto",
    minHeight: 0,
    overflow: "hidden",
    writingMode: "vertical-rl",
    textOrientation: "mixed",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: 11,
    padding: "4px 2px",
    pointerEvents: "none",
  },
  // 480 -> 300 (13-inch density pass, 2026-07-10): freed width is what lets the video + cut
  // settings columns sit beside this list instead of wrapping below the video (see
  // EditStep.styles.ts's trimVideoCol/trimFieldsCol and docs/screen-spec.md's baseline-viewport
  // section). The row's time/badge/actions moved off the main row onto their own `metaRow` line
  // (below) to compensate - at the old single-row layout, this narrower width would have
  // squeezed the subtitle textarea down to an unreadable sliver.
  list: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 300,
    minWidth: 0,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "9px 10px",
    backgroundColor: "var(--surface-1)",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border-soft)",
    borderRadius: 6,
    cursor: "pointer",
    minWidth: 0,
  },
  rowSelected: {
    borderColor: "var(--accent)",
    backgroundColor: "var(--surface-3-soft)",
  },
  rowBgmDragHighlight: {
    borderColor: "var(--bgm-cue-border)",
    backgroundColor: "var(--bgm-cue-bg)",
  },
  index: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "auto",
    width: 20,
    fontSize: 13,
    color: "var(--text-secondary)",
  },
  text: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "auto",
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 3,
  },
  scene: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: 13,
    color: "var(--text-tertiary)",
  },
  sceneEmpty: {
    fontStyle: "italic",
    color: "var(--text-faint)",
  },
  // Second line under the scene text (13-inch density pass, 2026-07-10) - time/style badge/
  // subtitle dot/reorder+delete actions used to sit beside `text` as direct row siblings, which
  // only worked at the row's old 480px-wide list column. Stacking them onto their own line here
  // (a common two-line list-row convention - title line + metadata line, e.g. Premiere's/Resolve's
  // bin rows) is what lets `text` keep a usable width at the narrower 300px column.
  metaRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  time: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "auto",
    fontSize: 13,
    color: "var(--text-tertiary)",
    whiteSpace: "nowrap",
  },
  styleBadge: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "auto",
    padding: "1px 5px",
    borderRadius: 3,
    fontSize: 11,
    fontWeight: 600,
    whiteSpace: "nowrap",
    backgroundColor: "var(--tag-pink-bg)",
    color: "var(--tag-pink-text)",
  },
  subtitleDot: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "auto",
    width: 8,
    height: 8,
    borderRadius: "50%",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--accent)",
    backgroundColor: "transparent",
  },
  subtitleDotFilled: {
    backgroundColor: "var(--accent)",
  },
  actions: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "auto",
    display: "flex",
    gap: 4,
    // Pushes the reorder/delete icons to the far end of `metaRow` (2026-07-10), matching the
    // row's old right-aligned position now that they've moved off the main row.
    marginLeft: "auto",
  },
  addButton: {
    marginTop: 10,
  },
});
