import type { CueSheet } from "@cuesheet/schema";
import type { UseFinishStepActionsResult } from "../../hooks/useFinishStepActions.js";
import { ProjectMetaFields } from "../../components/ProjectMetaFields/index.js";
import { SubtitleStyleSettings } from "../../components/SubtitleStyleSettings/index.js";
import { NarrationSettings } from "../../components/NarrationSettings/index.js";
import { SubtitleStylePresetsSettings } from "../../components/SubtitleStylePresetsSettings/index.js";
import { IntroOutroEditor } from "../../components/IntroOutroEditor/index.js";
import { BgmSummarySection } from "../../components/BgmSummarySection/index.js";
import { ExportOutputSection } from "../../components/ExportOutputSection/index.js";
import type { RenderState } from "../../components/ExportOutputSection/index.js";

export type { RenderState };

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
 * IntroOutroEditor/NarrationSettings/BgmSummarySection/ExportOutputSection) - this component only
 * arranges them and wires the currently selected preset/project's data and callbacks in.
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

      <BgmSummarySection trackCount={draft.bgm.length} />

      <div data-testid="export-section-narration">
        <NarrationSettings narration={draft.narration} onNarrationChange={actions.updateNarration} />
      </div>

      <ExportOutputSection
        dirty={dirty}
        renderState={renderState}
        onOpenRenderDialog={onOpenRenderDialog}
        onDownloadSrt={actions.handleDownloadSrt}
      />
    </div>
  );
}
