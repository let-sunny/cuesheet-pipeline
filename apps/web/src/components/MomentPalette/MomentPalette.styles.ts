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
 * 10px -> 8px). Structural element sizing (`cardWrap`'s 440px card width, `cardRow`'s fixed row
 * height, `thumbCol`'s 200px column) stays literal - those are "which elements sit where and how
 * big" (the strict rule's layout-structure carve-out), not spacing between elements.
 *
 * NOT migrated here (stay plain CSS, see styles.css):
 * - `.empty-state` (+ `.empty-state code`) — shared with App.tsx (both render the same generic
 *   "nothing here yet" guidance message). Not owned solely by this component.
 * - `.status` (the loading/error message) — shared with App.tsx's own loading/error states. The
 *   old `.moment-palette.status` compound rule (padding/text-align from `.status` plus a color/
 *   font-size override) is folded wholesale into `paletteStatus` below instead, since this
 *   component no longer renders the literal `status` class - see `paletteStatus`'s own comment.
 *
 * The category/status filters (2026-07-11 stock-component migration, then 2026-07-11 faceted-
 * filtering restructure) are two distinct facet controls, not one flat chip row: status is a stock
 * Astryx `SegmentedControl` (its own look is entirely stock - `statusRow` below is layout only, a
 * margin under it), and category stays a standalone `ToggleButton`-based pill strip (`FilterChip`
 * - see MomentPalette.tsx's comment for why standalone, not `ToggleButtonGroup`). `categoryStrip`
 * lays that strip out as a single non-wrapping row that scrolls horizontally on overflow, rather
 * than wrapping to a second line, to keep the whole filter area to two compact ~32-40px rows on a
 * 13-inch viewport.
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
  // Meta-row tier (2026-07-11 typography pass) - matches `metaRow`/`categoryBadge` below, so the
  // category/quality pair reads as one uniformly small, quiet caption line.
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
  // Status axis, row 1 (2026-07-11 faceted-filtering restructure) - just a margin under the
  // SegmentedControl to separate it from the category strip below; the control's own look/layout
  // is entirely stock (no xstyle passed to it).
  statusRow: {
    marginBottom: spacingVars["--spacing-2"],
  },
  // Category axis, row 2 - a single row that never wraps (`nowrap`) and instead scrolls
  // horizontally on overflow (`overflowX: auto`), per the spec's "compact, 13-inch: two ~32-40px
  // rows max" - a wrapping pill row would grow a third+ line as more categories appear across
  // episodes, which the status-row-on-top layout has no height budget for.
  categoryStrip: {
    display: "flex",
    flexWrap: "nowrap",
    overflowX: "auto",
    gap: spacingVars["--spacing-1-5"],
    marginBottom: spacingVars["--spacing-3"],
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
    // Every card is now a uniform fixed height regardless of state (2026-07-11, see `cardRow`'s
    // comment - the exclusion reason moved off a sibling banner and onto the thumbnail as an
    // overlay, so it no longer adds height to the card), so `stretch` vs. `flex-start` no longer
    // makes any visual difference here - kept `flex-start` since it's the simpler default once
    // every row member is already the same size.
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
  // Card now contains exactly one child, `cardRow` (2026-07-11 uniform-height fix): the exclusion
  // reason used to be a sibling banner ABOVE this row that only excluded cards rendered, so their
  // total height was `cardRow` height PLUS the banner - the source of the ragged grid rows the
  // user flagged (card heights differing made the grid look bad). With the reason now an absolute overlay
  // scoped to `thumbCol` (see `exclusionScrim`), `cardRow` alone determines every card's height,
  // uniformly, in every state.
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
  // see their comments). 184px sized bottom-up from cardBody's actual content budget (2026-07-11,
  // regrown from 160 to fit the metadata cluster's extra line): 24px (12px top+bottom padding) +
  // 16px (2 x 8px gaps between memo/meta/actions) + 60px (memoWrap's capped description height,
  // ~3 lines) + ~40px (2-line metadata cluster: filename/time line + category+quality row) + ~28px
  // (sm action button) + a few px slack ≈ 184px total.
  cardRow: {
    display: "flex",
    flexDirection: "row",
    alignItems: "stretch",
    width: "100%",
    height: 184,
  },
  // Fixes the thumbnail to its own column (no longer via AspectRatio, see MomentPalette.tsx's
  // comment) - a ~45% share of the card, matching the researched convention's proportions (200 ->
  // 180 2026-07-11, scaled down alongside the card's own 440 -> ~400px width from the grid-column
  // fix above, to hold that same ~45% ratio rather than growing past it). Height comes from
  // `cardRow`'s `alignItems: stretch` (a flex item's stretched cross-size is a definite size for
  // descendants' percentage-height resolution), so `thumbOverlay`/the thumbnail img can fill it at
  // 100% height with no separate height rule needed here. `position: relative` (2026-07-11) makes
  // this the containing block for `exclusionScrim` below, so the exclusion reason covers only the
  // thumbnail, never the whole card.
  thumbCol: {
    position: "relative",
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
  // Rules for representing the excluded (auto-filtered) card and the in-use card state (screen-
  // spec section 2) - both a full-opacity dimming and a thumbnail-only desaturation were abandoned
  // based on user feedback that both hurt readability. Both states always show the card/thumbnail
  // at full contrast; state is conveyed only via the exclusion scrim below, the in-use badge, and
  // this border color.
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
  // Auto-exclusion reason - an absolute overlay on the thumbnail (2026-07-11 user directive,
  // overriding a prior 2026-07-09 decision to keep this as a full-width banner ABOVE the thumbnail
  // "so it pushes the frame down without covering it"): that banner added a whole extra row's
  // worth of height to only the excluded cards, so grid rows were never uniform - the user's main
  // complaint. Anchored to `thumbCol` (`position: relative` there), as a bottom strip rather than
  // covering the full frame, so some of the thumbnail stays visible for context underneath the
  // reason text. The scrim background is a fixed dark literal rather than a theme-reactive Astryx
  // token, same carve-out as `thumbEmpty`/`number` below - it sits on top of a photo of unknown
  // brightness, so it must guarantee readable contrast regardless of theme; the reason text itself
  // is tinted with the real `--color-error`/`--color-warning` tokens (see `exclusionScrimFace`/
  // `exclusionScrimQuality`) so face vs. quality still reads as visually distinct, exactly as the
  // old banner's two background colors did. Wraps instead of truncating (QA finding 2026-07-10:
  // nowrap+ellipsis cut "face exposure" down to "face exp…" mid-word at the card's narrow width,
  // leaving the full reason visible only on hover) - consistent with this component's established
  // "wrap over truncate/overlap" rule.
  exclusionScrim: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: `${spacingVars["--spacing-1"]} ${spacingVars["--spacing-2"]}`,
    fontSize: textSizeVars["--font-size-xs"],
    fontWeight: fontWeightVars["--font-weight-bold"],
    textAlign: "center",
    whiteSpace: "normal",
    overflowWrap: "break-word",
    // A translucent black scrim sits ON the video thumbnail (not app chrome), so it stays a fixed
    // dark regardless of the active theme - dimming reads the same on any theme.
    backgroundColor: "#000000b3", // theme-exempt
  },
  exclusionScrimFace: {
    color: colorVars["--color-error"],
  },
  exclusionScrimQuality: {
    color: colorVars["--color-warning"],
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
  // Trims Badge's default size down (2026-07-11 QA fix, design-principles.md #4) - category is
  // secondary metadata next to quality, not a heading, so it shouldn't out-weigh it. Badge has no
  // `size` prop, so this is the sanctioned per-instance xstyle override. maxWidth + ellipsis
  // (2026-07-11 typography pass) is the truncation fallback for the one long category label
  // ("Materials/props") alongside `nowrap` below - category is the least important of the two
  // meta-row items, so it's the one that gives way if tight.
  categoryBadge: {
    fontSize: textSizeVars["--font-size-xs"],
    padding: `1px ${spacingVars["--spacing-1-5"]}`,
    maxWidth: 110,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  // Metadata cluster (2026-07-11 user feedback: filename/time/quality-style metadata is fine
  // grouped on the card's right side) - groups the clip filename, time range, category, and
  // quality into one quiet secondary block below the scene description, on the card's right side. Replaces
  // both the old thumbnail-overlay chip (filename/time) and the old bare `info` row (category/
  // duration/quality) with a single two-line cluster.
  metaCluster: {
    display: "flex",
    flexDirection: "column",
    gap: spacingVars["--spacing-1"],
  },
  // Filename + time-range line - quiet caption text, truncates (rather than wrapping) since it's a
  // single dense identifier line and the full value is always available via the card's title
  // tooltip.
  metaFile: {
    fontSize: textSizeVars["--font-size-xs"],
    color: colorVars["--color-text-secondary"],
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  // Category badge + quality, baseline-aligned per screen-spec 0-2, forced onto one tidy line
  // (2026-07-11 QA fix - a wrap here read as broken, not "responsive") now that category truncates
  // instead of wrapping (see `categoryBadge`'s comment).
  metaRow: {
    display: "flex",
    alignItems: "baseline",
    flexWrap: "nowrap",
    gap: spacingVars["--spacing-2"],
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
  // this pins the description to at least 2 full lines regardless, and the (now smaller) meta/
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
  // "Set as outro") is still where intro/outro gets set) and it's the card's single most important
  // action (2026-07-11 user feedback: add-to-cut/remove-cut should sit in the single most
  // important spot, the card's bottom-right) - `marginTop: auto` pushes this group to the bottom of cardBody's fixed-height
  // column regardless of how much the memo/meta groups above it fill, and `justifyContent: flex-
  // end` right-aligns the single button within that full-width row, together pinning it to the
  // card's bottom-right corner.
  actionsGroup: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    marginTop: "auto",
    gap: spacingVars["--spacing-1-5"],
  },
});
