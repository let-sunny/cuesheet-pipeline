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
import { fetchCueSheet, renderCueSheet, saveCueSheet } from "./api.js";
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
  | { status: "rendering" }
  | { status: "success"; path: string }
  | { status: "error"; error: string };

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
  const videoPreviewRef = useRef<VideoPreviewHandle>(null);
  const toast = useToast();

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
      if (isTyping) {
        return;
      }
      if (e.key === "?") {
        e.preventDefault();
        setShowShortcuts((v) => !v);
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
  }, [step, editMode, selectRelative]);

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

  const handleRender = useCallback(async () => {
    setRenderState({ status: "rendering" });
    try {
      const result = await renderCueSheet();
      if (result.ok) {
        setRenderState({ status: "success", path: result.path });
        toast({ type: "info", body: "렌더가 완료되었습니다." });
      } else {
        setRenderState({ status: "error", error: result.error });
        toast({ type: "error", body: `렌더 실패: ${result.error}` });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setRenderState({ status: "error", error: message });
      toast({ type: "error", body: `렌더 실패: ${message}` });
    }
  }, [toast]);

  const updateProject = useCallback((patch: Partial<Project>) => {
    setDraft((prev) => (prev ? { ...prev, project: { ...prev.project, ...patch } } : prev));
  }, []);

  const updateNarration = useCallback((patch: Partial<NarrationConfig>) => {
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
  }, []);

  const updateSubtitleStyle = useCallback((patch: Partial<SubtitleStyle>) => {
    setDraft((prev) =>
      prev ? { ...prev, subtitleStyle: { ...prev.subtitleStyle, ...patch } } : prev,
    );
  }, []);

  const updateIntroOutro = useCallback((patch: { intro?: string | null; outro?: string | null }) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const updateSegment = useCallback((i: number, patch: Partial<Segment>) => {
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      const segments = prev.segments.map((s, idx) => (idx === i ? { ...s, ...patch } : s));
      return { ...prev, segments };
    });
  }, []);

  const addSegment = useCallback(() => {
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      const segments = [...prev.segments, newSegment()];
      setSelectedIndex(segments.length - 1);
      return { ...prev, segments };
    });
  }, []);

  const removeSegment = useCallback((i: number) => {
    setDraft((prev) => {
      if (!prev || prev.segments.length <= 1) {
        return prev;
      }
      const segments = prev.segments.filter((_, idx) => idx !== i);
      return { ...prev, segments };
    });
  }, []);

  const moveSegment = useCallback((i: number, direction: -1 | 1) => {
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      const target = i + direction;
      if (target < 0 || target >= prev.segments.length) {
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
  }, []);

  const splitSegment = useCallback((i: number, at: number) => {
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      const seg = prev.segments[i];
      if (!seg) {
        return prev;
      }
      if (at - seg.in < 0.2 || seg.out - at < 0.2) {
        return prev;
      }
      const first: Segment = { ...seg, out: at };
      const second: Segment = { ...seg, in: at, subtitle: "" };
      const segments = [...prev.segments];
      segments.splice(i, 1, first, second);
      return { ...prev, segments };
    });
  }, []);

  const addMomentSegment = useCallback((seg: Segment) => {
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
  }, []);

  // 팔레트 카드의 "빼기" — 같은 clip에서 카드 구간과 겹치는 세그먼트를 담긴 목록에서 제거한다
  // (MomentPalette의 "사용 중" 판정과 동일한 겹침 기준을 쓴다).
  const removeMatchingSegments = useCallback((clip: string, inS: number, outS: number) => {
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
  }, []);

  // 미니 타임라인 블록 더블클릭 — 편집 단계(다듬기 뷰)로 전환하고 그 컷을 선택한다.
  const goToEdit = useCallback((i: number) => {
    setStep("edit");
    setEditMode("inspect");
    setSelectedIndex(i);
  }, []);

  const updateBgm = useCallback((i: number, patch: Partial<BgmCue>) => {
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      const bgm = prev.bgm.map((c, idx) => (idx === i ? { ...c, ...patch } : c));
      return { ...prev, bgm };
    });
  }, []);

  const addBgm = useCallback(() => {
    setDraft((prev) => (prev ? { ...prev, bgm: [...prev.bgm, newBgmCue()] } : prev));
  }, []);

  const removeBgm = useCallback((i: number) => {
    setDraft((prev) =>
      prev ? { ...prev, bgm: prev.bgm.filter((_, idx) => idx !== i) } : prev,
    );
  }, []);

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
        renderDisabled={dirty || renderState.status === "rendering"}
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
        onChange={setStep}
        segmentCount={draft.segments.length}
        subtitleFilled={subtitleFilled}
        subtitleTotal={draft.segments.length}
      />

      <MiniTimelineStrip
        segments={draft.segments}
        selectedIndex={selectedIndex}
        onSelect={setSelectedIndex}
        onGoToEdit={goToEdit}
      />

      <div className="step-body">
        {step === "compose" ? (
          <MomentPalette
            segments={draft.segments}
            onAddSegment={addMomentSegment}
            onRemoveSegment={removeMatchingSegments}
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
            <IntroOutroEditor intro={draft.intro} outro={draft.outro} onChange={updateIntroOutro} />

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
              onSubtitleStyleChange={updateSubtitleStyle}
              onNarrationChange={updateNarration}
            />

            <div className="render-cta">
              <Button
                label={renderState.status === "rendering" ? "렌더 중…" : "렌더"}
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
