import * as stylex from "@stylexjs/stylex";

/**
 * Component anatomy migration (docs/styling-migration.md) — split out of the old shared
 * `FinishingSettings/` folder once SubtitleStyleSettings/NarrationSettings became separate
 * per-section components (CLAUDE.md's "groups are components, panels are arrangements" rule,
 * applied to the Export step's sections).
 */
export const styles = stylex.create({
  narrationGuide: {
    margin: "0 0 12px",
    fontSize: 12,
    lineHeight: 1.5,
    color: "var(--text-tertiary)",
  },
});
