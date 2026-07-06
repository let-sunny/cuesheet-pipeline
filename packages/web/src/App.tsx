import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  BgmCue,
  CueSheet,
  NarrationConfig,
  Project,
  Segment,
  SubtitleStyle,
} from "@cuesheet/schema";
import { validateCueSheet } from "@cuesheet/schema";
import { useToast } from "@astryxdesign/core/Toast";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { Button } from "@astryxdesign/core/Button";
import { fetchCueSheet, fetchMoments, fetchRenderStatus, saveCueSheet, startRender } from "./api.js";
import { buildClipPath, computeClipDurations } from "./clipPaths.js";
import { VideoPreview } from "./components/VideoPreview.js";
import type { VideoPreviewHandle } from "./components/VideoPreview.js";
import { BgmEditor } from "./components/BgmEditor.js";
import { TimelineView } from "./components/TimelineView.js";
import { MomentPalette } from "./components/MomentPalette.js";
import { SubtitleWriteMode } from "./components/SubtitleWriteMode.js";
import { KeyboardHelp } from "./components/KeyboardHelp.js";
import { HeaderBar } from "./components/HeaderBar.js";
import { StepNav } from "./components/StepNav.js";
import type { Step } from "./components/StepNav.js";
import { MiniTimelineStrip } from "./components/MiniTimelineStrip.js";
import { SequencePlayer } from "./components/SequencePlayer.js";
import type { SequencePlayerHandle } from "./components/SequencePlayer.js";
import { CompactSegmentList } from "./components/CompactSegmentList.js";
import { SegmentQuickFields } from "./components/SegmentQuickFields.js";
import { IntroOutroEditor } from "./components/IntroOutroEditor.js";
import { FinishingSettings } from "./components/FinishingSettings.js";
import { SettingsDialog } from "./components/SettingsDialog.js";

/** ← / → 1회 이동량(1프레임, 30fps 기준). Shift+← / →는 1초. */
const FRAME_SECONDS = 1 / 30;

type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "success" }
  | { status: "error"; errors: string[] };

type RenderState =
  | { status: "idle" }
  | { status: "rendering"; progress: number }
  | { status: "success"; path: string }
  | { status: "error"; error: string };

/** 렌더 진행률 폴링 주기(ms). */
const RENDER_POLL_INTERVAL_MS = 1500;

const newSegment = (): Segment => ({
  clip: "",
  in: 0,
  out: 1,
  speed: 1,
  volume: 1,
  subtitle: "",
});

const newBgmCue = (): BgmCue => ({
  file: "",
  start: 0,
  end: 1,
  volume: 1,
});

/** 언두 히스토리에 보관하는 과거 스냅샷 최대 개수. */
const HISTORY_LIMIT = 50;

/** 연속 편집(자막 타이핑, 트림 핸들 드래그 등)을 한 묶음으로 합치는 디바운스 간격(ms). */
const BURST_DEBOUNCE_MS = 500;

interface HistoryEntry {
  cuesheet: CueSheet;
  selectedIndex: number;
}

/** "자막 굽지 않기(CC용 클린 영상)" 체크박스 상태를 기억하는 localStorage 키. */
const NO_BURN_SUBTITLES_KEY = "cuesheet-render-no-burn-subtitles";

function loadNoBurnSubtitles(): boolean {
  try {
    return localStorage.getItem(NO_BURN_SUBTITLES_KEY) === "1";
  } catch {
    return false;
  }
}

/** 미저장 편집 임시 스냅샷을 localStorage에 두는 키. 큐시트(프로젝트명)별로 분리한다. */
const DRAFT_SNAPSHOT_PREFIX = "cuesheet-draft-snapshot:";

function draftSnapshotKey(projectName: string): string {
  return `${DRAFT_SNAPSHOT_PREFIX}${projectName}`;
}

interface DraftSnapshot {
  cuesheet: CueSheet;
  savedAt: number;
}

function loadDraftSnapshot(projectName: string): CueSheet | null {
  try {
    const raw = localStorage.getItem(draftSnapshotKey(projectName));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as DraftSnapshot;
    return parsed.cuesheet;
  } catch {
    return null;
  }
}

