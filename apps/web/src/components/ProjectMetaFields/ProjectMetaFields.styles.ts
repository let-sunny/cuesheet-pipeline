import * as stylex from "@stylexjs/stylex";

/**
 * Astryx catalog migration (Finish/Export step rebuild, docs/design-principles.md) — this
 * component now composes stock `FormLayout`/`Field`/`TextInput` (see ProjectMetaFields.tsx)
 * instead of the hand-rolled `.settings-field`/`.plain-field` markup. The only remaining raw
 * elements are the `<input>`s bound to `useNumericField` (FPS/Width/Height/Fade), which keep the
 * `.plain-field` class for its basic bordered-input chrome - that class (along with
 * `.settings-group`, `.field-text-medium`, `.field-narrow`, `.qf-note`) is still owned by other,
 * not-yet-migrated components (NarrationSettings, RenderSettingsDialog, SegmentQuickFields, etc.),
 * so it stays in styles.css rather than moving here. This file stays as an intentionally empty
 * placeholder (same degenerate case as StepNav/StepNav.styles.ts) so the folder anatomy is
 * uniform.
 */
export const styles = stylex.create({});
