import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { useToast } from "@astryxdesign/core/Toast";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { buildClipPath } from "./clipPaths.js";
import { useBlockingOverlay } from "./lib/modalStack.js";
import { useCueSheetServer } from "./hooks/useCueSheetServer.js";
import { useCueSheetHistory } from "./hooks/useCueSheetHistory.js";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts.js";
import { useEditStepActions } from "./hooks/useEditStepActions.js";
import { useComposeStepActions } from "./hooks/useComposeStepActions.js";
import { useFinishStepActions } from "./hooks/useFinishStepActions.js";
import { useProjectResources } from "./hooks/useProjectResources.js";
import { useRenderExecution } from "./hooks/useRenderExecution.js";
import type { VideoPreviewHandle } from "./components/VideoPreview/index.js";
import { KeyboardHelp } from "./components/KeyboardHelp/index.js";
import { HeaderBar } from "./components/HeaderBar/index.js";
import type { ThemeModeSetting, ThemeName } from "./lib/theme.js";
import { StepNav } from "./components/StepNav/index.js";
import type { Step } from "./components/StepNav/index.js";
import { MiniTimelineStrip } from "./components/MiniTimelineStrip/index.js";
import { SequencePlayer } from "./components/SequencePlayer/index.js";
import type { SequencePlayerHandle } from "./components/SequencePlayer/index.js";
import { RenderSettingsDialog } from "./components/RenderSettingsDialog/index.js";
import { Banner } from "@astryxdesign/core/Banner";
import { minutesAgoLabel } from "./lib/relativeTime.js";
import { ComposeStep } from "./steps/ComposeStep/index.js";
import { EditStep } from "./steps/EditStep/index.js";
import { FinishStep } from "./steps/FinishStep/index.js";
import { buildCards, computeInUseCutNumbers } from "./lib/momentCards.js";
import { styles } from "./App.styles.js";

interface AppProps {
  themeMode: ThemeModeSetting;
  onThemeModeChange: (mode: ThemeModeSetting) => void;
  themeName: ThemeName;
  onThemeNameChange: (name: ThemeName) => void;
}

