import * as stylex from "@stylexjs/stylex";
import { useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { CueSheet } from "@cuesheet/schema";
import type { BgmFile, ClipMoments, NarrationFile } from "../../api.js";
import { bgmCutRange, cumulativeCutStarts } from "../../lib/bgmCutMapping.js";
import { computeMergeEligibility } from "../../lib/segmentMerge.js";
import type { RowRect } from "../../lib/rowRect.js";
import type { UseEditStepActionsResult } from "../../hooks/useEditStepActions.js";
import { VideoPreview } from "../../components/VideoPreview/index.js";
import type { VideoPreviewHandle } from "../../components/VideoPreview/index.js";
import { BgmSettingsPanel } from "../../components/BgmSettingsPanel/index.js";
import { BgmSidePanel } from "../../components/BgmSidePanel/index.js";
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
 * The (2) Edit step's arrangement — cut list leading, with the collapsible BgmSidePanel docked
 * beside it (not above it - 2026-07-12 relocation), then video + (Cut settings OR BGM settings,
 * whichever is selected) on the right (screen-spec section 3). Thin: every field's actual behavior
 * lives in the composed components/hooks (SegmentQuickFields, BgmSettingsPanel, BgmSidePanel,
 * useEditStepActions) - this component only wires the currently-selected cut/track's data and
 * callbacks into them, plus the row-rect/drag-highlight state that crosses the CompactSegmentList/
 * BgmSidePanel sibling boundary (see their own doc comments).
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

  // Lifted out of CompactSegmentList (2026-07-12 relocation): row rects and the BGM drag highlight
  // cross the CompactSegmentList/BgmSidePanel component boundary through here, since the two are
  // flex siblings rather than parent/child - see both components' doc comments for why.
  const [rowRects, setRowRects] = useState<RowRect[]>([]);
  const [bgmDragHighlight, setBgmDragHighlight] = useState<{ start: number; end: number } | null>(null);

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
          onRemove={actions.removeSegment}
          onMove={actions.moveSegment}
          bgmDragHighlight={bgmDragHighlight}
          onRowRectsChange={setRowRects}
        />
        <BgmSidePanel
          bgm={draft.bgm}
          segments={draft.segments}
          selectedBgmIndex={selectedBgmIndex}
          onSelectBgm={setSelectedBgmIndex}
          onAddBgmTrack={actions.addBgmTrack}
          onChangeBgmRange={actions.changeBgmRange}
          rowRects={rowRects}
          onDragHighlightChange={setBgmDragHighlight}
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
              projectFps={draft.project.fps}
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
