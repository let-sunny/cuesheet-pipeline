import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  BgmCue,
  NarrationConfig,
  Project,
  Segment,
  SubtitleStyle,
  SubtitleStyleOverride,
  SubtitleStylePresets,
  Title,
  Transition,
} from "@cuesheet/schema";
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
import { bgmCutRange, cumulativeCutStarts, cutRangeToSeconds } from "./lib/bgmCutMapping.js";
import { computeMergeEligibility } from "./lib/segmentMerge.js";
import { useBlockingOverlay } from "./lib/modalStack.js";
import { minutesAgoLabel } from "./lib/relativeTime.js";
import { scaleCueSheetForResolution } from "./lib/subtitleScale.js";
import { useCueSheetServer } from "./hooks/useCueSheetServer.js";
import { useCueSheetHistory } from "./hooks/useCueSheetHistory.js";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts.js";
import { VideoPreview } from "./components/VideoPreview.js";
import type { VideoPreviewHandle } from "./components/VideoPreview.js";
import { BgmSettingsPanel } from "./components/BgmSettingsPanel/index.js";
import { MomentPalette } from "./components/MomentPalette.js";
import { KeyboardHelp } from "./components/KeyboardHelp/index.js";
import { HeaderBar } from "./components/HeaderBar/index.js";
import type { ThemeModeSetting } from "./lib/theme.js";
import { StepNav } from "./components/StepNav/index.js";
import type { Step } from "./components/StepNav/index.js";
import { MiniTimelineStrip } from "./components/MiniTimelineStrip.js";
import { SequencePlayer } from "./components/SequencePlayer.js";
import type { SequencePlayerHandle } from "./components/SequencePlayer.js";
import { CompactSegmentList } from "./components/CompactSegmentList.js";
import { SegmentQuickFields } from "./components/SegmentQuickFields.js";
import { IntroOutroEditor } from "./components/IntroOutroEditor/index.js";
import { SubtitleStyleSettings, NarrationSettings } from "./components/FinishingSettings/index.js";
import { SubtitleStylePresetsSettings } from "./components/SubtitleStylePresetsSettings.js";
import { ProjectMetaFields } from "./components/ProjectMetaFields/index.js";
import { RenderSettingsDialog } from "./components/RenderSettingsDialog/index.js";

interface AppProps {
  themeMode: ThemeModeSetting;
  onThemeModeChange: (mode: ThemeModeSetting) => void;
}