export function App({ themeMode, onThemeModeChange, themeName, onThemeNameChange }: AppProps) {
  const toast = useToast();
  const {
    draft,
    setDraft,
    loadError,
    saveState,
    dirty,
    externalChangePending,
    restoreSnapshot,
    handleSave,
    handleReload,
    handleRestoreSnapshot,
    handleDiscardSnapshot,
  } = useCueSheetServer(toast);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [step, setStep] = useState<Step>("compose");
  const [renderDialogOpen, setRenderDialogOpen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [sequenceMode, setSequenceMode] = useState(false);
  // Which BGM track (if any) is selected in the Edit step's gutter - when set, the right column
  // shows BgmSettingsPanel instead of Cut settings (SegmentQuickFields). Independent of
  // selectedIndex (the cut selection), since a track's cut range and the currently-inspected cut
  // are separate things.
  const [selectedBgmIndex, setSelectedBgmIndex] = useState<number | null>(null);
  const videoPreviewRef = useRef<VideoPreviewHandle>(null);
  const sequencePlayerRef = useRef<SequencePlayerHandle>(null);

  const { moments, clipDurations, narrationFiles, narrationNote, bgmFiles, bgmFilesNote } = useProjectResources({
    narrationEnabled: draft?.narration?.enabled ?? false,
    narrationDir: draft?.narration?.dir,
  });
  const { renderState, noBurnSubtitles, handleToggleNoBurnSubtitles, handleRender } = useRenderExecution(toast);

  const { canUndo, canRedo, handleUndo, handleRedo, recordDiscreteChange, recordContinuousChange } =
    useCueSheetHistory({
      draft,
      setDraft,
      selectedIndex,
      setSelectedIndex,
      onUndo: () => toast({ type: "info", body: "Undone" }),
    });

  // Per-step handler bundles (see hooks/use{Edit,Compose,Finish}StepActions.ts) - called
  // unconditionally regardless of which step is showing, since useEditStepActions.mergeSegmentWithNext
  // also backs the global Cmd+J shortcut below.
  const editActions = useEditStepActions({
    draft,
    setDraft,
    recordDiscreteChange,
    recordContinuousChange,
    selectedIndex,
    setSelectedIndex,
    setSelectedBgmIndex,
  });
  const composeActions = useComposeStepActions({
    draft,
    setDraft,
    recordDiscreteChange,
    setSelectedIndex,
  });
  const finishActions = useFinishStepActions({
    draft,
    setDraft,
    recordDiscreteChange,
    recordContinuousChange,
    dirty,
    toast,
  });

  // Registers the render settings dialog as a "blocking overlay" - see lib/modalStack.ts. This
  // makes the global keydown handler below ignore every key while the dialog is open, so e.g.
  // pressing o/Space/arrows to adjust the render dialog's own fields doesn't leak through and
  // mutate the cut/video underneath it.
  useBlockingOverlay(renderDialogOpen);

  // Approximate output duration for the render settings dialog summary — intro/outro are unknown
  // without probing the file, so this just sums segments, the same as the server's estimateOutputSeconds.
  const outputSecondsEstimate = useMemo(() => {
    if (!draft) {
      return 0;
    }
    return draft.segments.reduce((sum, s) => sum + (s.out - s.in) / s.speed, 0);
  }, [draft]);

  useEffect(() => {
    if (draft && selectedIndex >= draft.segments.length) {
      setSelectedIndex(Math.max(0, draft.segments.length - 1));
    }
  }, [draft, selectedIndex]);

  const selectRelative = useCallback((delta: number) => {
    setSelectedIndex((prev) => {
      const len = draft?.segments.length ?? 0;
      if (len === 0) {
        return prev;
      }
      return Math.min(Math.max(prev + delta, 0), len - 1);
    });
  }, [draft]);

  // Common shortcuts: ignored while an input field (input/textarea) is focused (Tab-based
  // navigation inside batch subtitle-writing mode is handled by SubtitleWriteMode itself in each
  // textarea). I/O, playback, and split only make sense in the ② edit step, where VideoPreview is
  // actually mounted. See hooks/useKeyboardShortcuts.ts for the full key-to-action mapping.
  useKeyboardShortcuts({
    step,
    sequenceMode,
    selectedIndex,
    selectRelative,
    onUndo: handleUndo,
    onRedo: handleRedo,
    onToggleShortcuts: () => setShowShortcuts((v) => !v),
    onMerge: editActions.mergeSegmentWithNext,
    videoPreviewRef,
    sequencePlayerRef,
  });

  const updateIntroOutro = useCallback((patch: { intro?: string | null; outro?: string | null }) => {
    if (!draft) {
      return;
    }
    recordContinuousChange();
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  }, [draft, recordContinuousChange, setDraft]);

  // The "Set as intro"/"Set as outro" buttons on palette cards/edit inspector — since this is a
  // single-click discrete edit (unlike direct text typing), it leaves one undo entry immediately
  // via recordDiscreteChange. intro/outro are whole clips with no in/out range, so the entire clip file gets assigned.
  // Shared across all three steps (MomentPalette/SegmentQuickFields/IntroOutroEditor all assign
  // intro/outro), so it stays here rather than in any one step's action hook.
  const setIntroOutroFromClip = useCallback((role: "intro" | "outro", clipFileName: string) => {
    if (!draft) {
      return;
    }
    const path = buildClipPath(draft.clipDir, clipFileName);
    recordDiscreteChange();
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      return role === "intro" ? { ...prev, intro: path } : { ...prev, outro: path };
    });
  }, [draft, recordDiscreteChange, setDraft]);

  const clearIntroOutro = useCallback((role: "intro" | "outro") => {
    if (!draft) {
      return;
    }
    recordDiscreteChange();
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      return role === "intro" ? { ...prev, intro: null } : { ...prev, outro: null };
    });
  }, [draft, recordDiscreteChange, setDraft]);

  // Double-clicking a mini timeline block — switches to the edit step (trim view) and selects that cut.
  const goToEdit = useCallback((i: number) => {
    setSequenceMode(false);
    setStep("edit");
    setSelectedIndex(i);
  }, []);

  if (loadError) {
    if (loadError.kind === "not-found") {
      return (
        <div {...stylex.props(styles.bootStatus)}>
          <EmptyState title="Cuesheet not found" description={loadError.message} />
        </div>
      );
    }
    return (
      <div {...stylex.props(styles.bootStatus)}>
        <EmptyState title="Failed to load" description={loadError.message} />
      </div>
    );
  }
  if (!draft) {
    return (
      <div {...stylex.props(styles.bootStatus)}>
        <EmptyState title="Loading cuesheet…" />
      </div>
    );
  }

  const subtitleFilled = draft.segments.filter((s) => s.subtitle.trim() !== "").length;
  // Scenes badge = how many scene candidates are selected (in use) out of all candidates —
  // not the final-cut count. Reuses the same helpers MomentPalette shows ("Scene candidates (N)").
  const sceneCards = buildCards(moments);
  const sceneInUse = computeInUseCutNumbers(sceneCards, draft.segments).size;

  return (
    <div {...stylex.props(styles.app)}>
      <HeaderBar
        projectName={draft.project.name}
        onProjectNameChange={(name) => finishActions.updateProject({ name })}
        dirty={dirty}
        saving={saveState.status === "saving"}
        rendering={renderState.status === "rendering"}
        renderProgress={renderState.status === "rendering" ? renderState.progress : null}
        // Lets the dialog open even while dirty — RenderSettingsDialog itself sees dirty and shows
        // a warning, disabling only [Start render] (same convention as the render-cta button below).
        // If this were blocked by dirty too, the user would have no way to see that warning.
        renderDisabled={renderState.status === "rendering"}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onSave={() => void handleSave()}
        onRender={() => setRenderDialogOpen(true)}
        themeMode={themeMode}
        onThemeModeChange={onThemeModeChange}
        themeName={themeName}
        onThemeNameChange={onThemeNameChange}
        onToggleShortcuts={() => setShowShortcuts((v) => !v)}
      />

      {externalChangePending ? (
        <Banner
          status="info"
          title="The cuesheet changed elsewhere - discard what's on screen and reload?"
          endContent={
            <Button
              label="Reload"
              variant="secondary"
              size="sm"
              onClick={handleReload}
              data-testid="reload-banner-reload"
            />
          }
        />
      ) : null}

      {/* screen-spec section 6: only one primary per group - "continue editing" is the
          recommended default action so it's primary, and reverting is secondary (revised
          2026-07-08). The two buttons are grouped into one action group (Banner's actions slot),
          separated from the text, and right-aligned - previously this div had 3 flex items
          (text + button + button), so space-between spread the buttons apart into a "disjointed" layout. */}
      {restoreSnapshot ? (
        <Banner
          status="warning"
          title={`You have unsaved edits from the last session (last edited ${minutesAgoLabel(restoreSnapshot.savedAt)}).`}
          endContent={
            <>
              <Button
                label="Continue editing"
                variant="primary"
                size="sm"
                onClick={handleRestoreSnapshot}
                data-testid="restore-banner-continue"
              />
              <Button
                label="Discard and use saved"
                variant="secondary"
                size="sm"
                onClick={handleDiscardSnapshot}
                data-testid="restore-banner-discard"
              />
            </>
          }
        />
      ) : null}

      <StepNav
        step={step}
        // Since users need to be able to move between steps and touch the palette/cut list/inspector
        // even during sequence playback (redesign 1 — playback and editing coexist), sequenceMode is
        // not turned off here. Playback only ends via SequencePlayer's "Close" button.
        onChange={setStep}
        sceneInUse={sceneInUse}
        sceneTotal={sceneCards.length}
        subtitleFilled={subtitleFilled}
        subtitleTotal={draft.segments.length}
      />

      <div {...stylex.props(styles.miniStripRow)}>
        <MiniTimelineStrip
          segments={draft.segments}
          selectedIndex={selectedIndex}
          onSelect={setSelectedIndex}
          onGoToEdit={goToEdit}
        />
        <Button
          label="Play all"
          variant="secondary"
          isDisabled={draft.segments.length === 0}
          onClick={() => setSequenceMode(true)}
        />
      </div>

      {sequenceMode ? (
        <div {...stylex.props(styles.sequencePlayerSticky)}>
          <SequencePlayer
            ref={sequencePlayerRef}
            segments={draft.segments}
            cue={draft}
            narrationFiles={narrationFiles}
            currentIndex={selectedIndex}
            moments={moments}
            subtitleStyle={draft.subtitleStyle}
            subtitleStylePresets={draft.subtitleStylePresets}
            projectHeight={draft.project.height}
            projectWidth={draft.project.width}
            onIndexChange={setSelectedIndex}
            onExit={() => setSequenceMode(false)}
          />
        </div>
      ) : null}

      <div {...stylex.props(styles.stepBody)}>
        {step === "compose" ? (
          <ComposeStep
            segments={draft.segments}
            onAddSegment={composeActions.addMomentSegment}
            onRemoveSegment={composeActions.removeMatchingSegments}
          />
        ) : null}

        {step === "edit" ? (
          <EditStep
            draft={draft}
            selectedIndex={selectedIndex}
            setSelectedIndex={setSelectedIndex}
            selectedBgmIndex={selectedBgmIndex}
            setSelectedBgmIndex={setSelectedBgmIndex}
            moments={moments}
            clipDurations={clipDurations}
            narrationFiles={narrationFiles}
            narrationNote={narrationNote}
            bgmFiles={bgmFiles}
            bgmFilesNote={bgmFilesNote}
            videoPreviewRef={videoPreviewRef}
            actions={editActions}
            setIntroOutroFromClip={setIntroOutroFromClip}
          />
        ) : null}

        {step === "finish" ? (
          <FinishStep
            draft={draft}
            dirty={dirty}
            renderState={renderState}
            actions={finishActions}
            onChangeIntroOutroText={updateIntroOutro}
            onSelectIntroOutroClip={setIntroOutroFromClip}
            onClearIntroOutro={clearIntroOutro}
            onOpenRenderDialog={() => setRenderDialogOpen(true)}
          />
        ) : null}
      </div>

      <RenderSettingsDialog
        isOpen={renderDialogOpen}
        onOpenChange={setRenderDialogOpen}
        project={draft.project}
        dirty={dirty}
        rendering={renderState.status === "rendering"}
        segmentCount={draft.segments.length}
        outputSeconds={outputSecondsEstimate}
        noBurnSubtitles={noBurnSubtitles}
        onToggleNoBurnSubtitles={handleToggleNoBurnSubtitles}
        onChangeResolution={finishActions.handleChangeResolution}
        onStartRender={() => void handleRender()}
      />

      <KeyboardHelp visible={showShortcuts} onToggle={() => setShowShortcuts((v) => !v)} />
    </div>
  );
}
