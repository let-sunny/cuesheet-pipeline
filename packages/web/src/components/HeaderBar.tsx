import { Button } from "@astryxdesign/core/Button";

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
}

/** 슬림 고정 헤더: 프로젝트명, dirty 표시, 실행취소/재실행/저장/렌더/설정 버튼. */
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
}: Props) {
  return (
    <div className="header-row">
      <div className="header-title-group">
        <h1>{projectName || "(이름 없음)"}</h1>
        {dirty ? <span className="dirty-badge">저장 안 됨</span> : null}
      </div>
      <div className="save-row">
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