type RenderState =
  | { status: "idle" }
  | { status: "rendering"; progress: number }
  | { status: "success"; path: string }
  // errorDetail (the full raw ffmpeg dump) is optional and shown separately, in a collapsible -
  // error itself is always the short extracted summary, so it never needs to duplicate the dump.
  | { status: "error"; error: string; errorDetail?: string };

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

  // Registers the render settings dialog as a "blocking overlay" - see lib/modalStack.ts. This
  // makes the global keydown handler below ignore every key while the dialog is open, so e.g.
  // pressing o/Space/arrows to adjust the render dialog's own fields doesn't leak through and
  // mutate the cut/video underneath it.
  useBlockingOverlay(renderDialogOpen);

  // Merge adjacent cuts (Cmd+J / inspector button) — only runs when the same clip and time-adjacent
  // (computeMergeEligibility). The merge result has in=current in, out=next out, keeping the current
  // cut's subtitle. If the next cut's subtitle differs and isn't empty, confirms it will be discarded.
  const mergeSegmentWithNext = useCallback((i: number) => {
    if (!draft) {
      return;
    }
    const eligibility = computeMergeEligibility(draft, i);
    if (!eligibility.eligible) {
      return;
    }
    const current = draft.segments[i];
    const next = draft.segments[i + 1];
    if (!current || !next) {
      return;
    }
    if (next.subtitle.trim() !== "" && next.subtitle.trim() !== current.subtitle.trim()) {
      const confirmed = window.confirm("The next cut's subtitle will be discarded. Continue?");
      if (!confirmed) {
        return;
      }
    }
    recordDiscreteChange();
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      const cur = prev.segments[i];
      const nxt = prev.segments[i + 1];
      if (!cur || !nxt) {
        return prev;
      }
      const merged: Segment = { ...cur, out: nxt.out };
      const segments = [...prev.segments];
      segments.splice(i, 2, merged);
      return { ...prev, segments };
    });
  }, [draft, recordDiscreteChange, setDraft]);

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
    onMerge: mergeSegmentWithNext,
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

  const updateProject = useCallback((patch: Partial<Project>) => {
    if (!draft) {
      return;
    }
    recordContinuousChange();
    setDraft((prev) => (prev ? { ...prev, project: { ...prev.project, ...patch } } : prev));
  }, [draft, recordContinuousChange, setDraft]);

  // Resolution preset switching in the render settings dialog — since subtitleStyle/styleOverride's
  // absolute px values must also be scaled by the height ratio, this is a structural edit (not a
  // simple project field patch), so it uses a separate handler and just leaves one recordDiscreteChange (1 undo step) instead of updateProject.
  const handleChangeResolution = useCallback((width: number, height: number) => {
    if (!draft) {
      return;
    }
    if (draft.project.width === width && draft.project.height === height) {
      return;
    }
    recordDiscreteChange();
    setDraft((prev) => (prev ? scaleCueSheetForResolution(prev, width, height) : prev));
  }, [draft, recordDiscreteChange, setDraft]);

  const updateNarration = useCallback((patch: Partial<NarrationConfig>) => {
    if (!draft) {
      return;
    }
    recordContinuousChange();
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      const base: NarrationConfig = prev.narration ?? {
        enabled: false,
        dir: "media/narration",
        volume: 1,
      };
      return { ...prev, narration: { ...base, ...patch } };
    });
  }, [draft, recordContinuousChange, setDraft]);

  const updateSubtitleStyle = useCallback((patch: Partial<SubtitleStyle>) => {
    if (!draft) {
      return;
    }
    recordContinuousChange();
    setDraft((prev) =>
      prev ? { ...prev, subtitleStyle: { ...prev.subtitleStyle, ...patch } } : prev,
    );
  }, [draft, recordContinuousChange, setDraft]);

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

  const updateSegment = useCallback((i: number, patch: Partial<Segment>) => {
    if (!draft) {
      return;
    }
    recordContinuousChange();
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      const segments = prev.segments.map((s, idx) => (idx === i ? { ...s, ...patch } : s));
      return { ...prev, segments };
    });
  }, [draft, recordContinuousChange, setDraft]);

  // The "Add segment" button — the previous behavior of appending an empty cut at the end was the
  // cause of user complaints about "not knowing what to do after clicking" (a clip-less empty cut
  // showed only "no clip" in the inspector, requiring the file name to be typed in manually).
  // Instead, this duplicates the selected cut right after it — this directly matches the most
  // common real-world pattern of splitting a different range of the same clip into another cut
  // (e.g. using two moments from the same long take as separate cuts), and the duplicate starts
  // with clip/in/out/crop already filled in, needing only a trim (the subtitle is left empty to
  // signal that it needs to be rewritten).
  const addSegment = useCallback(() => {
    if (!draft) {
      return;
    }
    recordDiscreteChange();
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      const source = prev.segments[selectedIndex];
      if (!source) {
        return prev;
      }
      const insertAt = selectedIndex + 1;
      const segments = [...prev.segments];
      segments.splice(insertAt, 0, { ...source, subtitle: "" });
      setSelectedIndex(insertAt);
      return { ...prev, segments };
    });
  }, [draft, recordDiscreteChange, selectedIndex, setDraft]);

  const removeSegment = useCallback((i: number) => {
    if (!draft || draft.segments.length <= 1) {
      return;
    }
    recordDiscreteChange();
    setDraft((prev) => {
      if (!prev || prev.segments.length <= 1) {
        return prev;
      }
      const segments = prev.segments.filter((_, idx) => idx !== i);
      return { ...prev, segments };
    });
  }, [draft, recordDiscreteChange, setDraft]);

  const moveSegment = useCallback((i: number, direction: -1 | 1) => {
    if (!draft) {
      return;
    }
    const target = i + direction;
    if (target < 0 || target >= draft.segments.length) {
      return;
    }
    recordDiscreteChange();
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      const segments = [...prev.segments];
      const a = segments[i];
      const b = segments[target];
      if (!a || !b) {
        return prev;
      }
      segments[i] = b;
      segments[target] = a;
      setSelectedIndex(target);
      return { ...prev, segments };
    });
  }, [draft, recordDiscreteChange, setDraft]);

  const splitSegment = useCallback((i: number, at: number) => {
    if (!draft) {
      return;
    }
    const seg = draft.segments[i];
    if (!seg) {
      return;
    }
    if (at - seg.in < 0.2 || seg.out - at < 0.2) {
      return;
    }
    recordDiscreteChange();
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      const s = prev.segments[i];
      if (!s) {
        return prev;
      }
      if (at - s.in < 0.2 || s.out - at < 0.2) {
        return prev;
      }
      const first: Segment = { ...s, out: at };
      const second: Segment = { ...s, in: at, subtitle: "" };
      const segments = [...prev.segments];
      segments.splice(i, 1, first, second);
      return { ...prev, segments };
    });
  }, [draft, recordDiscreteChange, setDraft]);

  const addMomentSegment = useCallback((seg: Segment) => {
    if (!draft) {
      return;
    }
    recordDiscreteChange();
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      // Wherever it's added from, insert at the time-ordered position keyed on (clip file name, in) — so the order never gets scrambled.
      const idx = prev.segments.findIndex(
        (s) => s.clip > seg.clip || (s.clip === seg.clip && s.in > seg.in),
      );
      const insertAt = idx === -1 ? prev.segments.length : idx;
      const segments = [...prev.segments];
      segments.splice(insertAt, 0, seg);
      setSelectedIndex(insertAt);
      return { ...prev, segments };
    });
  }, [draft, recordDiscreteChange, setDraft]);

  // "Remove" on a palette card — removes segments from the added list that overlap the card's
  // range within the same clip (uses the same overlap criterion as MomentPalette's "in use" check).
  const removeMatchingSegments = useCallback((clip: string, inS: number, outS: number) => {
    if (!draft) {
      return;
    }
    const willRemain = draft.segments.filter(
      (s) => !(s.clip === clip && s.in < outS && s.out > inS),
    );
    if (willRemain.length === draft.segments.length || willRemain.length === 0) {
      return;
    }
    recordDiscreteChange();
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      const segments = prev.segments.filter(
        (s) => !(s.clip === clip && s.in < outS && s.out > inS),
      );
      if (segments.length === prev.segments.length || segments.length === 0) {
        return prev;
      }
      return { ...prev, segments };
    });
  }, [draft, recordDiscreteChange, setDraft]);

  // Double-clicking a mini timeline block — switches to the edit step (trim view) and selects that cut.
  const goToEdit = useCallback((i: number) => {
    setSequenceMode(false);
    setStep("edit");
    setSelectedIndex(i);
  }, []);

  const updateBgm = useCallback((i: number, patch: Partial<BgmCue>) => {
    if (!draft) {
      return;
    }
    recordContinuousChange();
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      const bgm = prev.bgm.map((c, idx) => (idx === i ? { ...c, ...patch } : c));
      return { ...prev, bgm };
    });
  }, [draft, recordContinuousChange, setDraft]);

  // Adds a track defaulting to span just the currently selected cut (the Edit step gutter's
  // "+ Add track" button) - immediately selects it so its settings panel opens on the right.
  const addBgmTrack = useCallback(() => {
    if (!draft) {
      return;
    }
    recordDiscreteChange();
    const newIndex = draft.bgm.length;
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      const cumStart = cumulativeCutStarts(prev.segments);
      const { start, end } = cutRangeToSeconds(selectedIndex, selectedIndex, cumStart);
      const cue: BgmCue = { file: "", start, end, volume: 1 };
      return { ...prev, bgm: [...prev.bgm, cue] };
    });
    setSelectedBgmIndex(newIndex);
  }, [draft, recordDiscreteChange, selectedIndex, setDraft]);

  // Moves/resizes a track by cut index (drag in the gutter, or the settings panel's numeric
  // fields) - converts back to the seconds actually stored/rendered.
  const changeBgmRange = useCallback((bgmIndex: number, startCutIdx: number, endCutIdx: number) => {
    if (!draft) {
      return;
    }
    recordContinuousChange();
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      const cumStart = cumulativeCutStarts(prev.segments);
      const { start, end } = cutRangeToSeconds(startCutIdx, endCutIdx, cumStart);
      const bgm = prev.bgm.map((c, idx) => (idx === bgmIndex ? { ...c, start, end } : c));
      return { ...prev, bgm };
    });
  }, [draft, recordContinuousChange, setDraft]);

  const removeBgmTrack = useCallback((i: number) => {
    if (!draft) {
      return;
    }
    recordDiscreteChange();
    setDraft((prev) => (prev ? { ...prev, bgm: prev.bgm.filter((_, idx) => idx !== i) } : prev));
    setSelectedBgmIndex(null);
  }, [draft, recordDiscreteChange, setDraft]);

  const clearSegmentCrop = useCallback((i: number) => {
    if (!draft) {
      return;
    }
    recordDiscreteChange();
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      const segments = prev.segments.map((s, idx) => (idx === i ? { ...s, crop: null } : s));
      return { ...prev, segments };
    });
  }, [draft, recordDiscreteChange, setDraft]);

  // "Style for this cut only" toggle — turning it on starts the override as a straight copy of the
  // global subtitleStyle (so the visible value doesn't change the instant it's toggled), letting
  // the user adjust values from there. Turning it off (= clearing the override) removes the
  // styleOverride key. The toggle itself is a discrete edit.
  const toggleSegmentStyleOverride = useCallback((i: number, enabled: boolean) => {
    if (!draft) {
      return;
    }
    recordDiscreteChange();
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      const segments = prev.segments.map((s, idx) =>
        idx === i ? (enabled ? { ...s, styleOverride: { ...prev.subtitleStyle } } : withoutStyleOverride(s)) : s,
      );
      return { ...prev, segments };
    });
  }, [draft, recordDiscreteChange, setDraft]);

  const updateSegmentStyleOverride = useCallback((i: number, patch: Partial<SubtitleStyleOverride>) => {
    if (!draft) {
      return;
    }
    recordContinuousChange();
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      const segments = prev.segments.map((s, idx) =>
        idx === i ? { ...s, styleOverride: { ...(s.styleOverride ?? {}), ...patch } } : s,
      );
      return { ...prev, segments };
    });
  }, [draft, recordContinuousChange, setDraft]);

  const clearSegmentStyleOverride = useCallback((i: number) => {
    if (!draft) {
      return;
    }
    recordDiscreteChange();
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      const segments = prev.segments.map((s, idx) => (idx === i ? withoutStyleOverride(s) : s));
      return { ...prev, segments };
    });
  }, [draft, recordDiscreteChange, setDraft]);

  // "Promote to global style" — merges this cut's override into the global subtitleStyle and
  // removes this cut's override (this is a confirmed edit since it affects other cuts too).
  // Bundles the two field changes (subtitleStyle, segments[i].styleOverride) into one history entry.
  const promoteSegmentStyleOverride = useCallback((i: number) => {
    if (!draft) {
      return;
    }
    const seg = draft.segments[i];
    if (!seg?.styleOverride) {
      return;
    }
    const confirmed = window.confirm(
      "Apply this cut's subtitle style to all cuts? This cut's individual style will be removed.",
    );
    if (!confirmed) {
      return;
    }
    recordDiscreteChange();
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      const target = prev.segments[i];
      if (!target?.styleOverride) {
        return prev;
      }
      const mergedGlobal: SubtitleStyle = { ...prev.subtitleStyle, ...target.styleOverride };
      const segments = prev.segments.map((s, idx) => (idx === i ? withoutStyleOverride(s) : s));
      return { ...prev, subtitleStyle: mergedGlobal, segments };
    });
  }, [draft, recordDiscreteChange, setDraft]);

  // "Style preset" select in Cut settings (SUBTITLE group) - "" clears back to no preset (null,
  // consistent with the schema's nullable stylePreset - the merge rule treats null the same as
  // omitted, so there's no need to special-case it away).
  const changeSegmentStylePreset = useCallback((i: number, presetName: string | null) => {
    if (!draft) {
      return;
    }
    recordDiscreteChange();
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      const segments = prev.segments.map((s, idx) => (idx === i ? { ...s, stylePreset: presetName } : s));
      return { ...prev, segments };
    });
  }, [draft, recordDiscreteChange, setDraft]);

  // "Title card for this cut" toggle - turning it on starts from a sane default (typing, 3s, no
  // dim) so the preview shows something immediately, same pattern as the subtitle style override toggle.
  const toggleSegmentTitle = useCallback((i: number, enabled: boolean) => {
    if (!draft) {
      return;
    }
    recordDiscreteChange();
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      const segments = prev.segments.map((s, idx) =>
        idx === i
          ? enabled
            ? { ...s, title: { text: "", preset: "typing" as const, durationS: 3 } }
            : withoutTitle(s)
          : s,
      );
      return { ...prev, segments };
    });
  }, [draft, recordDiscreteChange, setDraft]);

  const updateSegmentTitle = useCallback((i: number, patch: Partial<Title>) => {
    if (!draft) {
      return;
    }
    recordContinuousChange();
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      const segments = prev.segments.map((s, idx) =>
        idx === i && s.title ? { ...s, title: { ...s.title, ...patch } } : s,
      );
      return { ...prev, segments };
    });
  }, [draft, recordContinuousChange, setDraft]);

  // "Transition in"/"Transition out" toggle (PRD backlog #3) - turning one on starts from a sane
  // default (fade, 0.5s) so the preview shows something immediately, same pattern as the Title
  // toggle above.
  const toggleSegmentTransition = useCallback((i: number, side: "in" | "out", enabled: boolean) => {
    if (!draft) {
      return;
    }
    recordDiscreteChange();
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      const key = side === "in" ? "transitionIn" : "transitionOut";
      const segments = prev.segments.map((s, idx) =>
        idx === i
          ? enabled
            ? { ...s, [key]: { type: "fade" as const, durationS: DEFAULT_TRANSITION_DURATION_S } }
            : withoutTransition(s, side)
          : s,
      );
      return { ...prev, segments };
    });
  }, [draft, recordDiscreteChange, setDraft]);

  const updateSegmentTransition = useCallback((i: number, side: "in" | "out", patch: Partial<Transition>) => {
    if (!draft) {
      return;
    }
    recordContinuousChange();
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      const key = side === "in" ? "transitionIn" : "transitionOut";
      const segments = prev.segments.map((s, idx) => {
        if (idx !== i) {
          return s;
        }
        const current = side === "in" ? s.transitionIn : s.transitionOut;
        return current ? { ...s, [key]: { ...current, ...patch } } : s;
      });
      return { ...prev, segments };
    });
  }, [draft, recordContinuousChange, setDraft]);

  // Subtitle style presets management (Export step) - create/rename/delete/edit. Renaming and
  // deleting also sweep every segment referencing the old name, so a cut never silently ends up
  // pointing at a preset name that no longer exists (the schema would reject that on save).
  const createSubtitleStylePreset = useCallback((name: string) => {
    if (!draft) {
      return;
    }
    const trimmed = name.trim();
    if (!trimmed || draft.subtitleStylePresets?.[trimmed]) {
      return;
    }
    recordDiscreteChange();
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      const subtitleStylePresets: SubtitleStylePresets = { ...(prev.subtitleStylePresets ?? {}), [trimmed]: {} };
      return { ...prev, subtitleStylePresets };
    });
  }, [draft, recordDiscreteChange, setDraft]);

  const updateSubtitleStylePreset = useCallback((name: string, patch: Partial<SubtitleStyleOverride>) => {
    if (!draft) {
      return;
    }
    recordContinuousChange();
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      const existing = prev.subtitleStylePresets?.[name] ?? {};
      const subtitleStylePresets: SubtitleStylePresets = {
        ...(prev.subtitleStylePresets ?? {}),
        [name]: { ...existing, ...patch },
      };
      return { ...prev, subtitleStylePresets };
    });
  }, [draft, recordContinuousChange, setDraft]);

  const renameSubtitleStylePreset = useCallback((oldName: string, newName: string) => {
    if (!draft) {
      return;
    }
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName || !draft.subtitleStylePresets?.[oldName] || draft.subtitleStylePresets[trimmed]) {
      return;
    }
    recordDiscreteChange();
    setDraft((prev) => {
      const value = prev?.subtitleStylePresets?.[oldName];
      if (!prev || !value) {
        return prev;
      }
      const rest = { ...prev.subtitleStylePresets };
      delete rest[oldName];
      const segments = prev.segments.map((s) => (s.stylePreset === oldName ? { ...s, stylePreset: trimmed } : s));
      const subtitleStylePresets: SubtitleStylePresets = { ...rest, [trimmed]: value };
      return { ...prev, subtitleStylePresets, segments };
    });
  }, [draft, recordDiscreteChange, setDraft]);

  const deleteSubtitleStylePreset = useCallback((name: string) => {
    if (!draft) {
      return;
    }
    const inUseCount = draft.segments.filter((s) => s.stylePreset === name).length;
    if (inUseCount > 0) {
      const confirmed = window.confirm(
        `${inUseCount} cut(s) use the "${name}" preset - remove it from those cuts too?`,
      );
      if (!confirmed) {
        return;
      }
    }
    recordDiscreteChange();
    setDraft((prev) => {
      if (!prev?.subtitleStylePresets) {
        return prev;
      }
      const { [name]: _removed, ...rest } = prev.subtitleStylePresets;
      const segments = prev.segments.map((s) => (s.stylePreset === name ? { ...s, stylePreset: null } : s));
      return { ...prev, subtitleStylePresets: rest, segments };
    });
  }, [draft, recordDiscreteChange, setDraft]);

  const handleDownloadSrt = useCallback(() => {
    if (dirty) {
      toast({ type: "info", body: "Save first before downloading." });
      return;
    }
    window.location.href = "/api/subtitles.srt";
  }, [dirty, toast]);

  if (loadError) {
    if (loadError.kind === "not-found") {
      return <div className="status empty-state">{loadError.message}</div>;
    }
    return <div className="status">Failed to load: {loadError.message}</div>;
  }
  if (!draft) {
    return <div className="status">Loading cuesheet…</div>;
  }

  const selectedSegment = draft.segments[selectedIndex];
  const subtitleFilled = draft.segments.filter((s) => s.subtitle.trim() !== "").length;
  const selectedBgmCue = selectedBgmIndex != null ? draft.bgm[selectedBgmIndex] : undefined;
  const selectedBgmRange = selectedBgmCue ? bgmCutRange(selectedBgmCue, cumulativeCutStarts(draft.segments)) : undefined;

  return (
    <div className="app">
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
        <div className="banner">
          The cuesheet changed elsewhere - discard what's on screen and reload?
          <Button label="Reload" variant="secondary" size="sm" onClick={handleReload} />
        </div>
      ) : null}

      {restoreSnapshot ? (
        <div className="banner">
          You have unsaved edits from the last session (last edited {minutesAgoLabel(restoreSnapshot.savedAt)}).
          {/* screen-spec section 6: only one primary per group - "continue editing" is the
              recommended default action so it's primary, and reverting is secondary (revised
              2026-07-08). The two buttons are grouped into one action group (.banner-actions),
              separated from the text, and right-aligned - previously this div had 3 flex items
              (text + button + button), so space-between spread the buttons apart into a "disjointed" layout. */}
          <div className="banner-actions">
            <Button label="Continue editing" variant="primary" size="sm" onClick={handleRestoreSnapshot} />
            <Button label="Discard and use saved" variant="secondary" size="sm" onClick={handleDiscardSnapshot} />
          </div>
        </div>
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
          <MomentPalette
            segments={draft.segments}
            clipDir={draft.clipDir}
            introPath={draft.intro}
            outroPath={draft.outro}
            onAddSegment={addMomentSegment}
            onRemoveSegment={removeMatchingSegments}
            onSetIntro={(clip) => setIntroOutroFromClip("intro", clip)}
            onSetOutro={(clip) => setIntroOutroFromClip("outro", clip)}
          />
        ) : null}

        {step === "edit" ? (
          <div className="edit-layout">
            <div className="trim-layout">
              <CompactSegmentList
                segments={draft.segments}
                selectedIndex={selectedIndex}
                moments={moments}
                onSelect={(i) => {
                  setSelectedBgmIndex(null);
                  setSelectedIndex(i);
                }}
                onChangeSubtitle={(i, subtitle) => updateSegment(i, { subtitle })}
                onAdd={addSegment}
                onRemove={removeSegment}
                onMove={moveSegment}
                bgm={draft.bgm}
                selectedBgmIndex={selectedBgmIndex}
                onSelectBgm={setSelectedBgmIndex}
                onAddBgmTrack={addBgmTrack}
                onChangeBgmRange={changeBgmRange}
              />
              <div className="trim-workspace">
                <div className="trim-video-col">
                  <VideoPreview
                    ref={videoPreviewRef}
                    segment={selectedSegment}
                    selectedIndex={selectedIndex}
                    onChange={(patch) => updateSegment(selectedIndex, patch)}
                    onSplit={(at) => splitSegment(selectedIndex, at)}
                    autoPlay={false}
                    moments={moments}
                    subtitleStyle={draft.subtitleStyle}
                    subtitleStylePresets={draft.subtitleStylePresets}
                    projectHeight={draft.project.height}
                    projectWidth={draft.project.width}
                  />
                </div>
                <div className="trim-fields-col">
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
                      onChangeFile={(path) => updateBgm(selectedBgmIndex, { file: path })}
                      onChangeRange={(startCutIdx, endCutIdx) => changeBgmRange(selectedBgmIndex, startCutIdx, endCutIdx)}
                      onChangeVolume={(volume) => updateBgm(selectedBgmIndex, { volume })}
                      onRemove={() => removeBgmTrack(selectedBgmIndex)}
                    />
                  ) : (
                    <SegmentQuickFields
                      segment={selectedSegment}
                      narrationEnabled={draft.narration?.enabled ?? false}
                      narrationFiles={narrationFiles}
                      narrationNote={narrationNote}
                      narrationDir={draft.narration?.dir}
                      onChange={(patch) => updateSegment(selectedIndex, patch)}
                      clipDurationS={selectedSegment ? clipDurations[selectedSegment.clip] : undefined}
                      onSetIntro={() =>
                        selectedSegment && setIntroOutroFromClip("intro", selectedSegment.clip)
                      }
                      onSetOutro={() =>
                        selectedSegment && setIntroOutroFromClip("outro", selectedSegment.clip)
                      }
                      onClearCrop={() => clearSegmentCrop(selectedIndex)}
                      onEditCrop={() => videoPreviewRef.current?.startCropEdit()}
                      mergeEligibility={computeMergeEligibility(draft, selectedIndex)}
                      onMergeNext={() => mergeSegmentWithNext(selectedIndex)}
                      onSplit={() => videoPreviewRef.current?.splitAtCurrent()}
                      onDuplicate={addSegment}
                      onDelete={() => removeSegment(selectedIndex)}
                      canDelete={draft.segments.length > 1}
                      globalSubtitleStyle={draft.subtitleStyle}
                      subtitleStylePresets={draft.subtitleStylePresets}
                      projectWidth={draft.project.width}
                      onToggleStyleOverride={(enabled) => toggleSegmentStyleOverride(selectedIndex, enabled)}
                      onChangeStyleOverride={(patch) => updateSegmentStyleOverride(selectedIndex, patch)}
                      onPromoteStyleOverride={() => promoteSegmentStyleOverride(selectedIndex)}
                      onClearStyleOverride={() => clearSegmentStyleOverride(selectedIndex)}
                      onChangeStylePreset={(name) => changeSegmentStylePreset(selectedIndex, name)}
                      onToggleTitle={(enabled) => toggleSegmentTitle(selectedIndex, enabled)}
                      onChangeTitle={(patch) => updateSegmentTitle(selectedIndex, patch)}
                      onToggleTransition={(side, enabled) => toggleSegmentTransition(selectedIndex, side, enabled)}
                      onChangeTransition={(side, patch) => updateSegmentTransition(selectedIndex, side, patch)}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {step === "finish" ? (
          <div className="finish-layout">
            {/* Section order (screen-spec section 5): project -> subtitle style (global) ->
                intro/outro -> background music (BGM) -> narration -> output. Project meta used to
                be hidden inside the header's "Settings" dialog; it was folded in here as the
                natural first step of preparing output. */}
            <ProjectMetaFields project={draft.project} onChange={updateProject} />

            <SubtitleStyleSettings
              subtitleStyle={draft.subtitleStyle}
              onSubtitleStyleChange={updateSubtitleStyle}
              projectWidth={draft.project.width}
              projectHeight={draft.project.height}
              previewClip={draft.segments[0]?.clip}
              previewClipTimeS={draft.segments[0] ? draft.segments[0].in + 0.3 : 0}
            />

            <SubtitleStylePresetsSettings
              presets={draft.subtitleStylePresets}
              globalStyle={draft.subtitleStyle}
              onCreate={createSubtitleStylePreset}
              onRename={renameSubtitleStylePreset}
              onDelete={deleteSubtitleStylePreset}
              onChangePreset={updateSubtitleStylePreset}
            />

            <IntroOutroEditor
              intro={draft.intro}
              outro={draft.outro}
              clipDir={draft.clipDir}
              onChangeText={updateIntroOutro}
              onSelectClip={(role, clip) => setIntroOutroFromClip(role, clip)}
              onClear={clearIntroOutro}
            />

            <div className="settings-group">
              <h3>Background music</h3>
              <p className="settings-note">
                Background music: {draft.bgm.length} {draft.bgm.length === 1 ? "track" : "tracks"} — edit in the ② Edit step
              </p>
            </div>

            <NarrationSettings narration={draft.narration} onNarrationChange={updateNarration} />

            <div className="render-cta">
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
                onClick={() => setRenderDialogOpen(true)}
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
                onClick={handleDownloadSrt}
              />
              {dirty ? (
                <span className="render-note">
                  Subtitles are based on the cuesheet saved to disk — save first, then download.
                </span>
              ) : null}
            </div>
          </div>
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
        onChangeResolution={handleChangeResolution}
        onStartRender={() => void handleRender()}
      />

      <KeyboardHelp visible={showShortcuts} onToggle={() => setShowShortcuts((v) => !v)} />
    </div>
  );
}

// When clearing an override, drop the styleOverride key entirely (don't leave the value as null) —
// null is also schema-valid as "no override" (nullable), but this standardizes on omission
// (undefined) to avoid leaving an unnecessary "styleOverride": null in the saved file.
function withoutStyleOverride(segment: Segment): Segment {
  const { styleOverride: _styleOverride, ...rest } = segment;
  return rest;
}

// Same convention as withoutStyleOverride: drop the `title` key entirely (rather than leaving it
// null) when a cut's title card is turned off.
function withoutTitle(segment: Segment): Segment {
  const { title: _title, ...rest } = segment;
  return rest;
}

// Same convention as withoutTitle: drop the `transitionIn`/`transitionOut` key entirely (rather
// than leaving it null) when that side's transition is turned off.
function withoutTransition(segment: Segment, side: "in" | "out"): Segment {
  if (side === "in") {
    const { transitionIn: _transitionIn, ...rest } = segment;
    return rest;
  }
  const { transitionOut: _transitionOut, ...rest } = segment;
  return rest;
}

/** Matches the schema's transition.durationS default (0.5) - the value written when a Transition
 * in/out toggle is first turned on. */
const DEFAULT_TRANSITION_DURATION_S = 0.5;

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
