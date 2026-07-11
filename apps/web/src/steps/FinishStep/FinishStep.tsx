import { Divider } from "@astryxdesign/core/Divider";
import { Section } from "@astryxdesign/core/Section";
import { VStack } from "@astryxdesign/core/VStack";
import type { CueSheet } from "@cuesheet/schema";
import type { UseFinishStepActionsResult } from "../../hooks/useFinishStepActions.js";
import { ProjectMetaFields } from "../../components/ProjectMetaFields/index.js";
import { SubtitleStyleSettings } from "../../components/SubtitleStyleSettings/index.js";
import { SubtitleStylePresetsSettings } from "../../components/SubtitleStylePresetsSettings/index.js";
import { IntroOutroEditor } from "../../components/IntroOutroEditor/index.js";
import { BgmSummarySection } from "../../components/BgmSummarySection/index.js";
import { ExportOutputSection } from "../../components/ExportOutputSection/index.js";
import type { RenderState } from "../../components/ExportOutputSection/index.js";
import { FinishSettingsSection } from "../../components/FinishSettingsSection/index.js";

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
 * The (3) Export step's arrangement — section order: Project -> Subtitle style (global) ->
 * Subtitle style presets -> Intro/outro -> Background music (a one-line pointer only, real editing
 * lives in the (2) Edit step's BGM gutter) -> Output. Narration moved to the (2) Edit step (a
 * separate task) - not rendered here anymore. Astryx-catalog rebuild (docs/design-principles.md):
 * each settings-heavy section composes the shared `FinishSettingsSection` (Section + heading/fields
 * Grid, not Card), so this component stays a pure arrangement - no layout logic of its own, only
 * wiring each section's data/callbacks in.
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
    <VStack gap={0} data-testid="export-step">
      <FinishSettingsSection
        heading="Project"
        description="Episode-wide settings that rarely change per cut."
        data-testid="export-section-project-meta"
      >
        <ProjectMetaFields project={draft.project} onChange={actions.updateProject} />
      </FinishSettingsSection>

      <FinishSettingsSection
        heading="Subtitle style"
        description="The global look, applied unless a cut or preset overrides it."
        data-testid="export-section-subtitle-style"
      >
        <SubtitleStyleSettings
          subtitleStyle={draft.subtitleStyle}
          onSubtitleStyleChange={actions.updateSubtitleStyle}
          projectWidth={draft.project.width}
          projectHeight={draft.project.height}
          previewClip={draft.segments[0]?.clip}
          previewClipTimeS={draft.segments[0] ? draft.segments[0].in + 0.3 : 0}
        />
      </FinishSettingsSection>

      <FinishSettingsSection
        heading="Subtitle style presets"
        description="Reusable named overrides a cut can opt into instead of its own override."
        data-testid="export-section-subtitle-presets"
      >
        <SubtitleStylePresetsSettings
          presets={draft.subtitleStylePresets}
          globalStyle={draft.subtitleStyle}
          onCreate={actions.createSubtitleStylePreset}
          onRename={actions.renameSubtitleStylePreset}
          onDelete={actions.deleteSubtitleStylePreset}
          onChangePreset={actions.updateSubtitleStylePreset}
        />
      </FinishSettingsSection>

      <FinishSettingsSection
        heading="Intro / outro"
        description="Bookend clips attached before and after the cut list."
        hasDivider={false}
        data-testid="export-section-intro-outro"
      >
        <IntroOutroEditor
          intro={draft.intro}
          outro={draft.outro}
          clipDir={draft.clipDir}
          onChangeText={onChangeIntroOutroText}
          onSelectClip={onSelectIntroOutroClip}
          onClear={onClearIntroOutro}
        />
      </FinishSettingsSection>

      <Section variant="transparent" padding={4}>
        <VStack gap={3}>
          <BgmSummarySection trackCount={draft.bgm.length} />
          <Divider />
          <ExportOutputSection
            dirty={dirty}
            renderState={renderState}
            onOpenRenderDialog={onOpenRenderDialog}
            onDownloadSrt={actions.handleDownloadSrt}
          />
        </VStack>
      </Section>
    </VStack>
  );
}
