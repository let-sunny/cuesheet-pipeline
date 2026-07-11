import type { ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@astryxdesign/core/Button";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Selector } from "@astryxdesign/core/Selector";
import type { ThemeModeSetting, ThemeName } from "../../lib/theme.js";
import { useEditableTitle } from "../../hooks/useEditableTitle.js";
import { styles } from "./HeaderBar.styles.js";

interface Props {
  projectName: string;
  onProjectNameChange: (name: string) => void;
  dirty: boolean;
  saving: boolean;
  rendering: boolean;
  renderProgress: number | null;
  renderDisabled: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onRender: () => void;
  themeMode: ThemeModeSetting;
  onThemeModeChange: (mode: ThemeModeSetting) => void;
  themeName: ThemeName;
  onThemeNameChange: (name: ThemeName) => void;
  onToggleShortcuts: () => void;
}

/**
 * Slim fixed header (screen-spec section 1): [app name] ... [Undo][Redo] | [theme toggle][?]
 * | [Save (dirty dot)][Export] — the far right holds the primary actions (Save/Export).
 *
 * Dirty-state emphasis (screen-spec section 1, 2026-07-09 addition): while there are unsaved
 * edits, losing them is the higher-stakes outcome than a slightly later export, so Save takes
 * over as the one primary action and Export steps down to secondary; once saved (clean), Export
 * reverts to primary and Save becomes a quiet secondary action. This still satisfies the
 * one-primary-per-group rule (section 6) — the group's primary just changes with dirty state
 * instead of always sitting on Export.
 */
export function HeaderBar({
  projectName,
  onProjectNameChange,
  dirty,
  saving,
  rendering,
  renderProgress,
  renderDisabled,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onSave,
  onRender,
  themeMode,
  onThemeModeChange,
  themeName,
  onThemeNameChange,
  onToggleShortcuts,
}: Props) {
  const titleEdit = useEditableTitle({ value: projectName, onCommit: onProjectNameChange });

  return (
    <div {...stylex.props(styles.row)}>
      <div {...stylex.props(styles.titleGroup)}>
        {titleEdit.editing ? (
          <input
            type="text"
            value={titleEdit.text}
            onChange={titleEdit.onChange}
            onBlur={titleEdit.onBlur}
            onKeyDown={titleEdit.onKeyDown}
            aria-label="Project name"
            autoFocus
            {...stylex.props(styles.title, styles.titleInput)}
            data-testid="project-title-input"
          />
        ) : (
          <h1
            {...stylex.props(styles.title, styles.titleEditable)}
            onClick={titleEdit.startEditing}
            title="Click to rename"
            data-testid="project-title"
          >
            {projectName || "(no name)"}
          </h1>
        )}
        {dirty ? (
          <span {...stylex.props(styles.dirtyBadge)} title="Click Save to write it to disk">
            ● Unsaved
          </span>
        ) : null}
      </div>
      <div {...stylex.props(styles.saveRow)}>
        <Button label="Undo" variant="ghost" size="sm" isDisabled={!canUndo} onClick={onUndo} data-testid="header-undo" />
        <Button label="Redo" variant="ghost" size="sm" isDisabled={!canRedo} onClick={onRedo} data-testid="header-redo" />

        <span {...stylex.props(styles.divider)} aria-hidden="true" />

        <ThemeSwitcher themeName={themeName} onThemeNameChange={onThemeNameChange} />
        <ThemeModeToggle themeMode={themeMode} onThemeModeChange={onThemeModeChange} />
        <Button label="?" variant="ghost" size="sm" tooltip="Keyboard shortcuts" onClick={onToggleShortcuts} />

        <span {...stylex.props(styles.divider)} aria-hidden="true" />

        <Button
          label={saving ? "Saving…" : "Save"}
          variant={dirty ? "primary" : "secondary"}
          size="sm"
          isDisabled={saving}
          tooltip={dirty ? "Click Save to write it to disk" : undefined}
          onClick={onSave}
          data-testid="header-save"
        />
        <Button
          label={rendering ? `Exporting… ${renderProgress ?? 0}%` : "Export"}
          variant={dirty ? "secondary" : "primary"}
          size="sm"
          isDisabled={renderDisabled}
          onClick={onRender}
          data-testid="header-render"
        />
      </div>
    </div>
  );
}

/**
 * THEME (stone/y2k/neutral) switcher — a quiet, dev/validation-only affordance (design-
 * principles.md #5's stock-audit) for flipping which Astryx theme package is active so hardcoded
 * (non-token) colors become visible (they're the elements that DON'T recolor when this changes).
 * Astryx's own `ThemeSwitcher` template (`astryx template ThemeSwitcher`) uses exactly this
 * Selector pattern for this exact purpose, so it's adopted as-is rather than a SegmentedControl -
 * Selector's own guidance is "don't use SegmentedControl for more than 2 options", and this is 3.
 * Reports the picked value straight up to the parent (Root in main.tsx), which remembers it in
 * localStorage and then swaps the theme object passed to Astryx's <Theme theme>.
 */
function ThemeSwitcher({
  themeName,
  onThemeNameChange,
}: {
  themeName: ThemeName;
  onThemeNameChange: (name: ThemeName) => void;
}) {
  return (
    // Labeled "Astryx theme" (not "Theme") - the adjacent light/dark toggle already uses "Theme"
    // as its own accessible name, and the two must stay distinguishable for screen reader users.
    <Selector
      label="Astryx theme"
      isLabelHidden
      size="sm"
      value={themeName}
      options={THEME_NAME_OPTIONS}
      onChange={(v) => onThemeNameChange(v as ThemeName)}
      data-testid="theme-switcher"
    />
  );
}

/** Light/Dark theme toggle — reports the clicked value straight up to the parent
    (Root in main.tsx), which remembers it in localStorage and then applies it to Astryx's <Theme mode>. */
function ThemeModeToggle({
  themeMode,
  onThemeModeChange,
}: {
  themeMode: ThemeModeSetting;
  onThemeModeChange: (mode: ThemeModeSetting) => void;
}) {
  return (
    <SegmentedControl
      value={themeMode}
      onChange={(v) => onThemeModeChange(v as ThemeModeSetting)}
      label="Theme"
      size="sm"
    >
      {THEME_MODE_OPTIONS.map((option) => (
        <SegmentedControlItem key={option.value} value={option.value} label={option.label} icon={option.icon} />
      ))}
    </SegmentedControl>
  );
}

const THEME_NAME_OPTIONS: Array<{ value: ThemeName; label: string }> = [
  { value: "stone", label: "Stone" },
  { value: "y2k", label: "Y2K" },
  { value: "neutral", label: "Neutral" },
];

const THEME_MODE_OPTIONS: Array<{ value: ThemeModeSetting; label: string; icon: ReactNode }> = [
  {
    value: "light",
    label: "Light",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="4" />
        <path
          d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    value: "dark",
    label: "Dark",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" strokeLinejoin="round" />
      </svg>
    ),
  },
];
