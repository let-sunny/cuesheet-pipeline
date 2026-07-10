import * as stylex from "@stylexjs/stylex";

/**
 * Component anatomy migration (docs/styling-migration.md, StyleX migration batch 5) — rules ported
 * 1:1 from the old `.moment-*` classes in styles.css (all owned solely by this component).
 *
 * NOT migrated here (stay plain CSS, see styles.css):
 * - `.empty-state` (+ `.empty-state code`) — shared with App.tsx (both render the same generic
 *   "nothing here yet" guidance message). Not owned solely by this component.
 * - `.status` (the loading/error message) — shared with App.tsx's own loading/error states. The
 *   old `.moment-palette.status` compound rule (padding/text-align from `.status` plus a color/
 *   font-size override) is folded wholesale into `paletteStatus` below instead, since this
 *   component no longer renders the literal `status` class - see `paletteStatus`'s own comment.
 * - `.moment-filters button` (+ `.active`) — a descendant selector (1 class + tag, so higher
 *   specificity than `.plain-button` regardless of source order) that sets the filter buttons' own
 *   font-size/padding/background/border-color, same root cause as HeaderBar's theme toggle /
 *   MiniTimelineStrip's zoom-controls button. The wrapper's own layout (`.moment-filters`'s flex/
 *   wrap/gap, below as `filters`) still moves to StyleX - the div keeps both the plain
 *   `moment-filters` className *and* the StyleX class so the descendant selector keeps matching
 *   (same hybrid pattern as CompactSegmentList's `compact-list-actions`).
 *
 * `background`/`border` shorthands are written out as their longhand equivalents - see
 * HeaderBar.styles.ts's comment for why (StyleX silently drops the shorthand form).
 */
export const styles = stylex.create({
  palette: {
    marginBottom: 4,
    padding: "12px 16px",
    backgroundColor: "var(--surface-1)",
    borderRadius: 8,
  },
  // Replaces the old `.moment-palette.status` compound rule - combines `.status`'s padding/
  // text-align (this component no longer renders that shared class) with the color/font-size
  // override that rule layered on top, so the loading/error message renders identically.
  paletteStatus: {
    padding: 40,
    textAlign: "center",
    color: "var(--text-secondary)",
    fontSize: 13,
  },
  quality: {
    fontSize: 12,
    color: "var(--text-tertiary)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 10,
    fontSize: 13,
    color: "var(--text-secondary)",
  },
  filters: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 12,
  },
  grid: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    // Since card heights now vary by scene description length (clamp removed), leaving the
    // default stretch would make a short-memo card stretch to the height of a longer card on the
    // same row. Each row independently (not masonry) takes only its own content's height.
    alignItems: "flex-start",
  },
  cardWrap: {
    width: 168,
  },
  // Background/border/rounded corners are handled by Astryx Card (variant="default") - this only
  // adds size/layout within the grid and overflow-hidden (for clipping the thumbnail's top
  // corners).
  card: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  // Rules for representing excluded (auto-filtered) card and in-use card state (screen-spec
  // section 2) - both a full-opacity dimming and a thumbnail-only desaturation were abandoned
  // based on user feedback that both hurt readability. Both states always show the card/thumbnail
  // at full contrast; state is conveyed only via the status banner, the in-use badge, and this
  // border color.
  cardStatusRejectedFace: {
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--error-border)",
  },
  cardStatusRejectedQuality: {
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--warning-border)",
  },
  // Auto-exclusion reason banner - top of the card, full width. Must be far more noticeable than
  // a small corner badge (the previous problem where its smallness got misread as "dimmed = inactive").
  // Wraps instead of truncating (QA finding 2026-07-10: nowrap+ellipsis cut "face exposure" down to
  // "face exp…" mid-word at the card's 168px width, leaving the full reason visible only on hover) -
  // consistent with this component's established "wrap over truncate/overlap" rule (see ioActions'
  // comment above for the same call made on the intro/outro buttons).
  statusBanner: {
    padding: "4px 8px",
    fontSize: 11,
    fontWeight: 700,
    textAlign: "center",
    whiteSpace: "normal",
    overflowWrap: "break-word",
  },
  statusBannerFace: {
    backgroundColor: "var(--error-border)",
    color: "var(--error-text)",
  },
  statusBannerQuality: {
    backgroundColor: "var(--warning-border)",
    color: "var(--warning-text)",
  },
  // Background is intentionally fixed dark regardless of theme — since this sits inside the
  // AspectRatio(16:9) box before a frame has loaded (or when there is none), it stays dark even in
  // light theme.
  thumbEmpty: {
    width: "100%",
    height: "100%",
    backgroundColor: "var(--stage-bg)",
  },
  // Content row rendered inside Astryx Overlay's "top" region - holds the number chip (clip name +
  // time) + "in use" badge. Overlay owns the absolute placement over the thumbnail, so this only
  // needs to be a flex-wrap row: when width is insufficient the badge drops to the next line.
  overlayRow: {
    display: "flex",
    width: "100%",
    flexWrap: "wrap",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 4,
  },
  // Since this overlays the (always-dark) thumbnail, the text color must also be a fixed light
  // color regardless of theme - otherwise in light theme, an inherited dark color would show as
  // dark text on a dark chip, invisible.
  number: {
    minWidth: 0,
    overflowWrap: "break-word",
    fontSize: 12,
    padding: "1px 5px",
    backgroundColor: "#00000099",
    color: "#e6e8ee",
    borderRadius: 3,
  },
  // Color (the "in use" emphasis) is handled by Badge's variant="success" - this only adds
  // not-shrinking behavior within the overlay row (always dropping to the next line with full text intact).
  badgeInUse: {
    flexShrink: 0,
  },
  // Meta row (category badge/duration/quality) - baseline-aligned per screen-spec 0-2. flex-wrap:
  // if a long category badge label leaves insufficient width, later items drop to the next line
  // instead of getting clipped.
  info: {
    display: "flex",
    alignItems: "baseline",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: "4px 10px",
    fontSize: 13,
    color: "var(--text-tertiary)",
  },
  // Container for the card's internal hierarchy (screen-spec section 2) - below the thumbnail
  // (full width, no padding), lays out the description/meta/action three groups with consistent
  // padding + a clear gap between groups.
  cardBody: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: 12,
  },
  memoWrap: {
    padding: 0,
  },
  // Add/remove (primary action, a single state-driven toggle button) and intro/outro (secondary
  // action) are the same "action" group - tight within the group, separated from the meta row
  // above by the body's own gap.
  actionsGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  cardActions: {
    display: "flex",
    gap: 6,
  },
  // Stacked (not side by side): at the card's 168px width (144px after cardBody's 12px padding),
  // two side-by-side buttons only get ~69px each and Button's label doesn't wrap - "Set as intro"/
  // "Set as outro" would truncate to unreadable fragments. Stacking (full 144px per button) is the
  // safe layout, consistent with this component's "wrap over truncate/overlap" rule used elsewhere
  // (overlayRow, info).
  ioActions: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
});
