import { useCallback, useEffect, useMemo, useState } from "react";
import type { BgmCue, CueSheet, Project, Segment, SubtitleStyle } from "@cuesheet/schema";
import { validateCueSheet } from "@cuesheet/schema";
import { fetchCueSheet, renderCueSheet, saveCueSheet } from "./api.js";
import { SegmentEditor } from "./components/SegmentEditor.js";
import { VideoPreview } from "./components/VideoPreview.js";
import { ProjectSettings } from "./components/ProjectSettings.js";
import { BgmEditor } from "./components/BgmEditor.js";
import { TimelineView } from "./components/TimelineView.js";

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

export function App() {
  const [serverCuesheet, setServerCuesheet] = useState<CueSheet | null>(null);
  const [draft, setDraft] = useState<CueSheet | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const [renderState, setRenderState] = useState<RenderState>({ status: "idle" });
  const [externalChangePending, setExternalChangePending] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

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
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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

  const handleSave = useCallback(async () => {
    if (!draft) {
      return;
    }
    const localCheck = validateCueSheet(draft);
    if (!localCheck.ok) {
      setSaveState({ status: "error", errors: localCheck.errors });
      return;
    }
    setSaveState({ status: "saving" });
    try {
      const result = await saveCueSheet(localCheck.data);
      if (result.ok) {
        setServerCuesheet(result.data);
        setDraft(result.data);
        setSaveState({ status: "success" });
      } else {
        setSaveState({ status: "error", errors: result.errors });
      }
    } catch (e) {
      setSaveState({
        status: "error",
        errors: [e instanceof Error ? e.message : String(e)],
      });
    }
  }, [draft]);

  const handleReload = useCallback(() => {
    void load();
  }, [load]);

  const handleRender = useCallback(async () => {
    setRenderState({ status: "rendering" });
    try {
      const result = await renderCueSheet();
      if (result.ok) {
        setRenderState({ status: "success", path: result.path });
      } else {
        setRenderState({ status: "error", error: result.error });
      }
    } catch (e) {
      setRenderState({
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }, []);

  const updateProject = useCallback((patch: Partial<Project>) => {
    setDraft((prev) => (prev ? { ...prev, project: { ...prev.project, ...patch } } : prev));
  }, []);

  const updateSubtitleStyle = useCallback((patch: Partial<SubtitleStyle>) => {
    setDraft((prev) =>
      prev ? { ...prev, subtitleStyle: { ...prev.subtitleStyle, ...patch } } : prev,
    );
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

  return (
    <div className="app">
      <div className="header-row">
        <h1>큐시트 에디터</h1>
        <div className="save-row">
          {dirty ? <span className="dirty-badge">저장 안 됨</span> : null}
          <button type="button" onClick={() => void handleSave()} disabled={saveState.status === "saving"}>
            {saveState.status === "saving" ? "저장 중…" : "저장"}
          </button>
          <button
            type="button"
            onClick={() => void handleRender()}
            disabled={dirty || renderState.status === "rendering"}
          >
            {renderState.status === "rendering" ? "렌더 중…" : "렌더"}
          </button>
        </div>
      </div>

      {dirty ? (
        <div className="banner">저장 후 렌더할 수 있습니다.</div>
      ) : null}

      {renderState.status === "success" ? (
        <div className="banner success">
          렌더 완료.{" "}
          <a href={`/${renderState.path}`} download>
            {renderState.path} 다운로드
          </a>
        </div>
      ) : null}
      {renderState.status === "error" ? (
        <div className="banner error">
          렌더 실패:
          <pre>{renderState.error}</pre>
        </div>
      ) : null}

      {externalChangePending ? (
        <div className="banner">
          외부에서 변경됨 — 현재 편집 중인 내용을 버리고 다시 불러올까요?
          <button type="button" onClick={handleReload}>
            다시 불러오기
          </button>
        </div>
      ) : null}

      {saveState.status === "success" ? (
        <div className="banner success">저장되었습니다.</div>
      ) : null}
      {saveState.status === "error" ? (
        <div className="banner error">
          저장 실패:
          <ul>
            {saveState.errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <ProjectSettings
        project={draft.project}
        subtitleStyle={draft.subtitleStyle}
        onProjectChange={updateProject}
        onSubtitleStyleChange={updateSubtitleStyle}
      />

      <h2>세그먼트</h2>
      <div className="segment-layout">
        <SegmentEditor
          segments={draft.segments}
          selectedIndex={selectedIndex}
          onSelect={setSelectedIndex}
          onChange={updateSegment}
          onAdd={addSegment}
          onRemove={removeSegment}
          onMove={moveSegment}
        />
        <VideoPreview
          segment={selectedSegment}
          selectedIndex={selectedIndex}
          onChange={(patch) => updateSegment(selectedIndex, patch)}
          onSplit={(at) => splitSegment(selectedIndex, at)}
        />
      </div>

      <h2>타임라인</h2>
      <TimelineView
        segments={draft.segments}
        bgm={draft.bgm}
        selectedIndex={selectedIndex}
        onSelectSegment={setSelectedIndex}
        onChangeBgm={updateBgm}
      />

      <h2>BGM</h2>
      <BgmEditor bgm={draft.bgm} onChange={updateBgm} onAdd={addBgm} onRemove={removeBgm} />
    </div>
  );
}
