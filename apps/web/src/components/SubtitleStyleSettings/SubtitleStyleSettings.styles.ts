import * as stylex from "@stylexjs/stylex";

/**
 * Component anatomy migration (docs/styling-migration.md) — rules ported 1:1 from the old
 * `.subtitle-style-preview-*` classes in styles.css (owned solely by this file's components -
 * SubtitleStyleSettings and its private preview-stage helper). Split out of the old shared
 * `FinishingSettings/` folder once SubtitleStyleSettings/NarrationSettings became separate
 * per-section components (CLAUDE.md's "groups are components, panels are arrangements" rule,
 * applied to the Export step's sections).
 *
 * Left behind in styles.css (not migrated): `.settings-group`/`.settings-group-wide`/
 * `.settings-field`/`.field-*`/`.plain-field`/`.color-field-inputs`/`.settings-note`/`.wide-input`
 * (shared width-token/marker classes used by several not-yet-migrated components) and
 * `.video-subtitle-overlay*` (shared with VideoPreview/SequencePlayer's actual video overlay -
 * this preview stage intentionally reuses those classes so it can never visually drift from the
 * real thing, see the component doc comment). `.swatch` was migrated separately (batch 4) into
 * its own `components/Swatch/` component, used here via `<Swatch color={...} />`.
 */
export const styles = stylex.create({
  previewStage: {
    position: "relative",
    width: "100%",
    maxWidth: 360,
    aspectRatio: "16 / 9",
    backgroundColor: "var(--stage-bg)",
    borderRadius: 6,
    overflow: "hidden",
    containerType: "inline-size",
    marginBottom: 14,
  },
  previewThumb: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
});
