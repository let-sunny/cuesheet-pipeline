import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { Button } from "@astryxdesign/core/Button";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import type { Project } from "@cuesheet/schema";

/** localStorage key that remembers the resolution preset picked in the dialog (referenced next time it opens). */
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
  /** Blocks the render from starting and shows guidance if there are unsaved edits (same convention as the old render button). */
  dirty: boolean;
  rendering: boolean;
  segmentCount: number;
  /** Approximate sum of segment (out-in)/speed in seconds — intro/outro are excluded since they're unknown without file probing. */
  outputSeconds: number;
  noBurnSubtitles: boolean;
  onToggleNoBurnSubtitles: (checked: boolean) => void;
  onChangeResolution: (width: number, height: number) => void;
  onStartRender: () => void;
}

/**
 * Settings dialog that opens when the Export (formerly "Render") button is clicked — lets you
 * check the resolution preset (reflected into project.width/height), whether to burn in
 * subtitles, and a summary (cut count/output length/project name), then kicks off the actual
 * export with [Start export]. Replaces the old one-click trigger.
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
      // Silently ignore if localStorage isn't accessible (best-effort feature).
    }
  }

  function handleStart() {
    onStartRender();
    onOpenChange(false);
  }

  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} width={480}>
      <Layout
        header={<DialogHeader title="Export" onOpenChange={onOpenChange} />}
        content={
          <LayoutContent>
            <div className="render-dialog">
              <div className="settings-group">
                <h3>Resolution</h3>
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
                    Current setting: {project.width}x{project.height} (custom)
                  </p>
                ) : null}
                {project.width === 3840 && project.height === 2160 ? (
                  <p className="render-note">
                    4K takes much longer to export (roughly 3-5x for native 4K sources).
                  </p>
                ) : null}
              </div>

              <div className="settings-group">
                <h3>Subtitles</h3>
                <CheckboxInput
                  label="Export without subtitles (for CC)"
                  value={noBurnSubtitles}
                  onChange={onToggleNoBurnSubtitles}
                />
              </div>

              <div className="settings-group">
                <h3>Summary</h3>
                <p className="render-dialog-summary-line">Project: {project.name || "(no name)"}</p>
                <p className="render-dialog-summary-line">Resolution: {project.width}x{project.height}</p>
                <p className="render-dialog-summary-line">Cuts: {segmentCount}</p>
                <p className="render-dialog-summary-line">Estimated output length: {formatDuration(outputSeconds)}</p>
              </div>

              {dirty ? (
                <p className="render-note render-note-error">
                  You have unsaved edits — save first, then export.
                </p>
              ) : null}

              <div className="render-dialog-actions">
                <Button label="Cancel" variant="secondary" onClick={() => onOpenChange(false)} />
                <Button
                  label={rendering ? "Exporting…" : "Start export"}
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
