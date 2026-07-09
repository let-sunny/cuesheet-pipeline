import * as stylex from "@stylexjs/stylex";

/**
 * Component anatomy migration (docs/styling-migration.md) — rules ported 1:1 from the old
 * `.subtitle-style-preview-*`/`.narration-guide` classes in styles.css (all owned solely by this
 * file's components - SubtitleStyleSettings/NarrationSettings/the private preview-stage helper).
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
  narrationGuide: {
    margin: "0 0 12px",
    fontSize: 12,
    lineHeight: 1.5,
    color: "var(--text-tertiary)",
  },
});
