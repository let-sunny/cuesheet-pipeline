import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { useToast } from "@astryxdesign/core/Toast";
import { Button } from "@astryxdesign/core/Button";
import {
  fetchBgmFiles,
  fetchMoments,
  fetchNarrationFiles,
  fetchRenderStatus,
  startRender,
  type BgmFile,
  type ClipMoments,
  type NarrationFile,
} from "./api.js";
import { buildClipPath, computeClipDurations } from "./clipPaths.js";
import { useBlockingOverlay } from "./lib/modalStack.js";
import { useCueSheetServer } from "./hooks/useCueSheetServer.js";
import { useCueSheetHistory } from "./hooks/useCueSheetHistory.js";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts.js";
import { useEditStepActions } from "./hooks/useEditStepActions.js";
import { useComposeStepActions } from "./hooks/useComposeStepActions.js";
import { useFinishStepActions } from "./hooks/useFinishStepActions.js";
import type { VideoPreviewHandle } from "./components/VideoPreview.js";
import { KeyboardHelp } from "./components/KeyboardHelp/index.js";
import { HeaderBar } from "./components/HeaderBar/index.js";
import type { ThemeModeSetting } from "./lib/theme.js";
import { StepNav } from "./components/StepNav/index.js";
import type { Step } from "./components/StepNav/index.js";
import { MiniTimelineStrip } from "./components/MiniTimelineStrip.js";
import { SequencePlayer } from "./components/SequencePlayer.js";
import type { SequencePlayerHandle } from "./components/SequencePlayer.js";
import { RenderSettingsDialog } from "./components/RenderSettingsDialog/index.js";
import { Banner } from "./components/Banner/index.js";
import { minutesAgoLabel } from "./lib/relativeTime.js";
import { ComposeStep } from "./steps/ComposeStep/index.js";
import { EditStep } from "./steps/EditStep/index.js";
import { FinishStep } from "./steps/FinishStep/index.js";
import type { RenderState } from "./steps/FinishStep/index.js";
import { styles } from "./App.styles.js";

interface AppProps {
  themeMode: ThemeModeSetting;
  onThemeModeChange: (mode: ThemeModeSetting) => void;
}

