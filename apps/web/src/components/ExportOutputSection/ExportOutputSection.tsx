import { Button } from "@astryxdesign/core/Button";

export type RenderState =
  | { status: "idle" }
  | { status: "rendering"; progress: number }
  | { status: "success"; path: string }
  // errorDetail (the full raw ffmpeg dump) is optional and shown separately, in a collapsible -
  // error itself is always the short extracted summary, so it never needs to duplicate the dump.
  | { status: "error"; error: string; errorDetail?: string };

export interface ExportOutputSectionProps {
  dirty: boolean;
  renderState: RenderState;
  onOpenRenderDialog: () => void;
  onDownloadSrt: () => void;
}

/**
 * "Output" section of the Export step (③) - the step's one primary action ([Export], which opens
 * the render settings dialog - the actual gate/start lives there) plus [Download subtitles .srt]
 * (secondary) and the current render's result/error, screen-spec section 5.
 */
export function ExportOutputSection({ dirty, renderState, onOpenRenderDialog, onDownloadSrt }: ExportOutputSectionProps) {
  return (
    <div className="render-cta" data-testid="export-section-cta">
      <Button
        label={renderState.status === "rendering" ? `Exporting… ${renderState.progress}%` : "Export"}
        variant="primary"
        size="lg"
        // Lets the dialog open even while dirty — same convention as HeaderBar renderDisabled (the
        // dirty warning + [Start export] disabling inside RenderSettingsDialog is the actual final gate).
        isDisabled={renderState.status === "rendering"}
        onClick={onOpenRenderDialog}
        data-testid="export-button"
      />
      {renderState.status === "success" ? (
        <a href={`/${renderState.path}`} download>
          Download {renderState.path}
        </a>
      ) : null}
      {renderState.status === "error" ? (
        <div className="render-error-block">
          <span className="render-note render-note-error">Export failed: {renderState.error}</span>
          {renderState.errorDetail ? (
            <details className="render-error-detail">
              <summary>Show full ffmpeg output</summary>
              <pre>{renderState.errorDetail}</pre>
            </details>
          ) : null}
        </div>
      ) : null}
      <span className="render-note">
        Export runs against the cuesheet that was saved when it started — edits/saves made while exporting won't be included in this export.
      </span>

      <Button
        label="Download subtitles (.srt)"
        variant="secondary"
        isDisabled={dirty}
        onClick={onDownloadSrt}
        data-testid="export-download-srt"
      />
      {dirty ? (
        <span className="render-note">
          Subtitles are based on the cuesheet saved to disk — save first, then download.
        </span>
      ) : null}
    </div>
  );
}
