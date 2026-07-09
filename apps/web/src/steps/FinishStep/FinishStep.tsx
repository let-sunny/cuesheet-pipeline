import { Button } from "@astryxdesign/core/Button";
import type { CueSheet } from "@cuesheet/schema";
import type { UseFinishStepActionsResult } from "../../hooks/useFinishStepActions.js";
import { ProjectMetaFields } from "../../components/ProjectMetaFields/index.js";
import { SubtitleStyleSettings, NarrationSettings } from "../../components/FinishingSettings/index.js";
import { SubtitleStylePresetsSettings } from "../../components/SubtitleStylePresetsSettings.js";
import { IntroOutroEditor } from "../../components/IntroOutroEditor/index.js";

export type RenderState =
  | { status: "idle" }
  | { status: "rendering"; progress: number }
  | { status: "success"; path: string }
  // errorDetail (the full raw ffmpeg dump) is optional and shown separately, in a collapsible -
  // error itself is always the short extracted summary, so it never needs to duplicate the dump.
  | { status: "error"; error: string; errorDetail?: string };

export interface FinishStepProps {
  draft: CueSheet;
  dirty: boolean;
  renderState: RenderState;
  actions: UseFinishStepActionsResult;
  /** Direct path input for intro/outro (typing) — shared with the Compose/Edit steps' assign buttons. */
  onChangeIntroOutroText: (patch: { intro?: string | null; outro?: string | null }) => void;
  onSelectIntroOutroClip: (role: "intro" | "outro", clipFileName: string) => void;
  onClearIntroOutro: (role: "intro" | "outro") => void;
  onOpenRenderDialog: () => void;
}

/**
 * The (3) Export step's arrangement (screen-spec section 5) — section order: Project -> Subtitle
 * style (global) -> Subtitle style presets -> Intro/outro -> Background music (summary only, real
 * editing lives in the (2) Edit step's BGM gutter) -> Narration -> Output. Thin: each section is
 * its own tested component (ProjectMetaFields/SubtitleStyleSettings/SubtitleStylePresetsSettings/
 * IntroOutroEditor/NarrationSettings) - this component only arranges them and wires the currently
 * selected preset/project's data and callbacks in.
 */
export function FinishStep({
  draft,
  dirty,
  renderState,
  actions,
  onChangeIntroOutroText,
  onSelectIntroOutroClip,
  onClearIntroOutro,
  onOpenRenderDialog,
}: FinishStepProps) {
  return (
    <div className="finish-layout" data-testid="export-step">
      <div data-testid="export-section-project-meta">
        <ProjectMetaFields project={draft.project} onChange={actions.updateProject} />
      </div>

      <div data-testid="export-section-subtitle-style">
        <SubtitleStyleSettings
          subtitleStyle={draft.subtitleStyle}
          onSubtitleStyleChange={actions.updateSubtitleStyle}
          projectWidth={draft.project.width}
          projectHeight={draft.project.height}
          previewClip={draft.segments[0]?.clip}
          previewClipTimeS={draft.segments[0] ? draft.segments[0].in + 0.3 : 0}
        />
      </div>

      <div data-testid="export-section-subtitle-presets">
        <SubtitleStylePresetsSettings
          presets={draft.subtitleStylePresets}
          globalStyle={draft.subtitleStyle}
          onCreate={actions.createSubtitleStylePreset}
          onRename={actions.renameSubtitleStylePreset}
          onDelete={actions.deleteSubtitleStylePreset}
          onChangePreset={actions.updateSubtitleStylePreset}
        />
      </div>

      <div data-testid="export-section-intro-outro">
        <IntroOutroEditor
          intro={draft.intro}
          outro={draft.outro}
          clipDir={draft.clipDir}
          onChangeText={onChangeIntroOutroText}
          onSelectClip={onSelectIntroOutroClip}
          onClear={onClearIntroOutro}
        />
      </div>

      <div className="settings-group" data-testid="export-section-bgm-summary">
        <h3>Background music</h3>
        <p className="settings-note">
          Background music: {draft.bgm.length} {draft.bgm.length === 1 ? "track" : "tracks"} — edit in the ② Edit step
        </p>
      </div>

      <div data-testid="export-section-narration">
        <NarrationSettings narration={draft.narration} onNarrationChange={actions.updateNarration} />
      </div>

      <div className="render-cta" data-testid="export-section-cta">
        <Button
          label={
            renderState.status === "rendering"
              ? `Exporting… ${renderState.progress}%`
              : "Export"
          }
          variant="primary"
          size="lg"
          // Lets the dialog open even while dirty — same convention as HeaderBar renderDisabled
          // above (the dirty warning + [Start export] disabling inside RenderSettingsDialog is the actual final gate).
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
          onClick={actions.handleDownloadSrt}
          data-testid="export-download-srt"
        />
        {dirty ? (
          <span className="render-note">
            Subtitles are based on the cuesheet saved to disk — save first, then download.
          </span>
        ) : null}
      </div>
    </div>
  );
}
