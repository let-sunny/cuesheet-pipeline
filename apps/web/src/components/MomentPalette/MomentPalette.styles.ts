import * as stylex from "@stylexjs/stylex";
import {
  colorVars,
  radiusVars,
  spacingVars,
  textSizeVars,
  fontWeightVars,
} from "@astryxdesign/core/theme/tokens.stylex";

/**
 * Component anatomy migration (docs/styling-migration.md, StyleX migration batch 5) — rules ported
 * 1:1 from the old `.moment-*` classes in styles.css (all owned solely by this component).
 *
 * Spacing/radius migration (2026-07-11, design-principles.md #5 strict rule): `gap`/`padding`/
 * `margin`/`borderRadius` read from Astryx's `spacingVars`/`radiusVars` throughout, snapped to the
 * nearest step on the 2/4/6/8/12/16/20/24px scale where the old value fell between two steps (e.g.
 * 10px -> 8px). Structural element sizing (`cardWrap`'s 440px card width, `cardRow`'s 160px fixed
 * row height, `thumbCol`'s 200px column) stays literal - those are "which elements sit where and
 * how big" (the strict rule's layout-structure carve-out), not spacing between elements. `number`'s
 * 1px padding and its always-dark overlay colors stay literal too (see their own comments) - font-
 * size and this app's bespoke color-token swap are both deferred, same reasoning as
 * HeaderBar.styles.ts's comment.
 *
 * NOT migrated here (stay plain CSS, see styles.css):
 * - `.empty-state` (+ `.empty-state code`) — shared with App.tsx (both render the same generic
 *   "nothing here yet" guidance message). Not owned solely by this component.
 * - `.status` (the loading/error message) — shared with App.tsx's own loading/error states. The
 *   old `.moment-palette.status` compound rule (padding/text-align from `.status` plus a color/
 *   font-size override) is folded wholesale into `paletteStatus` below instead, since this
 *   component no longer renders the literal `status` class - see `paletteStatus`'s own comment.
 *
 * The category/status filter chips (2026-07-11 stock-component migration) are now a stock Astryx
 * `ToggleButtonGroup`/`ToggleButton` pair instead of raw `.plain-button` elements - the chips' own
 * look is entirely stock now, so the old `.moment-filters button`/`.active` plain-CSS exception is
 * gone. `filters` below is passed as the group's `xstyle` purely for wrap layout (categories can
 * exceed one row's width on a 13" viewport) - not a restyle of the chips themselves.
 *
 * `background`/`border` shorthands are written out as their longhand equivalents - see
 * HeaderBar.styles.ts's comment for why (StyleX silently drops the shorthand form).
 */
