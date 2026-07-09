import * as stylex from "@stylexjs/stylex";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { CueSheet } from "@cuesheet/schema";
import type { BgmFile, ClipMoments, NarrationFile } from "../../api.js";
import { bgmCutRange, cumulativeCutStarts } from "../../lib/bgmCutMapping.js";
import { computeMergeEligibility } from "../../lib/segmentMerge.js";
import type { UseEditStepActionsResult } from "../../hooks/useEditStepActions.js";
import { VideoPreview } from "../../components/VideoPreview.js";
import type { VideoPreviewHandle } from "../../components/VideoPreview.js";
import { BgmSettingsPanel } from "../../components/BgmSettingsPanel/index.js";
import { CompactSegmentList } from "../../components/CompactSegmentList/index.js";
import { SegmentQuickFields } from "../../components/SegmentQuickFields/index.js";
import { styles } from "./EditStep.styles.js";

export interface EditStepProps {
  draft: CueSheet;
  selectedIndex: number;
  setSelectedIndex: Dispatch<SetStateAction<number>>;
  selectedBgmIndex: number | null;
  setSelectedBgmIndex: Dispatch<SetStateAction<number | null>>;
  moments: ClipMoments[];
  clipDurations: Record<string, number>;
  narrationFiles: NarrationFile[];
  narrationNote: string | undefined;
  bgmFiles: BgmFile[];
  bgmFilesNote: string | undefined;
  videoPreviewRef: RefObject<VideoPreviewHandle | null>;
  actions: UseEditStepActionsResult;
  /** Sets this cut's/track's whole source clip file (ignoring in/out) as the intro/outro - shared
   * with the Compose and Export steps. */
  setIntroOutroFromClip: (role: "intro" | "outro", clipFileName: string) => void;
}

/**
 * The (2) Edit step's arrangement — cut list + BGM gutter on the left, video + (Cut settings OR
 * BGM settings, whichever is selected) on the right (screen-spec section 3). Thin: every field's
 * actual behavior lives in the composed components/hooks (SegmentQuickFields, BgmSettingsPanel,
 * useEditStepActions) - this component only wires the currently-selected cut/track's data and
 * callbacks into them.
 */
