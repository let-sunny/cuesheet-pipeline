import * as stylex from "@stylexjs/stylex";

/**
 * Component anatomy migration (docs/styling-migration.md, StyleX migration batch 5) — rules ported
 * 1:1 from the old `.crop-edit-*` classes in styles.css (all owned solely by this component; no
 * `.plain-button`/`.plain-field` marker collisions since every element here is a plain `<div>`).
 *
 * Colors are deliberately fixed hex/rgba values regardless of theme (not `var(--...)` tokens) —
 * this overlay sits directly on actual video pixels, so it needs to read consistently against
 * arbitrary footage rather than following the app's own light/dark theme (ported as-is from the
 * original comment in styles.css).
 */
export const styles = stylex.create({
  overlay: {
    position: "absolute",
    inset: 0,
    overflow: "hidden",
    touchAction: "none",
  },
  box: {
    position: "absolute",
    boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.6)",
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: "#f0a34a",
    cursor: "move",
    touchAction: "none",
  },
  handle: {
    position: "absolute",
    width: 12,
    height: 12,
    backgroundColor: "#e6e8ee",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#f0a34a",
    borderRadius: 2,
    touchAction: "none",
  },
  handleNw: {
    top: -6,
    left: -6,
    cursor: "nwse-resize",
  },
  handleN: {
    top: -6,
    left: "calc(50% - 6px)",
    cursor: "ns-resize",
  },
  handleNe: {
    top: -6,
    right: -6,
    cursor: "nesw-resize",
  },
  handleE: {
    top: "calc(50% - 6px)",
    right: -6,
    cursor: "ew-resize",
  },
  handleSe: {
    bottom: -6,
    right: -6,
    cursor: "nwse-resize",
  },
  handleS: {
    bottom: -6,
    left: "calc(50% - 6px)",
    cursor: "ns-resize",
  },
  handleSw: {
    bottom: -6,
    left: -6,
    cursor: "nesw-resize",
  },
  handleW: {
    top: "calc(50% - 6px)",
    left: -6,
    cursor: "ew-resize",
  },
});