export const styles = stylex.create({
  palette: {
    marginBottom: spacingVars["--spacing-1"],
    padding: `${spacingVars["--spacing-3"]} ${spacingVars["--spacing-4"]}`,
    backgroundColor: colorVars["--color-background-surface"],
    borderRadius: radiusVars["--radius-element"],
  },
  // Replaces the old `.moment-palette.status` compound rule - combines `.status`'s padding/
  // text-align (this component no longer renders that shared class) with the color/font-size
  // override that rule layered on top, so the loading/error message renders identically.
  paletteStatus: {
    padding: spacingVars["--spacing-10"],
    textAlign: "center",
    color: colorVars["--color-text-secondary"],
    fontSize: textSizeVars["--font-size-sm"],
  },
  // Meta-row tier (2026-07-11 typography pass) - matches `info`/`categoryBadge` below, so the
  // category/duration/quality trio reads as one uniformly small, quiet caption line.
  quality: {
    fontSize: textSizeVars["--font-size-xs"],
    color: colorVars["--color-text-secondary"],
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacingVars["--spacing-3"],
    marginBottom: spacingVars["--spacing-2"],
    fontSize: textSizeVars["--font-size-sm"],
    color: colorVars["--color-text-secondary"],
  },
  // The two filter axes (category, status) sit side by side on ONE row (2026-07-11): a horizontal
  // toolbar wrapping both ToggleButtonGroups, with a larger inter-group gap than the within-group
  // chip gap so the two axes still read as distinct. Wraps the status group below only when the
  // 13-inch width genuinely can't hold both - the common case is a single row.
  filterBar: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacingVars["--spacing-4"],
    marginBottom: spacingVars["--spacing-3"],
  },
  filters: {
    display: "flex",
    flexWrap: "wrap",
    gap: spacingVars["--spacing-1-5"],
  },
  // flex-wrap -> CSS grid (2026-07-11 whitespace fix, design-principles.md #6 "minimal whitespace,
  // both axes"): at the 13-inch target (1280px), the old flex-wrap + 440px fixed card width only
  // ever fit 2 cards per row, leaving a large empty gutter on the right. `auto-fill, minmax(380px,
  // 1fr)` fits exactly 3 across at 1280 (grid content width ~1216px: 3 x 400px cards + 2 x 8px
  // gaps) and lets each track stretch to fill the row - same convention grid-based media browsers
  // use (Premiere bin / Lightroom grid), not an invented layout.
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))",
    gap: spacingVars["--spacing-2"],
    // Cards are a uniform fixed height now (2026-07-11, see `cardRow`'s comment), so `stretch` vs.
    // `flex-start` no longer changes anything visually for the common case - kept flex-start since
    // an excluded card's extra status-banner height (added on top of the fixed row, see `card`'s
    // comment) still means row members aren't perfectly uniform in that rare state.
    alignItems: "flex-start",
  },
  // Fixed 440px width removed (2026-07-11 whitespace fix) - the card now just fills its grid track
  // (see `grid`'s comment), so its actual rendered width tracks the grid's column sizing instead of
  // a literal.
  cardWrap: {
    width: "100%",
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
  // comment) - a ~45% share of the card, matching the researched convention's proportions (200 ->
  // 180 2026-07-11, scaled down alongside the card's own 440 -> ~400px width from the grid-column
  // fix above, to hold that same ~45% ratio rather than growing past it). Height comes from
  // `cardRow`'s `alignItems: stretch` (a flex item's stretched cross-size is a definite size for
  // descendants' percentage-height resolution), so `thumbOverlay`/the thumbnail img can fill it at
  // 100% height with no separate height rule needed here.
  thumbCol: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 180,
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
    borderColor: colorVars["--color-border-red"],
  },
  cardStatusRejectedQuality: {
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colorVars["--color-border-yellow"],
  },
  // Auto-exclusion reason banner - top of the card, full width. Must be far more noticeable than
  // a small corner badge (the previous problem where its smallness got misread as "dimmed = inactive").
  // Wraps instead of truncating (QA finding 2026-07-10: nowrap+ellipsis cut "face exposure" down to
  // "face exp…" mid-word at the card's 168px width, leaving the full reason visible only on hover) -
  // consistent with this component's established "wrap over truncate/overlap" rule.
  statusBanner: {
    padding: `${spacingVars["--spacing-1"]} ${spacingVars["--spacing-2"]}`,
    fontSize: textSizeVars["--font-size-xs"],
    fontWeight: fontWeightVars["--font-weight-bold"],
    textAlign: "center",
    whiteSpace: "normal",
    overflowWrap: "break-word",
  },
  statusBannerFace: {
    backgroundColor: colorVars["--color-error"],
    color: colorVars["--color-on-error"],
  },
  statusBannerQuality: {
    backgroundColor: colorVars["--color-warning"],
    color: colorVars["--color-on-warning"],
  },
  // Background is intentionally fixed dark regardless of theme — since this sits inside the
  // full-bleed thumbnail box before a frame has loaded (or when there is none), it stays dark even
  // in light theme. Kept as the app's own `--stage-bg` literal (styles.css), not an Astryx
  // `--color-*` token, on purpose - every Astryx background token is theme/mode-reactive by design,
  // which is exactly what this element must NOT do (flagged 2026-07-11 color migration: a
  // deliberate, semantically-required exception, same carve-out as a video letterbox).
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
    gap: spacingVars["--spacing-1"],
  },
  // Since this overlays the (always-dark) thumbnail, the text color must also be a fixed light
  // color regardless of theme - otherwise in light theme, an inherited dark color would show as
  // dark text on a dark chip, invisible (both colors stay literal hex, same reasoning as
  // `thumbEmpty` above - flagged 2026-07-11 color migration: kept as a deliberate, theme-invariant
  // exception rather than an Astryx `--color-*` token, since every Astryx background/text token is
  // theme-reactive by design and this chip specifically must not react). 1px vertical padding is
  // below the token scale's smallest step (2px) - kept literal for this compact overlay chip
  // rather than doubling its padding to fit the scale.
  number: {
    minWidth: 0,
    overflowWrap: "break-word",
    fontSize: textSizeVars["--font-size-sm"],
    padding: `1px ${spacingVars["--spacing-1"]}`,
    backgroundColor: "#00000099",
    color: "#e6e8ee",
    borderRadius: radiusVars["--radius-inner"],
  },
  // Color (the "in use" emphasis) is handled by Badge's variant="success" - this only adds
  // not-shrinking behavior within the overlay row (always dropping to the next line with full text intact).
  badgeInUse: {
    flexShrink: 0,
  },
  // Trims Badge's default size down (2026-07-11 QA fix, design-principles.md #4) - category is
  // secondary metadata next to duration/quality, not a heading, so it shouldn't out-weigh them.
  // Badge has no `size` prop, so this is the sanctioned per-instance xstyle override. maxWidth +
  // ellipsis (2026-07-11 typography pass) is the truncation fallback for the one long category
  // label ("Materials/props") alongside `nowrap` below - category is the least important of the
  // three meta items (duration/quality stay whole), so it's the one that gives way if tight.
  categoryBadge: {
    fontSize: textSizeVars["--font-size-xs"],
    padding: `1px ${spacingVars["--spacing-1-5"]}`,
    maxWidth: 110,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  // Meta row (category badge/duration/quality) - baseline-aligned per screen-spec 0-2, forced onto
  // one tidy line (2026-07-11 QA fix - a 3-way vertical wrap here read as broken, not "responsive")
  // now that all three items sit at the same small `xs` tier and category truncates instead of
  // wrapping (see `categoryBadge`'s comment).
  info: {
    display: "flex",
    alignItems: "baseline",
    flexWrap: "nowrap",
    justifyContent: "space-between",
    gap: `${spacingVars["--spacing-1"]} ${spacingVars["--spacing-2"]}`,
    fontSize: textSizeVars["--font-size-xs"],
    color: colorVars["--color-text-secondary"],
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
    gap: spacingVars["--spacing-2"],
    padding: spacingVars["--spacing-3"],
  },
  // Fixed max-height + internal scroll (2026-07-11 QA fix, design-principles.md #6) - this is what
  // keeps the card's overall height uniform (see `cardRow`'s comment): previously the description
  // rendered with no clamp at all, so a long scene memo grew the whole card. 60px fits roughly 3
  // lines of the `Text type="supporting"` size (~18.5px line-height); anything longer scrolls
  // within the card instead of stretching it. `flexShrink: 0` + `minHeight: 40` (2026-07-11 QA fix)
  // - without them, cardBody's default flex-shrink let this row get squeezed down to under 1.5
  // visible lines whenever its siblings' natural size left less than 60px of the fixed-height
  // column, which is exactly what the category-badge/action-button downsizing above was for -
  // this pins the description to at least 2 full lines regardless, and the (now smaller) info/
  // actions rows shrink instead if the column is ever tight.
  memoWrap: {
    padding: 0,
    flexShrink: 0,
    minHeight: 40,
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
    gap: spacingVars["--spacing-1-5"],
  },
});