export function EditStep({
  draft,
  selectedIndex,
  setSelectedIndex,
  selectedBgmIndex,
  setSelectedBgmIndex,
  moments,
  clipDurations,
  narrationFiles,
  narrationNote,
  bgmFiles,
  bgmFilesNote,
  videoPreviewRef,
  actions,
  setIntroOutroFromClip,
}: EditStepProps) {
  const selectedSegment = draft.segments[selectedIndex];
  const selectedBgmCue = selectedBgmIndex != null ? draft.bgm[selectedBgmIndex] : undefined;
  const selectedBgmRange = selectedBgmCue
    ? bgmCutRange(selectedBgmCue, cumulativeCutStarts(draft.segments))
    : undefined;

  return (
    <div {...stylex.props(styles.editLayout)}>
      <div {...stylex.props(styles.trimLayout)}>
        <CompactSegmentList
          segments={draft.segments}
          selectedIndex={selectedIndex}
          moments={moments}
          onSelect={(i) => {
            setSelectedBgmIndex(null);
            setSelectedIndex(i);
          }}
          onChangeSubtitle={(i, subtitle) => actions.updateSegment(i, { subtitle })}
          onAdd={actions.addSegment}
          onRemove={actions.removeSegment}
          onMove={actions.moveSegment}
          bgm={draft.bgm}
          selectedBgmIndex={selectedBgmIndex}
          onSelectBgm={setSelectedBgmIndex}
          onAddBgmTrack={actions.addBgmTrack}
          onChangeBgmRange={actions.changeBgmRange}
        />
        <div {...stylex.props(styles.trimWorkspace)} data-testid="edit-trim-workspace">
          <div {...stylex.props(styles.trimVideoCol)}>
            <VideoPreview
              ref={videoPreviewRef}
              segment={selectedSegment}
              selectedIndex={selectedIndex}
              onChange={(patch) => actions.updateSegment(selectedIndex, patch)}
              onSplit={(at) => actions.splitSegment(selectedIndex, at)}
              autoPlay={false}
              moments={moments}
              subtitleStyle={draft.subtitleStyle}
              subtitleStylePresets={draft.subtitleStylePresets}
              projectHeight={draft.project.height}
              projectWidth={draft.project.width}
            />
          </div>
          <div {...stylex.props(styles.trimFieldsCol)} data-testid="edit-trim-fields-col">
            {selectedBgmIndex != null && selectedBgmCue && selectedBgmRange ? (
              <BgmSettingsPanel
                cue={selectedBgmCue}
                bgmIndex={selectedBgmIndex}
                startCutIdx={selectedBgmRange.startCutIdx}
                endCutIdx={selectedBgmRange.endCutIdx}
                startSeconds={selectedBgmCue.start}
                endSeconds={selectedBgmCue.end}
                cutCount={draft.segments.length}
                files={bgmFiles}
                filesNote={bgmFilesNote}
                onChangeFile={(path) => actions.updateBgm(selectedBgmIndex, { file: path })}
                onChangeRange={(startCutIdx, endCutIdx) => actions.changeBgmRange(selectedBgmIndex, startCutIdx, endCutIdx)}
                onChangeVolume={(volume) => actions.updateBgm(selectedBgmIndex, { volume })}
                onRemove={() => actions.removeBgmTrack(selectedBgmIndex)}
              />
            ) : (
              <SegmentQuickFields
                segment={selectedSegment}
                narrationEnabled={draft.narration?.enabled ?? false}
                narrationFiles={narrationFiles}
                narrationNote={narrationNote}
                narrationDir={draft.narration?.dir}
                onChange={(patch) => actions.updateSegment(selectedIndex, patch)}
                clipDurationS={selectedSegment ? clipDurations[selectedSegment.clip] : undefined}
                onSetIntro={() =>
                  selectedSegment && setIntroOutroFromClip("intro", selectedSegment.clip)
                }
                onSetOutro={() =>
                  selectedSegment && setIntroOutroFromClip("outro", selectedSegment.clip)
                }
                onClearCrop={() => actions.clearSegmentCrop(selectedIndex)}
                onEditCrop={() => videoPreviewRef.current?.startCropEdit()}
                mergeEligibility={computeMergeEligibility(draft, selectedIndex)}
                onMergeNext={() => actions.mergeSegmentWithNext(selectedIndex)}
                onSplit={() => videoPreviewRef.current?.splitAtCurrent()}
                onDuplicate={actions.addSegment}
                onDelete={() => actions.removeSegment(selectedIndex)}
                canDelete={draft.segments.length > 1}
                globalSubtitleStyle={draft.subtitleStyle}
                subtitleStylePresets={draft.subtitleStylePresets}
                projectWidth={draft.project.width}
                projectFps={draft.project.fps}
                onToggleStyleOverride={(enabled) => actions.toggleSegmentStyleOverride(selectedIndex, enabled)}
                onChangeStyleOverride={(patch) => actions.updateSegmentStyleOverride(selectedIndex, patch)}
                onPromoteStyleOverride={() => actions.promoteSegmentStyleOverride(selectedIndex)}
                onClearStyleOverride={() => actions.clearSegmentStyleOverride(selectedIndex)}
                onChangeStylePreset={(name) => actions.changeSegmentStylePreset(selectedIndex, name)}
                onToggleTitle={(enabled) => actions.toggleSegmentTitle(selectedIndex, enabled)}
                onChangeTitle={(patch) => actions.updateSegmentTitle(selectedIndex, patch)}
                onToggleTransition={(side, enabled) => actions.toggleSegmentTransition(selectedIndex, side, enabled)}
                onChangeTransition={(side, patch) => actions.updateSegmentTransition(selectedIndex, side, patch)}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
