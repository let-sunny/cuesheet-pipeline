import * as stylex from "@stylexjs/stylex";

/**
 * Component anatomy migration (docs/styling-migration.md, StyleX migration batch 3). Only the
 * rules owned solely by this component move here — most of `SegmentQuickFields`'s classes are the
 * shared `.qf-*` grid tokens (`.quick-fields`/`.qf-panel-title`/`.qf-group`/`.qf-group-label`/
 * `.qf-row`/`.qf-field`/`.qf-suffix`/`.qf-readonly`/`.qf-note`/`.qf-danger-zone`) reused by
 * BgmSettingsPanel/ProjectMetaFields/SubtitleStylePresetsSettings/SegmentStyleOverride, plus the
 * `.field-narrow`/`.field-medium`/`.field-full` width tokens and `.narration-empty-note` (shared
 * with BgmSettingsPanel/IntroOutroEditor) — all of those stay in styles.css.
 *
 * Also NOT migrated (stays plain CSS, see styles.css): `.qf-actions-row` — it overrides the shared
 * `.qf-row`'s `gap` (16px -> 8px) at equal specificity (both single classes), winning today only
 * by being later in styles.css's source order. This app's StyleX output is injected *before*
 * styles.css, so moving `.qf-actions-row`'s `gap` into a StyleX atomic class would lose that same
 * cascade tie to `.qf-row` (same root cause as HeaderBar's theme toggle / BgmSettingsPanel's
 * bgm-file-play/name — see HeaderBar.styles.ts's comment). The div keeps both plain classNames
 * (`qf-row qf-actions-row`) unchanged.
 *
 * `.qf-subtitle-field textarea`'s one property (`resize: vertical`) moves in as `subtitleTextarea`
 * below, applied directly to the textarea itself (this component already owns that element
 * directly in JSX, so there's no need for the old descendant selector, and no conflict with
 * `.plain-field`/`.plain-field-textarea` since neither sets `resize`) — the wrapping
 * `qf-subtitle-field` className is dropped from the label.
 *
 * `border` shorthand written as its longhand equivalents (`borderTopWidth`/`borderTopStyle`/
 * `borderTopColor`) — see HeaderBar.styles.ts's comment for why (StyleX silently drops the
 * shorthand form).
 */
export const styles = stylex.create({
  readonlyValue: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "auto",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: 13,
    color: "var(--text-primary)",
  },
  noteNeutral: {
    margin: "4px 0 0",
    fontSize: 12,
    color: "var(--text-secondary)",
  },
  transition: {
    marginBottom: 10,
  },
  subtitleTextarea: {
    resize: "vertical",
  },
  narrationWarning: {
    margin: "4px 0 0",
    fontSize: 12,
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
