import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { Button } from "@astryxdesign/core/Button";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import type { Project } from "@cuesheet/schema";

/** 다이얼로그에서 고른 해상도 프리셋을 기억해 두는 localStorage 키(다음에 열 때 참고용). */
const LAST_RESOLUTION_KEY = "cuesheet-render-last-resolution";

const RESOLUTION_PRESETS = [
  { label: "1280x720", width: 1280, height: 720 },
  { label: "1920x1080", width: 1920, height: 1080 },
  { label: "3840x2160 (4K)", width: 3840, height: 2160 },
] as const;

function formatDuration(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds) && totalSeconds > 0 ? totalSeconds : 0;
  const m = Math.floor(safe / 60);
  const s = Math.round(safe % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

interface Props {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  project: Project;
  /** 저장 안 된 편집이 있으면 렌더 시작을 막고 안내한다(기존 렌더 버튼과 동일한 규약). */
  dirty: boolean;
  rendering: boolean;
  segmentCount: number;
  /** 세그먼트 (out-in)/speed 합 근사치(초) — intro/outro는 파일 프로빙 없이 알 수 없어 제외. */
  outputSeconds: number;
  noBurnSubtitles: boolean;
  onToggleNoBurnSubtitles: (checked: boolean) => void;
  onChangeResolution: (width: number, height: number) => void;
  onStartRender: () => void;
}

/**
 * 내보내기(옛 "렌더") 버튼 클릭 시 뜨는 설정 다이얼로그 — 해상도 프리셋
 * (project.width/height 반영), 자막 굽기 여부, 요약(컷 수·출력 길이·프로젝트명)을
 * 확인하고 [내보내기 시작]으로 실제 내보내기를 건다. 기존 원클릭 발사를 대체한다.
 */
export function RenderSettingsDialog({
  isOpen,
  onOpenChange,
  project,
  dirty,
  rendering,
  segmentCount,
  outputSeconds,
  noBurnSubtitles,
  onToggleNoBurnSubtitles,
  onChangeResolution,
  onStartRender,
}: Props) {
  function handlePickResolution(width: number, height: number) {
    if (project.width !== width || project.height !== height) {
      onChangeResolution(width, height);
    }
    try {
      localStorage.setItem(LAST_RESOLUTION_KEY, `${width}x${height}`);
    } catch {
      // localStorage 접근 불가 시 조용히 무시한다(best-effort 기능).
    }
  }

  function handleStart() {
    onStartRender();
    onOpenChange(false);
  }

  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} width={480}>
      <Layout
        header={<DialogHeader title="내보내기" onOpenChange={onOpenChange} />}
        content={
          <LayoutContent>
            <div className="render-dialog">
              <div className="settings-group">
                <h3>해상도</h3>
                <div className="render-resolution-options">
                  {RESOLUTION_PRESETS.map((preset) => (
                    <button
                      type="button"
                      key={preset.label}
                      className={
                        project.width === preset.width && project.height === preset.height ? "active" : ""
                      }
                      onClick={() => handlePickResolution(preset.width, preset.height)}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                {!RESOLUTION_PRESETS.some((p) => p.width === project.width && p.height === project.height) ? (
                  <p className="render-note">
                    현재 설정: {project.width}x{project.height}(사용자 지정)
                  </p>
                ) : null}
                {project.width === 3840 && project.height === 2160 ? (
                  <p className="render-note">
                    4K는 내보내기 시간이 크게 늘어납니다 (원본 4K 기준 약 3~5배).
                  </p>
                ) : null}
              </div>

              <div className="settings-group">
                <h3>자막</h3>
                <CheckboxInput
                  label="자막 없는 영상으로 내보내기 (CC용)"
                  value={noBurnSubtitles}
                  onChange={onToggleNoBurnSubtitles}
                />
              </div>

              <div className="settings-group">
                <h3>요약</h3>
                <p className="render-dialog-summary-line">프로젝트: {project.name || "(이름 없음)"}</p>
                <p className="render-dialog-summary-line">해상도: {project.width}x{project.height}</p>
                <p className="render-dialog-summary-line">컷 수: {segmentCount}개</p>
                <p className="render-dialog-summary-line">출력 길이(예상): {formatDuration(outputSeconds)}</p>
              </div>

              {dirty ? (
                <p className="render-note render-note-error">
                  저장하지 않은 편집이 있어요 — 먼저 저장한 뒤 내보낼 수 있습니다.
                </p>
              ) : null}

              <div className="render-dialog-actions">
                <Button label="취소" variant="ghost" onClick={() => onOpenChange(false)} />
                <Button
                  label={rendering ? "내보내는 중…" : "내보내기 시작"}
                  variant="primary"
                  isDisabled={dirty || rendering}
                  onClick={handleStart}
                />
              </div>
            </div>
          </LayoutContent>
        }
      />
    </Dialog>
  );
}
