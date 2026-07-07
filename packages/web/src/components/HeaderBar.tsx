import type { ReactNode } from "react";
import { Button } from "@astryxdesign/core/Button";
import type { ThemeModeSetting } from "../theme.js";

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
  onOpenSettings: () => void;
  themeMode: ThemeModeSetting;
  onThemeModeChange: (mode: ThemeModeSetting) => void;
}

const THEME_MODE_OPTIONS: Array<{ value: ThemeModeSetting; label: string; icon: ReactNode }> = [
  {
    value: "system",
    label: "시스템",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="13" rx="2" />
        <path d="M8 21h8M12 17v4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    value: "light",
    label: "라이트",
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
    label: "다크",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" strokeLinejoin="round" />
      </svg>
    ),
  },
];

/** 시스템/라이트/다크 3단 테마 토글 — 클릭한 값을 그대로 상위(main.tsx의 Root)에 알리고,
    거기서 localStorage에 기억한 뒤 Astryx <Theme mode>에 반영한다. */
function ThemeModeToggle({
  themeMode,
  onThemeModeChange,
}: {
  themeMode: ThemeModeSetting;
  onThemeModeChange: (mode: ThemeModeSetting) => void;
}) {
  return (
    <div className="theme-mode-toggle" role="group" aria-label="테마">
      {THEME_MODE_OPTIONS.map((option) => (
        <button
          type="button"
          key={option.value}
          className={option.value === themeMode ? "active" : ""}
          onClick={() => onThemeModeChange(option.value)}
          title={option.label}
        >
          {option.icon}
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
}

/** 슬림 고정 헤더: 프로젝트명, dirty 표시, 테마 토글, 실행취소/재실행/저장/렌더/설정 버튼. */
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
  onOpenSettings,
  themeMode,
  onThemeModeChange,
}: Props) {
  return (
    <div className="header-row">
      <div className="header-title-group">
        <h1>{projectName || "(이름 없음)"}</h1>
        {dirty ? <span className="dirty-badge">저장 안 됨</span> : null}
      </div>
      <div className="save-row">
        <ThemeModeToggle themeMode={themeMode} onThemeModeChange={onThemeModeChange} />
        <Button label="실행 취소" variant="ghost" isDisabled={!canUndo} onClick={onUndo} />
        <Button label="다시 실행" variant="ghost" isDisabled={!canRedo} onClick={onRedo} />
        <Button label="설정" variant="ghost" onClick={onOpenSettings} />
        <Button
          label={saving ? "저장 중…" : "저장"}
          variant="secondary"
          isDisabled={saving}
          onClick={onSave}
        />
        <Button
          label={rendering ? `렌더 중… ${renderProgress ?? 0}%` : "렌더"}
          variant="primary"
          isDisabled={renderDisabled}
          onClick={onRender}
        />
      </div>
    </div>
  );
}
