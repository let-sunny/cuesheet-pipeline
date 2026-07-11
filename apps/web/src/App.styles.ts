import * as stylex from "@stylexjs/stylex";
import { colorVars, spacingVars } from "@astryxdesign/core/theme/tokens.stylex";

/**
 * Component anatomy migration (docs/styling-migration.md, StyleX migration batch 4) — App root
 * shell layout, ported 1:1 from styles.css's old `.app` rule (owned solely by App.tsx's own render
 * tree — not a separate component, so this sits next to App.tsx without a folder, per the recipe's
 * App-root exception). The Edit step's `.edit-layout`/`.trim-*` rules moved out to
 * `steps/EditStep/EditStep.styles.ts` once that step became its own component.
 *
 * `.app h2` is deliberately NOT here — despite the `.app`-scoped selector, it never targeted
 * anything App.tsx itself renders. It matched `<h2>` elements two levels down, inside another
 * component's own panel-title heading (BgmSettingsPanel, before its 2026-07-11 Cut-settings-grid
 * migration to a component-owned `Text` element). Because `.app h2` (class+tag) had higher
 * specificity than that heading's own marker class (class-only), it was silently winning font-
 * size/margin on it and uniquely supplying text-transform/letter-spacing (no other rule set
 * those). StyleX has no descendant-selector equivalent, so instead of leaving a phantom App-scoped
 * rule around, its winning values were folded directly into that component's own styling (now
 * BgmSettingsPanel.styles.ts's `panelTitle`) — same rendered result, but the rule now lives with
 * its true owner instead of a mis-scoped ancestor.
 *
 * `miniStripRow`/`sequencePlayerSticky`/`stepBody` added in StyleX migration batch 5 — ported 1:1
 * from styles.css's old `.mini-strip-row`/`.sequence-player-sticky`/`.step-body` rules. These wrap
 * MiniTimelineStrip/SequencePlayer but are App's own container layout (not those components' own
 * root styles), same reasoning as `.edit-layout` above.
 */
export const styles = stylex.create({
  app: {
    maxWidth: "none",
    margin: "0 auto",
    // Horizontal padding 32px -> spacing-4 (16px) (2026-07-11 whitespace fix, design-principles.md
    // #6 "minimal whitespace, both axes"): the old fixed 32px side gutters, combined with
    // MomentPalette's flex-wrap grid, left a wide empty strip on the right at the 1280px target
    // width instead of fitting a 3rd card column - see MomentPalette.styles.ts's `grid` comment for
    // the other half of this fix. Both values now read from `spacingVars` (previously a literal
    // "24px 32px" string, itself a stray hardcoded-spacing violation predating this pass).
    padding: `${spacingVars["--spacing-6"]} ${spacingVars["--spacing-4"]}`,
  },
  // Row placing the mini timeline strip + "Play all" button side by side.
  miniStripRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
  },
  // Sequential playback sticky area: fixed below the mini timeline, with the edit content below it
  // still visible as-is.
  sequencePlayerSticky: {
    position: "sticky",
    top: 0,
    zIndex: 20,
    backgroundColor: colorVars["--color-background-body"],
    padding: "12px 0",
    marginTop: 12,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colorVars["--color-background-muted"],
  },
  stepBody: {
    marginTop: 16,
  },
  // Full-page loading/error/not-found placeholder shown before the app shell mounts (no draft
  // loaded yet) - ported from the old `.status`(+`.empty-state`) classes in styles.css, now a
  // centered wrapper around a stock Astryx `EmptyState` instead (2026-07-11 stock-audit completion
  // pass).
  bootStatus: {
    padding: spacingVars["--spacing-10"],
    display: "flex",
    justifyContent: "center",
  },
});
