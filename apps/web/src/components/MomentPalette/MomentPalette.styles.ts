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
    // Cards are a uniform fixed height now (2026-07-11, see `cardRow`'s comment), so `stretch` vs.
    // `flex-start` no longer changes anything visually for the common case - kept flex-start since
    // an excluded card's extra status-banner height (added on top of the fixed row, see `card`'s
    // comment) still means row members aren't perfectly uniform in that rare state.
    alignItems: "flex-start",
  },
  // 168 -> 440 (2026-07-11 QA fix, horizontal card layout - see cardRow/thumbCol below): a
  // stacked-thumbnail-on-top card could stay narrow, but a horizontal thumbnail+metadata pairing
  // needs enough width for the thumbnail column to actually read as "larger", per the researched
  // convention (Premiere bin / Final Cut event browser / DaVinci media pool).
  cardWrap: {
    width: 440,
  },
  // Background/border/rounded corners are handled by Astryx Card (variant="default") - this only
  // adds size/layout within the grid and overflow-hidden (for clipping the thumbnail's corners).
  // No fixed height here (2026-07-11): the rare exclusion banner is a sibling of `cardRow` inside
  // this same flex column, so it stacks additively on top of `cardRow`'s own fixed height rather
  // than needing to be budgeted into a single total - see `cardRow`'s comment.
  card: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  // Uniform card height (2026-07-11 QA fix, design-principles.md #6 "dense, no ragged rows") -
  // previously this row was `alignItems: flex-start` with the thumbnail at its own 16:9-derived
  // height and the body free to grow with the scene description, so a long description made that
  // one card's row visibly taller than its grid neighbors. Fixing `height` here and switching to
  // `alignItems: stretch` makes every card's content row the same height regardless of thumbnail
  // ratio or description length; `thumbCol`/`cardBody` both stretch to fill it (thumbCol's frame
  // via `objectFit: cover`, cardBody via its own fixed-size children + `memoWrap`'s scroll cap -
  // see their comments). 160px sized bottom-up from cardBody's actual content budget: 24px
  // (12px top+bottom padding) + 20px (2 x 10px gaps between memo/info/actions) + 60px (memoWrap's
  // capped description height, ~3 lines) + ~22px (info row) + ~28px (sm action button) + a few px
  // slack ≈ 160px total.
  cardRow: {
    display: "flex",
    flexDirection: "row",
    alignItems: "stretch",
    width: "100%",
    height: 160,
  },
  // Fixes the thumbnail to its own column (no longer via AspectRatio, see MomentPalette.tsx's
  // comment) - a ~45% share of the card, matching the researched convention's proportions. Height
  // comes from `cardRow`'s `alignItems: stretch` (a flex item's stretched cross-size is a definite
  // size for descendants' percentage-height resolution), so `thumbOverlay`/the thumbnail img can
  // fill it at 100% height with no separate height rule needed here.
  thumbCol: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 200,
    minWidth: 0,
  },
  // Astryx Overlay's own container renders as a plain block div with no explicit height (see its
  // source) - this xstyle stretches it to fill `thumbCol`'s full stretched height so the thumbnail
  // (img, objectFit:cover) reaches edge to edge with zero letterbox gap (2026-07-11 QA fix).
  thumbOverlay: {
    width: "100%",
    height: "100%",
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
  // consistent with this component's established "wrap over truncate/overlap" rule.
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
  // full-bleed thumbnail box before a frame has loaded (or when there is none), it stays dark even
  // in light theme.
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
  // Container for the card's internal hierarchy (screen-spec section 2) - to the right of the
  // thumbnail column (2026-07-11 QA fix, horizontal layout), lays out the description/meta/action
  // three groups with consistent padding + a clear gap between groups. flexGrow fills the row's
  // remaining width; the left padding is what creates the visual gap from the thumbnail (no
  // separate gap needed on cardRow). Stretched by `cardRow`'s `alignItems: stretch` to the same
  // fixed height as `thumbCol` (2026-07-11) - `minHeight: 0` is required on a stretched flex-column
  // container for its own scrolling child (`memoWrap`) to be able to shrink below its content size
  // instead of forcing this box to overflow its stretched height.
  cardBody: {
    flexGrow: 1,
    minWidth: 0,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: 12,
  },
  // Fixed max-height + internal scroll (2026-07-11 QA fix, design-principles.md #6) - this is what
  // keeps the card's overall height uniform (see `cardRow`'s comment): previously the description
  // rendered with no clamp at all, so a long scene memo grew the whole card. 60px fits roughly 3
  // lines of the `Text type="supporting"` size; anything longer scrolls within the card instead of
  // stretching it.
  memoWrap: {
    padding: 0,
    maxHeight: 60,
    overflowY: "auto",
  },
  // Add/remove is the card's only action now (2026-07-11 - intro/outro assignment removed from
  // scene cards per user direction; Edit step's cut-settings panel (ActionsGroup's "Set as intro"/
  // "Set as outro") is still where intro/outro gets set). Kept as its own group (rather than
  // inlining SceneCardButton directly in cardBody) so a future card-level action has a home
  // without another layout change.
  actionsGroup: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
});
