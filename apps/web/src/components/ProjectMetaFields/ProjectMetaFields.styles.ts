import * as stylex from "@stylexjs/stylex";

/**
 * Component anatomy migration (docs/styling-migration.md) — every class this component renders
 * (`.settings-group`, `.settings-field`, `.field-text-medium`, `.field-narrow`, `.plain-field`,
 * `.qf-note`) is a shared width-token/marker class also used by other, not-yet-migrated
 * components (FinishingSettings, IntroOutroEditor, RenderSettingsDialog, SegmentQuickFields,
 * etc.) — see the doc's "find every rule the component owns" step. None of them are owned solely
 * by ProjectMetaFields, so there is nothing to move out yet; those tokens stay in styles.css
 * until every consumer is migrated. This file stays as an intentionally empty placeholder (same
 * degenerate case as StepNav/StepNav.styles.ts) so the folder anatomy is uniform.
 */
export const styles = stylex.create({});
