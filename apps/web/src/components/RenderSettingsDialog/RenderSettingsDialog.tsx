import * as stylex from "@stylexjs/stylex";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { Button } from "@astryxdesign/core/Button";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import type { Project } from "@cuesheet/schema";
import { formatClock } from "../../lib/segmentTiming.js";
import { styles } from "./RenderSettingsDialog.styles.js";

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
            {/* "render-dialog" stays a literal className (in addition to the migrated stylex
                properties) because styles.css's `.render-dialog .settings-group` override still
                needs it as an ancestor selector hook — `.settings-group` itself is a shared class
                used by several not-yet-migrated components, so it isn't being touched here. */}
            <div
              className={`render-dialog ${stylex.props(styles.dialog).className}`}
              data-testid="render-dialog"
            >
              <div className="settings-group">
                <h3>Resolution</h3>
                {/* Resolution preset toggle (2026-07-11 stock-component migration) - a stock Astryx
                    SegmentedControl replaces the old raw `.plain-button` row. SegmentedControlItem
                    doesn't forward `data-testid` (see CLAUDE.md's CheckboxInput footgun note), so
                    the old render-dialog-resolution-* testids are gone - tests select by role/name
                    instead. */}
                <SegmentedControl
                  value={`${project.width}x${project.height}`}
                  onChange={(v) => {
                    const preset = RESOLUTION_PRESETS.find((p) => `${p.width}x${p.height}` === v);
                    if (preset) {
                      handlePickResolution(preset.width, preset.height);
                    }
                  }}
                  label="Resolution"
                  size="sm"
                >
                  {RESOLUTION_PRESETS.map((preset) => (
                    <SegmentedControlItem key={preset.label} value={`${preset.width}x${preset.height}`} label={preset.label} />
                  ))}
                </SegmentedControl>
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
                {/* CheckboxInput doesn't forward data-* props to the DOM - select by role/name in
                    tests: getByRole("checkbox", { name: "Export without subtitles (for CC)" }). */}
                <CheckboxInput
                  label="Export without subtitles (for CC)"
                  value={noBurnSubtitles}
                  onChange={onToggleNoBurnSubtitles}
                />
              </div>

              <div className="settings-group">
                <h3>Summary</h3>
                <p {...stylex.props(styles.summaryLine)}>Project: {project.name || "(no name)"}</p>
                <p {...stylex.props(styles.summaryLine)}>Resolution: {project.width}x{project.height}</p>
                <p {...stylex.props(styles.summaryLine)}>Cuts: {segmentCount}</p>
                <p {...stylex.props(styles.summaryLine)}>Estimated output length: {formatClock(outputSeconds, true)}</p>
              </div>

              {dirty ? (
                <p className="render-note render-note-error">
                  You have unsaved edits — save first, then export.
                </p>
              ) : null}

              <div {...stylex.props(styles.actions)}>
                <Button
                  label="Cancel"
                  variant="secondary"
                  onClick={() => onOpenChange(false)}
                  data-testid="render-dialog-cancel"
                />
                <Button
                  label={rendering ? "Exporting…" : "Start export"}
                  variant="primary"
                  isDisabled={dirty || rendering}
                  onClick={handleStart}
                  data-testid="render-dialog-start"
                />
              </div>
            </div>
          </LayoutContent>
        }
      />
    </Dialog>
  );
}

/** localStorage key that remembers the resolution preset picked in the dialog (referenced next time it opens). */
const LAST_RESOLUTION_KEY = "cuesheet-render-last-resolution";

const RESOLUTION_PRESETS = [
  { label: "1280x720", width: 1280, height: 720 },
  { label: "1920x1080", width: 1920, height: 1080 },
  { label: "3840x2160 (4K)", width: 3840, height: 2160 },
] as const;
