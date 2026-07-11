import * as stylex from "@stylexjs/stylex";
import { radiusVars, spacingVars } from "@astryxdesign/core/theme/tokens.stylex";

/**
 * Component anatomy migration (docs/styling-migration.md) — rules ported 1:1 from the old
 * `.subtitle-style-preview-*` classes in styles.css (owned solely by this file's components -
 * SubtitleStyleSettings and its private preview-stage helper). Split out of the old shared
 * `FinishingSettings/` folder once SubtitleStyleSettings/NarrationSettings became separate
 * per-section components (CLAUDE.md's "groups are components, panels are arrangements" rule,
 * applied to the Export step's sections).
 *
 * Left behind in styles.css (not migrated): `.video-subtitle-overlay*` (shared with
 * VideoPreview/SequencePlayer's actual video overlay - this preview stage intentionally reuses
 * those classes so it can never visually drift from the real thing, see the component doc
 * comment). `.swatch` was migrated separately (batch 4) into its own `components/Swatch/`
 * component, now used indirectly via the shared `ui/ColorField` wrapper (2026-07-11 stock-audit
 * completion pass). The Size/Outline width/Background padding fields' native-input chrome
 * (`numberInput`) is gone (2026-07-11 stock-input migration) - they're now a stock Astryx
 * `TextInput` via the shared `ui/NumericInput` adapter, which gets its width via `xstyle` instead
 * of a co-located rule. Position moved to a stock Astryx `Selector` via `ui/SelectField`.
 *
 * Radius/spacing migration (2026-07-11, design-principles.md #5 strict rule): `borderRadius`/
 * `marginBottom` read from Astryx's `radiusVars`/`spacingVars` instead of literal px, snapped to
 * the nearest spacing step where it fell between two (14 -> 12, ties round down per the existing
 * repo convention - see MomentPalette.styles.ts's 10 -> 8). `--radius-element` (not `--container`)
 * matches the same-shaped real video-preview panel in VideoPreview.styles.ts's `videoPreview`.
 * Structural sizing (`maxWidth: 360`, the 16/9 aspect ratio) stays literal.
 */
export const styles = stylex.create({
  previewStage: {
    position: "relative",
    width: "100%",
    maxWidth: 360,
    aspectRatio: "16 / 9",
    backgroundColor: "var(--stage-bg)",
    borderRadius: radiusVars["--radius-element"],
    overflow: "hidden",
    containerType: "inline-size",
    marginBottom: spacingVars["--spacing-3"],
  },
  previewThumb: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
});