function clearDraftSnapshot(projectName: string): void {
  try {
    localStorage.removeItem(draftSnapshotKey(projectName));
  } catch {
    // localStorage 접근 불가 시 조용히 무시한다(best-effort 기능).
  }
}

export function App() {
  const [serverCuesheet, setServerCuesheet] = useState<CueSheet | null>(null);
  const [draft, setDraft] = useState<CueSheet | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const [renderState, setRenderState] = useState<RenderState>({ status: "idle" });
  const [externalChangePending, setExternalChangePending] = useState(false);
  const [restoreSnapshot, setRestoreSnapshot] = useState<CueSheet | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [step, setStep] = useState<Step>("compose");
  const [editMode, setEditMode] = useState<"inspect" | "batch">("inspect");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [sequenceMode, setSequenceMode] = useState(false);
  const [noBurnSubtitles, setNoBurnSubtitles] = useState(loadNoBurnSubtitles);
  // 클립별 길이 근사치(초) — 인트로/아웃트로 지정 버튼(팔레트/인스펙터)의 15초 상한
  // 판정에 쓴다. 실패해도 편집 자체는 막지 않고 빈 맵(전부 "알 수 없음" 취급)으로 둔다.
  const [clipDurations, setClipDurations] = useState<Record<string, number>>({});
  const videoPreviewRef = useRef<VideoPreviewHandle>(null);
  const sequencePlayerRef = useRef<SequencePlayerHandle>(null);
  const renderPollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useToast();

  // 언두/리두 히스토리: 과거/미래 스냅샷 스택(세션 메모리만, 새로고침 시 사라짐 —
  // localStorage 이탈 가드 스냅샷과는 별개다).
  const [past, setPast] = useState<HistoryEntry[]>([]);
  const [future, setFuture] = useState<HistoryEntry[]>([]);
  const burstActiveRef = useRef(false);
  const burstTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (renderPollTimer.current) {
        clearTimeout(renderPollTimer.current);
      }
      if (burstTimerRef.current) {
        clearTimeout(burstTimerRef.current);
      }
    };
  }, []);

  const pushHistorySnapshot = useCallback(() => {
    if (!draft) {
      return;
    }
    const snapshot: HistoryEntry = {
      cuesheet: JSON.parse(JSON.stringify(draft)) as CueSheet,
      selectedIndex,
    };
    setPast((prev) => {
      const next = [...prev, snapshot];
      return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
    });
    setFuture([]);
  }, [draft, selectedIndex]);

  // 구조적 변경(컷 추가/삭제/이동/분할, BGM 추가/삭제 등): 매번 즉시 1개 히스토리로
  // 기록하고, 진행 중이던 연속 편집 묶음(burst)은 끊어서 다음 편집이 새 묶음으로
  // 시작하게 한다.
  const recordDiscreteChange = useCallback(() => {
    if (burstTimerRef.current) {
      clearTimeout(burstTimerRef.current);
      burstTimerRef.current = null;
    }
    burstActiveRef.current = false;
    pushHistorySnapshot();
  }, [pushHistorySnapshot]);

  // 연속 편집(자막 타이핑, 트림 핸들 드래그, 슬라이더 등): 묶음이 비어 있을 때만
  // 편집 시작 시점 상태를 1회 기록하고, 이어지는 변경은 디바운스 타이머만 리셋한다.
  // 타이머가 만료되면(입력이 멈추면) 묶음이 닫히고 다음 변경이 새 묶음을 연다.
  const recordContinuousChange = useCallback(() => {
    if (!burstActiveRef.current) {
      pushHistorySnapshot();
      burstActiveRef.current = true;
    }
    if (burstTimerRef.current) {
      clearTimeout(burstTimerRef.current);
    }
    burstTimerRef.current = setTimeout(() => {
      burstActiveRef.current = false;
      burstTimerRef.current = null;
    }, BURST_DEBOUNCE_MS);
  }, [pushHistorySnapshot]);

  const canUndo = past.length > 0;
  const canRedo = future.length > 0;

  const handleUndo = useCallback(() => {
    if (!draft || past.length === 0) {
      return;
    }
    const last = past[past.length - 1];
    if (!last) {
      return;
    }
    const currentSnapshot: HistoryEntry = { cuesheet: draft, selectedIndex };
    if (burstTimerRef.current) {
      clearTimeout(burstTimerRef.current);
      burstTimerRef.current = null;
    }
    burstActiveRef.current = false;
    setFuture((f) => [currentSnapshot, ...f].slice(0, HISTORY_LIMIT));
    setPast((p) => p.slice(0, -1));
    setDraft(last.cuesheet);
    setSelectedIndex(last.selectedIndex);
    toast({ type: "info", body: "실행 취소됨" });
  }, [draft, past, selectedIndex, toast]);

  const handleRedo = useCallback(() => {
    if (!draft || future.length === 0) {
      return;
    }
    const next = future[0];
    if (!next) {
      return;
    }
    const currentSnapshot: HistoryEntry = { cuesheet: draft, selectedIndex };
    if (burstTimerRef.current) {
      clearTimeout(burstTimerRef.current);
      burstTimerRef.current = null;
    }
    burstActiveRef.current = false;
    setPast((p) => [...p, currentSnapshot].slice(-HISTORY_LIMIT));
    setFuture((f) => f.slice(1));
    setDraft(next.cuesheet);
    setSelectedIndex(next.selectedIndex);
  }, [draft, future, selectedIndex]);

  const dirty = useMemo(() => {
    if (!draft || !serverCuesheet) {
      return false;
    }
    return JSON.stringify(draft) !== JSON.stringify(serverCuesheet);
  }, [draft, serverCuesheet]);

  const load = useCallback(async () => {
    try {
      const cs = await fetchCueSheet();
      setServerCuesheet(cs);
      setDraft(cs);
      setLoadError(null);
      setExternalChangePending(false);
      setSaveState({ status: "idle" });

      const snapshot = loadDraftSnapshot(cs.project.name);
      if (snapshot && JSON.stringify(snapshot) !== JSON.stringify(cs)) {
        setRestoreSnapshot(snapshot);
      } else {
        if (snapshot) {
          // 서버 데이터와 같은 스냅샷은 이미 반영된 것이므로 정리한다.
          clearDraftSnapshot(cs.project.name);
        }
        setRestoreSnapshot(null);
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      try {
        const moments = await fetchMoments();
        setClipDurations(computeClipDurations(moments));
      } catch {
        // 순간 데이터가 없어도 편집 자체는 계속되고, 인트로/아웃트로 지정 버튼만
        // "길이를 알 수 없음"으로 비활성 처리된다.
      }
    })();
  }, []);

  // dirty일 때 새로고침/탭 닫기 시 브라우저 기본 확인 대화상자를 띄운다.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // dirty 상태의 draft를 디바운스(1초)로 localStorage에 임시 저장해 두어,
  // 저장 없이 새로고침/탭 닫기로 편집이 증발해도 복원할 수 있게 한다.
  useEffect(() => {
    if (!draft || !dirty) {
      return;
    }
    const timer = setTimeout(() => {
      try {
        const snapshot: DraftSnapshot = { cuesheet: draft, savedAt: Date.now() };
        localStorage.setItem(draftSnapshotKey(draft.project.name), JSON.stringify(snapshot));
      } catch {
        // 용량 초과 등은 무시한다(best-effort 기능).
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [draft, dirty]);

  const handleRestoreSnapshot = useCallback(() => {
    if (!restoreSnapshot) {
      return;
    }
    setDraft(restoreSnapshot);
    setRestoreSnapshot(null);
  }, [restoreSnapshot]);

  const handleDiscardSnapshot = useCallback(() => {
    if (draft) {
      clearDraftSnapshot(draft.project.name);
    }
    setRestoreSnapshot(null);
  }, [draft]);

  useEffect(() => {
    const handler = () => {
      if (dirty) {
        setExternalChangePending(true);
      } else {
        void load();
      }
    };
    import.meta.hot?.on("cuesheet:changed", handler);
    return () => {
      import.meta.hot?.off("cuesheet:changed", handler);
    };
  }, [dirty, load]);

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

  // 공통 단축키: 입력 필드(input/textarea)에 포커스된 동안은 무시한다(Tab을 이용한
  // 몰아쓰기 모드 내 이동은 SubtitleWriteMode가 각 textarea에서 자체 처리).
  // I/O·재생·분할은 VideoPreview가 실제로 떠 있는 ②편집 단계에서만 의미가 있다.
  useEffect(() => {
    const isVideoStep = step === "edit";
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";
      // Cmd+Z/Cmd+Shift+Z는 isTyping 가드보다 먼저 처리한다: input/textarea에 포커스가
      // 있어도(예: 자막 입력 후 Tab으로 다음 필드로 이동한 상태) 우리 앱의 통합
      // 언두/리두가 항상 적용돼야 한다. 여기서 걸러내지 않으면 브라우저 네이티브
      // per-field 실행취소가 대신 발동해 리액트 상태와 동기화되지 않는 텍스트만
      // 조용히 되돌리는(토스트도 안 뜨고, 저장 시엔 원래 상태가 남는) 불일치가 생긴다.
      if ((e.metaKey || e.ctrlKey) && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }
      if (isTyping) {
        return;
      }
      if (e.key === "?") {
        e.preventDefault();
        setShowShortcuts((v) => !v);
        return;
      }
      if (sequenceMode) {
        if (e.key === " ") {
          e.preventDefault();
          sequencePlayerRef.current?.togglePlay();
        }
        return;
      }
      if (!isVideoStep) {
        if (e.key === "ArrowUp") {
          e.preventDefault();
          selectRelative(-1);
          return;
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          selectRelative(1);
          return;
        }
        return;
      }
      if (e.key === " ") {
        e.preventDefault();
        videoPreviewRef.current?.togglePlay();
        return;
      }
      if (e.key === "i" || e.key === "I") {
        e.preventDefault();
        videoPreviewRef.current?.setInFromCurrent();
        return;
      }
      if (e.key === "o" || e.key === "O") {
        e.preventDefault();
        videoPreviewRef.current?.setOutFromCurrent();
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const sign = e.key === "ArrowLeft" ? -1 : 1;
        const seekStep = e.shiftKey ? 1 : FRAME_SECONDS;
        videoPreviewRef.current?.seekBy(sign * seekStep);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        selectRelative(-1);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        selectRelative(1);
        return;
      }
      if (e.key === "Tab" && editMode !== "batch") {
        e.preventDefault();
        selectRelative(e.shiftKey ? -1 : 1);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === "b" || e.key === "B")) {
        e.preventDefault();
        videoPreviewRef.current?.splitAtCurrent();
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [step, editMode, selectRelative, sequenceMode, handleUndo, handleRedo]);

  const handleSave = useCallback(async () => {
    if (!draft) {
      return;
    }
    const localCheck = validateCueSheet(draft);
    if (!localCheck.ok) {
      setSaveState({ status: "error", errors: localCheck.errors });
      toast({
        type: "error",
        body: (
          <div>
            저장 실패:
            <ul>
              {localCheck.errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        ),
      });
      return;
    }
    setSaveState({ status: "saving" });
    try {
      const result = await saveCueSheet(localCheck.data);
      if (result.ok) {
        setServerCuesheet(result.data);
        setDraft(result.data);
        setSaveState({ status: "success" });
        clearDraftSnapshot(result.data.project.name);
        setRestoreSnapshot(null);
        toast({ type: "info", body: "저장되었습니다." });
      } else {
        setSaveState({ status: "error", errors: result.errors });
        toast({
          type: "error",
          body: (
            <div>
              저장 실패:
              <ul>
                {result.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          ),
        });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setSaveState({ status: "error", errors: [message] });
      toast({ type: "error", body: `저장 실패: ${message}` });
    }
  }, [draft, toast]);

  const handleReload = useCallback(() => {
    void load();
  }, [load]);

  // 렌더 시작 후 완료/실패까지 폴링한다. 렌더가 도는 동안에도 편집은 계속 가능하다 —
  // 렌더는 시작 시점에 디스크에 저장돼 있던 큐시트 기준으로 진행되므로 폴링 중 편집·저장은
  // 이번 렌더 결과에 영향을 주지 않는다.
  const pollRenderStatus = useCallback(() => {
    const tick = async () => {
      try {
        const status = await fetchRenderStatus();
        if (status.state === "running") {
          setRenderState({ status: "rendering", progress: status.progress });
          renderPollTimer.current = setTimeout(() => void tick(), RENDER_POLL_INTERVAL_MS);
        } else if (status.state === "done") {
          setRenderState({ status: "success", path: "out.mp4" });
          toast({ type: "info", body: "렌더가 완료되었습니다." });
        } else if (status.state === "error") {
          const message = status.error ?? "알 수 없는 오류";
          setRenderState({ status: "error", error: message });
          toast({ type: "error", body: `렌더 실패: ${message}` });
        }
      } catch {
        // 네트워크 일시 오류는 폴링을 이어간다.
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
      // localStorage 접근 불가 시 조용히 무시한다(best-effort 기능).
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
        toast({ type: "error", body: `렌더 실패: ${result.error}` });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setRenderState({ status: "error", error: message });
      toast({ type: "error", body: `렌더 실패: ${message}` });
    }
  }, [toast, pollRenderStatus, noBurnSubtitles]);

  const updateProject = useCallback((patch: Partial<Project>) => {
    if (!draft) {
      return;
    }
    recordContinuousChange();
    setDraft((prev) => (prev ? { ...prev, project: { ...prev.project, ...patch } } : prev));
  }, [draft, recordContinuousChange]);

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
  }, [draft, recordContinuousChange]);

  const updateSubtitleStyle = useCallback((patch: Partial<SubtitleStyle>) => {
    if (!draft) {
      return;
    }
    recordContinuousChange();
    setDraft((prev) =>
      prev ? { ...prev, subtitleStyle: { ...prev.subtitleStyle, ...patch } } : prev,
    );
  }, [draft, recordContinuousChange]);

  const updateIntroOutro = useCallback((patch: { intro?: string | null; outro?: string | null }) => {
    if (!draft) {
      return;
    }
    recordContinuousChange();
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  }, [draft, recordContinuousChange]);

  // 팔레트 카드/편집 인스펙터의 "인트로로"/"아웃트로로" 버튼 — 클릭 한 번의 개별 편집이므로
  // (직접 입력 타이핑과 달리) recordDiscreteChange로 즉시 1개 언두 항목을 남긴다.
  // intro/outro는 in/out 구간 지정이 안 되는 통짜 클립이라 클립 파일 전체가 지정된다.
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
  }, [draft, recordDiscreteChange]);

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
  }, [draft, recordDiscreteChange]);

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
  }, [draft, recordContinuousChange]);

  const addSegment = useCallback(() => {
    if (!draft) {
      return;
    }
    recordDiscreteChange();
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      const segments = [...prev.segments, newSegment()];
      setSelectedIndex(segments.length - 1);
      return { ...prev, segments };
    });
  }, [draft, recordDiscreteChange]);

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
  }, [draft, recordDiscreteChange]);

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
  }, [draft, recordDiscreteChange]);

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
  }, [draft, recordDiscreteChange]);

  const addMomentSegment = useCallback((seg: Segment) => {
    if (!draft) {
      return;
    }
    recordDiscreteChange();
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      // 어디서 담든 (clip 파일명, in) 기준 시간순 위치에 삽입 — 순서가 절대 안 흐트러지게.
      const idx = prev.segments.findIndex(
        (s) => s.clip > seg.clip || (s.clip === seg.clip && s.in > seg.in),
      );
      const insertAt = idx === -1 ? prev.segments.length : idx;
      const segments = [...prev.segments];
      segments.splice(insertAt, 0, seg);
      setSelectedIndex(insertAt);
      return { ...prev, segments };
    });
  }, [draft, recordDiscreteChange]);

  // 팔레트 카드의 "빼기" — 같은 clip에서 카드 구간과 겹치는 세그먼트를 담긴 목록에서 제거한다
  // (MomentPalette의 "사용 중" 판정과 동일한 겹침 기준을 쓴다).
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
  }, [draft, recordDiscreteChange]);

  // 미니 타임라인 블록 더블클릭 — 편집 단계(다듬기 뷰)로 전환하고 그 컷을 선택한다.
  const goToEdit = useCallback((i: number) => {
    setSequenceMode(false);
    setStep("edit");
    setEditMode("inspect");
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
  }, [draft, recordContinuousChange]);

  const addBgm = useCallback(() => {
    if (!draft) {
      return;
    }
    recordDiscreteChange();
    setDraft((prev) => (prev ? { ...prev, bgm: [...prev.bgm, newBgmCue()] } : prev));
  }, [draft, recordDiscreteChange]);

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
  }, [draft, recordDiscreteChange]);

  const handleDownloadSrt = useCallback(() => {
    if (dirty) {
      toast({ type: "info", body: "먼저 저장한 뒤 다운로드할 수 있습니다." });
      return;
    }
    window.location.href = "/api/subtitles.srt";
  }, [dirty, toast]);

  const removeBgm = useCallback((i: number) => {
    if (!draft) {
      return;
    }
    recordDiscreteChange();
    setDraft((prev) =>
      prev ? { ...prev, bgm: prev.bgm.filter((_, idx) => idx !== i) } : prev,
    );
  }, [draft, recordDiscreteChange]);

  if (loadError) {
    return <div className="status">불러오기 실패: {loadError}</div>;
  }
  if (!draft) {
    return <div className="status">큐시트를 불러오는 중…</div>;
  }

  const selectedSegment = draft.segments[selectedIndex];
  const subtitleFilled = draft.segments.filter((s) => s.subtitle.trim() !== "").length;

  return (
    <div className="app">
      <HeaderBar
        projectName={draft.project.name}
        dirty={dirty}
        saving={saveState.status === "saving"}
        rendering={renderState.status === "rendering"}
        renderProgress={renderState.status === "rendering" ? renderState.progress : null}
        renderDisabled={dirty || renderState.status === "rendering"}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onSave={() => void handleSave()}
        onRender={() => void handleRender()}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {externalChangePending ? (
        <div className="banner">
          외부에서 변경됨 — 현재 편집 중인 내용을 버리고 다시 불러올까요?
          <button type="button" onClick={handleReload}>
            다시 불러오기
          </button>
        </div>
      ) : null}

      {restoreSnapshot ? (
        <div className="banner">
          저장되지 않은 편집 내역이 있습니다.
          <button type="button" onClick={handleRestoreSnapshot}>
            복원
          </button>
          <button type="button" onClick={handleDiscardSnapshot}>
            버리기
          </button>
        </div>
      ) : null}

      <StepNav
        step={step}
        // 이어재생 중에도 단계를 오가며 팔레트/컷 리스트/인스펙터를 만질 수 있어야 하므로
        // (개편 1 — 재생과 편집 공존) 여기서 sequenceMode를 끄지 않는다. 재생 종료는
        // SequencePlayer의 "닫기" 버튼으로만 한다.
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
          label="본편 재생"
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
            currentIndex={selectedIndex}
            subtitleStyle={draft.subtitleStyle}
            projectHeight={draft.project.height}
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
            <div className="edit-mode-toggle">
              <button
                type="button"
                className={editMode === "inspect" ? "active" : ""}
                onClick={() => setEditMode("inspect")}
              >
                다듬기
              </button>
              <button
                type="button"
                className={editMode === "batch" ? "active" : ""}
                onClick={() => setEditMode("batch")}
              >
                몰아쓰기 모드
              </button>
            </div>

            {editMode === "inspect" ? (
              <div className="trim-layout">
                <CompactSegmentList
                  segments={draft.segments}
                  selectedIndex={selectedIndex}
                  onSelect={setSelectedIndex}
                  onAdd={addSegment}
                  onRemove={removeSegment}
                  onMove={moveSegment}
                />
                <div className="trim-main">
                  <VideoPreview
                    ref={videoPreviewRef}
                    segment={selectedSegment}
                    selectedIndex={selectedIndex}
                    onChange={(patch) => updateSegment(selectedIndex, patch)}
                    onSplit={(at) => splitSegment(selectedIndex, at)}
                    autoPlay={false}
                  />
                  <SegmentQuickFields
                    segment={selectedSegment}
                    narrationEnabled={draft.narration?.enabled ?? false}
                    onChange={(patch) => updateSegment(selectedIndex, patch)}
                    clipDurationS={selectedSegment ? clipDurations[selectedSegment.clip] : undefined}
                    onSetIntro={() =>
                      selectedSegment && setIntroOutroFromClip("intro", selectedSegment.clip)
                    }
                    onSetOutro={() =>
                      selectedSegment && setIntroOutroFromClip("outro", selectedSegment.clip)
                    }
                    onClearCrop={() => clearSegmentCrop(selectedIndex)}
                  />
                </div>
              </div>
            ) : (
              <div className="subtitle-layout">
                <SubtitleWriteMode
                  segments={draft.segments}
                  selectedIndex={selectedIndex}
                  onSelect={setSelectedIndex}
                  onChangeSubtitle={(i, subtitle) => updateSegment(i, { subtitle })}
                  narrationEnabled={draft.narration?.enabled ?? false}
                />
                <VideoPreview
                  ref={videoPreviewRef}
                  segment={selectedSegment}
                  selectedIndex={selectedIndex}
                  onChange={(patch) => updateSegment(selectedIndex, patch)}
                  onSplit={(at) => splitSegment(selectedIndex, at)}
                  autoPlay
                />
              </div>
            )}
          </div>
        ) : null}

        {step === "finish" ? (
          <div className="finish-layout">
            <IntroOutroEditor
              intro={draft.intro}
              outro={draft.outro}
              clipDir={draft.clipDir}
              onChangeText={updateIntroOutro}
              onClear={clearIntroOutro}
            />

            <div>
              <h3>타임라인 · BGM</h3>
              <TimelineView
                segments={draft.segments}
                bgm={draft.bgm}
                selectedIndex={selectedIndex}
                onSelectSegment={setSelectedIndex}
                onChangeBgm={updateBgm}
              />
              <Collapsible trigger="BGM 큐 편집" defaultIsOpen={false}>
                <BgmEditor bgm={draft.bgm} onChange={updateBgm} onAdd={addBgm} onRemove={removeBgm} />
              </Collapsible>
            </div>

            <FinishingSettings
              subtitleStyle={draft.subtitleStyle}
              narration={draft.narration}
              projectHeight={draft.project.height}
              previewClip={
                draft.segments[0]
                  ? { clip: draft.segments[0].clip, t: draft.segments[0].in + 0.3 }
                  : undefined
              }
              onSubtitleStyleChange={updateSubtitleStyle}
              onNarrationChange={updateNarration}
            />

            <div className="render-cta">
              <Button
                label={
                  renderState.status === "rendering"
                    ? `렌더 중… ${renderState.progress}%`
                    : "렌더"
                }
                variant="primary"
                size="lg"
                isDisabled={dirty || renderState.status === "rendering"}
                onClick={() => void handleRender()}
              />
              {renderState.status === "success" ? (
                <a href={`/${renderState.path}`} download>
                  {renderState.path} 다운로드
                </a>
              ) : null}
              {renderState.status === "error" ? (
                <span className="render-note render-note-error">렌더 실패: {renderState.error}</span>
              ) : null}
              <span className="render-note">
                렌더는 시작 시점에 저장돼 있던 큐시트 기준으로 진행됩니다 — 렌더 중 편집·저장은 이번 렌더에 반영되지 않습니다.
              </span>

              <label className="no-burn-subtitles-toggle">
                <input
                  type="checkbox"
                  checked={noBurnSubtitles}
                  onChange={(e) => handleToggleNoBurnSubtitles(e.target.checked)}
                />
                자막 굽지 않기 (CC용 클린 영상)
              </label>

              <Button
                label="자막 다운로드 (.srt)"
                variant="secondary"
                isDisabled={dirty}
                onClick={handleDownloadSrt}
              />
              {dirty ? (
                <span className="render-note">
                  자막은 디스크에 저장된 큐시트 기준입니다 — 먼저 저장한 뒤 다운로드하세요.
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <SettingsDialog
        isOpen={settingsOpen}
        onOpenChange={setSettingsOpen}
        project={draft.project}
        onProjectChange={updateProject}
      />

      <KeyboardHelp visible={showShortcuts} onToggle={() => setShowShortcuts((v) => !v)} />
    </div>
  );
}