export function App({ themeMode, onThemeModeChange }: AppProps) {
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
  const [renderState, setRenderState] = useState<RenderState>({ status: "idle" });
  const [noBurnSubtitles, setNoBurnSubtitles] = useState(loadNoBurnSubtitles);
  // Approximate duration per clip (seconds) — used to judge the 15s cap for the intro/outro assign
  // buttons (palette/inspector). If this fails, editing still isn't blocked; it's just left as an
  // empty map (everything treated as "unknown").
  const [clipDurations, setClipDurations] = useState<Record<string, number>>({});
  // Raw rough vision-reading data — used to show "what scene is this cut" by matching it in the cut
  // list/inspector/sequence playback (shares the same fetchMoments call result as clipDurations).
  const [moments, setMoments] = useState<ClipMoments[]>([]);
  // List of audio files inside narration.dir (only refreshed while narration is in use). note is an
  // info message for e.g. an unset/nonexistent folder.
  const [narrationFiles, setNarrationFiles] = useState<NarrationFile[]>([]);
  const [narrationNote, setNarrationNote] = useState<string | undefined>(undefined);
  // Which BGM track (if any) is selected in the Edit step's gutter - when set, the right column
  // shows BgmSettingsPanel instead of Cut settings (SegmentQuickFields). Independent of
  // selectedIndex (the cut selection), since a track's cut range and the currently-inspected cut
  // are separate things.
  const [selectedBgmIndex, setSelectedBgmIndex] = useState<number | null>(null);
  // List of audio files usable as background music (media/ + clipDir) - for the BGM settings
  // panel's file picker/pre-listen. Fetched once; clipDir rarely changes mid-session.
  const [bgmFiles, setBgmFiles] = useState<BgmFile[]>([]);
  const [bgmFilesNote, setBgmFilesNote] = useState<string | undefined>(undefined);
  const videoPreviewRef = useRef<VideoPreviewHandle>(null);
  const sequencePlayerRef = useRef<SequencePlayerHandle>(null);
  const renderPollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (renderPollTimer.current) {
        clearTimeout(renderPollTimer.current);
      }
    };
  }, []);

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
    void (async () => {
      try {
        const data = await fetchMoments();
        setMoments(data);
        setClipDurations(computeClipDurations(data));
      } catch {
        // Editing continues even without moment data — only the intro/outro assign buttons get
        // disabled as "duration unknown", and scene displays all become "no info".
      }
    })();
  }, []);

  // Only refreshes the file listing inside the folder while narration is in use (also refetches if dir changes).
  useEffect(() => {
    if (!draft?.narration?.enabled) {
      setNarrationFiles([]);
      setNarrationNote(undefined);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const result = await fetchNarrationFiles(draft.narration?.dir);
        if (cancelled) {
          return;
        }
        setNarrationFiles(result.files);
        setNarrationNote(result.note);
      } catch {
        if (!cancelled) {
          setNarrationFiles([]);
          setNarrationNote("Couldn't load the narration file list");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [draft?.narration?.enabled, draft?.narration?.dir]);

  useEffect(() => {
    void (async () => {
      try {
        const result = await fetchBgmFiles();
        setBgmFiles(result.files);
        setBgmFilesNote(result.note);
      } catch {
        setBgmFiles([]);
        setBgmFilesNote("Couldn't load the background music file list");
      }
    })();
  }, []);

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

  // Polls from render start until completion/failure. Editing can continue while a render is
  // running — since the render proceeds based on the cuesheet that was on disk when it started,
  // editing/saving during polling doesn't affect this render's result.
  const pollRenderStatus = useCallback(() => {
    const tick = async () => {
      try {
        const status = await fetchRenderStatus();
        if (status.state === "running") {
          setRenderState({ status: "rendering", progress: status.progress });
          renderPollTimer.current = setTimeout(() => void tick(), RENDER_POLL_INTERVAL_MS);
        } else if (status.state === "done") {
          setRenderState({ status: "success", path: "out.mp4" });
          toast({ type: "info", body: "Export complete." });
        } else if (status.state === "error") {
          const message = status.error ?? "Unknown error";
          setRenderState({ status: "error", error: message, errorDetail: status.errorDetail });
          toast({ type: "error", body: `Export failed: ${message}` });
        }
      } catch {
        // Keep polling through transient network errors.
        renderPollTimer.current = setTimeout(() => void tick(), RENDER_POLL_INTERVAL_MS);
      }
    };
    void tick();
  }, [toast]);

  const handleToggleNoBurnSubtitles = useCallback((checked: boolean) => {
    setNoBurnSubtitles(checked);
    try {
      localStorage.setItem(NO_BURN_SUBTITLES_KEY, checked ? "1" : "0");
    } catch {
      // Silently ignore if localStorage is inaccessible (best-effort feature).
    }
  }, []);

  const handleRender = useCallback(async () => {
    try {
      const result = await startRender(!noBurnSubtitles);
      if (result.ok) {
        setRenderState({ status: "rendering", progress: 0 });
        pollRenderStatus();
      } else {
        setRenderState({ status: "error", error: result.error });
        toast({ type: "error", body: `Export failed: ${result.error}` });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setRenderState({ status: "error", error: message });
      toast({ type: "error", body: `Export failed: ${message}` });
    }
  }, [toast, pollRenderStatus, noBurnSubtitles]);

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
      return <div className="status empty-state">{loadError.message}</div>;
    }
    return <div className="status">Failed to load: {loadError.message}</div>;
  }
  if (!draft) {
    return <div className="status">Loading cuesheet…</div>;
  }

  const subtitleFilled = draft.segments.filter((s) => s.subtitle.trim() !== "").length;

  return (
    <div {...stylex.props(styles.app)}>
      <HeaderBar
        projectName={draft.project.name}
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
        onToggleShortcuts={() => setShowShortcuts((v) => !v)}
      />

      {externalChangePending ? (
        <Banner
          actions={
            <Button
              label="Reload"
              variant="secondary"
              size="sm"
              onClick={handleReload}
              data-testid="reload-banner-reload"
            />
          }
        >
          The cuesheet changed elsewhere - discard what's on screen and reload?
        </Banner>
      ) : null}

      {/* screen-spec section 6: only one primary per group - "continue editing" is the
          recommended default action so it's primary, and reverting is secondary (revised
          2026-07-08). The two buttons are grouped into one action group (Banner's actions slot),
          separated from the text, and right-aligned - previously this div had 3 flex items
          (text + button + button), so space-between spread the buttons apart into a "disjointed" layout. */}
      {restoreSnapshot ? (
        <Banner
          actions={
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
        >
          You have unsaved edits from the last session (last edited {minutesAgoLabel(restoreSnapshot.savedAt)}).
        </Banner>
      ) : null}

      <StepNav
        step={step}
        // Since users need to be able to move between steps and touch the palette/cut list/inspector
        // even during sequence playback (redesign 1 — playback and editing coexist), sequenceMode is
        // not turned off here. Playback only ends via SequencePlayer's "Close" button.
        onChange={setStep}
        segmentCount={draft.segments.length}
        subtitleFilled={subtitleFilled}
        subtitleTotal={draft.segments.length}
      />

      <div className="mini-strip-row">
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
        <div className="sequence-player-sticky">
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

      <div className="step-body">
        {step === "compose" ? (
          <ComposeStep
            segments={draft.segments}
            clipDir={draft.clipDir}
            introPath={draft.intro}
            outroPath={draft.outro}
            onAddSegment={composeActions.addMomentSegment}
            onRemoveSegment={composeActions.removeMatchingSegments}
            onSetIntro={(clip) => setIntroOutroFromClip("intro", clip)}
            onSetOutro={(clip) => setIntroOutroFromClip("outro", clip)}
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

function loadNoBurnSubtitles(): boolean {
  try {
    return localStorage.getItem(NO_BURN_SUBTITLES_KEY) === "1";
  } catch {
    return false;
  }
}

/** Render progress polling interval (ms). */
const RENDER_POLL_INTERVAL_MS = 1500;

/** localStorage key remembering the "don't burn subtitles (clean video for CC)" checkbox state. */
const NO_BURN_SUBTITLES_KEY = "cuesheet-render-no-burn-subtitles";
