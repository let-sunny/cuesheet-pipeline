import * as stylex from "@stylexjs/stylex";
import { textSizeVars } from "@astryxdesign/core/theme/tokens.stylex";

/**
 * Component anatomy migration (docs/styling-migration.md, StyleX migration batch 3). Only the
 * rules owned solely by the Narration block (kept inline in SegmentQuickFields.tsx, see its doc
 * comment for why it isn't its own group component) live here now — the Range/Transitions/
 * Subtitle groups' own styles (`readonlyValue`/`noteNeutral`/`transition`/`subtitleTextarea`)
 * moved out to their own `<Group>.styles.ts` files alongside this panel's decomposition into
 * group components. Most of `SegmentQuickFields`'s classes are the shared `.qf-*` grid tokens
 * (`.quick-fields`/`.qf-panel-title`/`.qf-group`/`.qf-group-label`/`.qf-row`/`.qf-field`/
 * `.qf-suffix`/`.qf-readonly`/`.qf-note`/`.qf-danger-zone`) reused by BgmSettingsPanel/
 * ProjectMetaFields/SubtitleStylePresetsSettings/SegmentStyleOverride, plus the `.field-narrow`/
 * `.field-medium`/`.field-full` width tokens and `.narration-empty-note` (shared with
 * BgmSettingsPanel/IntroOutroEditor) — all of those stay in styles.css.
 *
 * Also NOT migrated (stays plain CSS, see styles.css): `.qf-actions-row` — it overrides the shared
 * `.qf-row`'s `gap` (16px -> 8px) at equal specificity (both single classes), winning today only
 * by being later in styles.css's source order. This app's StyleX output is injected *before*
 * styles.css, so moving `.qf-actions-row`'s `gap` into a StyleX atomic class would lose that same
 * cascade tie to `.qf-row` (same root cause as HeaderBar's theme toggle / BgmSettingsPanel's
 * bgm-file-play/name — see HeaderBar.styles.ts's comment). ActionsGroup's div keeps both plain
 * classNames (`qf-row qf-actions-row`) unchanged.
 *
 * `border` shorthand written as its longhand equivalents (`borderTopWidth`/`borderTopStyle`/
 * `borderTopColor`) — see HeaderBar.styles.ts's comment for why (StyleX silently drops the
 * shorthand form).
 */
export const styles = stylex.create({
  narrationWarning: {
    margin: "4px 0 0",
    fontSize: textSizeVars["--font-size-sm"],
    color: "var(--warning-text)",
  },
  narrationPreview: {
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopStyle: "dashed",
    borderTopColor: "var(--border-dashed)",
  },
  narrationAudio: {
    width: "100%",
    height: 32,
  },
});
