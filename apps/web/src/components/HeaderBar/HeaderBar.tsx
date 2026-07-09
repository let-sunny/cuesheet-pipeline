import type { ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@astryxdesign/core/Button";
import type { ThemeModeSetting } from "../../lib/theme.js";
import { styles } from "./HeaderBar.styles.js";

interface Props {
  projectName: string;
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
  onToggleShortcuts,
}: Props) {
  return (
    <div {...stylex.props(styles.row)}>
      <div {...stylex.props(styles.titleGroup)}>
        <h1 {...stylex.props(styles.title)}>{projectName || "(no name)"}</h1>
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

/** System/Light/Dark 3-way theme toggle — reports the clicked value straight up to the parent
    (Root in main.tsx), which remembers it in localStorage and then applies it to Astryx's <Theme mode>. */
function ThemeModeToggle({
  themeMode,
  onThemeModeChange,
}: {
  themeMode: ThemeModeSetting;
  onThemeModeChange: (mode: ThemeModeSetting) => void;
}) {
  const wrapperStyle = stylex.props(styles.themeToggle);
  return (
    <div
      className={`theme-mode-toggle ${wrapperStyle.className ?? ""}`}
      style={wrapperStyle.style}
      role="group"
      aria-label="Theme"
    >
      {THEME_MODE_OPTIONS.map((option) => {
        const isActive = option.value === themeMode;
        return (
          <button
            type="button"
            key={option.value}
            className={`plain-button${isActive ? " active" : ""}`}
            onClick={() => onThemeModeChange(option.value)}
            title={option.label}
          >
            {option.icon}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

const THEME_MODE_OPTIONS: Array<{ value: ThemeModeSetting; label: string; icon: ReactNode }> = [
  {
    value: "system",
    label: "System",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="13" rx="2" />
        <path d="M8 21h8M12 17v4" strokeLinecap="round" />
      </svg>
    ),
  },
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
