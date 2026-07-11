import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";

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
    <VStack gap={3} data-testid="export-section-cta">
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
        <Banner
          status="success"
          title="Export complete"
          endContent={
            <a href={`/${renderState.path}`} download>
              Download {renderState.path}
            </a>
          }
        />
      ) : null}
      {renderState.status === "error" ? (
        // The full ffmpeg dump renders as Banner's collapsible content (expand/collapse toggle
        // appears automatically once children are passed) - collapsed by default, same as the old
        // <details>/<summary>, so the short title always shows and the long dump only on demand.
        <Banner status="error" title={`Export failed: ${renderState.error}`}>
          {renderState.errorDetail ? <pre>{renderState.errorDetail}</pre> : null}
        </Banner>
      ) : null}
      <Text type="supporting" color="secondary">
        Export runs against the cuesheet that was saved when it started — edits/saves made while exporting won't be included in this export.
      </Text>

      <Button
        label="Download subtitles (.srt)"
        variant="secondary"
        isDisabled={dirty}
        onClick={onDownloadSrt}
        data-testid="export-download-srt"
      />
      {dirty ? (
        <Text type="supporting" color="secondary">
          Subtitles are based on the cuesheet saved to disk — save first, then download.
        </Text>
      ) : null}
    </VStack>
  );
}
