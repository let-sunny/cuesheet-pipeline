import { useCallback, useEffect, useMemo, useState } from "react";
import type { CueSheet } from "@cuesheet/schema";
import { validateCueSheet } from "@cuesheet/schema";
import type { ShowToastFn } from "@astryxdesign/core/Toast";
import { CueSheetNotFoundError, fetchCueSheet, saveCueSheet } from "../api.js";

export type LoadError =
  | { kind: "not-found"; message: string }
  | { kind: "error"; message: string };

export type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "success" }
  | { status: "error"; errors: string[] };

export interface DraftSnapshot {
  cuesheet: CueSheet;
  savedAt: number;
}

export interface UseCueSheetServerResult {
  /** The cuesheet last confirmed on disk (used to compute `dirty` and to detect external changes). */
  serverCuesheet: CueSheet | null;
  /** The in-progress edit buffer - every editing handler in App.tsx reads/writes this. */
  draft: CueSheet | null;
  setDraft: React.Dispatch<React.SetStateAction<CueSheet | null>>;
  loadError: LoadError | null;
  saveState: SaveState;
  /** True once `draft` differs from `serverCuesheet` (JSON-compared). */
  dirty: boolean;
  /** A `cuesheet:changed` HMR event arrived while dirty - the banner asks whether to reload. */
  externalChangePending: boolean;
  /** A localStorage snapshot from an earlier unsaved session differs from what the server has now. */
  restoreSnapshot: DraftSnapshot | null;
  handleSave: () => Promise<void>;
  handleReload: () => void;
  handleRestoreSnapshot: () => void;
  handleDiscardSnapshot: () => void;
}

/**
 * Owns the cuesheet's server round-trip: initial load, save (validate -> POST -> reconcile),
 * dirty tracking, external-change detection (via the dev-server's `cuesheet:changed` HMR event),
 * and a debounced localStorage safety-net snapshot so unsaved edits survive an accidental
 * refresh/tab close (restorable on the next load).
 */
export function useCueSheetServer(toast: ShowToastFn): UseCueSheetServerResult {
  const [serverCuesheet, setServerCuesheet] = useState<CueSheet | null>(null);
  const [draft, setDraft] = useState<CueSheet | null>(null);
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const [externalChangePending, setExternalChangePending] = useState(false);
  const [restoreSnapshot, setRestoreSnapshot] = useState<DraftSnapshot | null>(null);

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
      if (snapshot && JSON.stringify(snapshot.cuesheet) !== JSON.stringify(cs)) {
        setRestoreSnapshot(snapshot);
      } else {
        if (snapshot) {
          // A snapshot identical to the server data has already been applied, so clean it up.
          clearDraftSnapshot(cs.project.name);
        }
        setRestoreSnapshot(null);
      }
    } catch (e) {
      if (e instanceof CueSheetNotFoundError) {
        setLoadError({ kind: "not-found", message: e.message });
      } else {
        setLoadError({ kind: "error", message: e instanceof Error ? e.message : String(e) });
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Shows the browser's default confirmation dialog on refresh/tab close while dirty.
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

  // Debounced (1s) temp save of a dirty draft to localStorage, so edits can be restored even if
  // they'd otherwise vanish from an unsaved refresh/tab close.
  useEffect(() => {
    if (!draft || !dirty) {
      return;
    }
    const timer = setTimeout(() => {
      try {
        const snapshot: DraftSnapshot = { cuesheet: draft, savedAt: Date.now() };
        localStorage.setItem(draftSnapshotKey(draft.project.name), JSON.stringify(snapshot));
      } catch {
        // Ignore things like quota exceeded (best-effort feature).
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [draft, dirty]);

  useEffect(() => {
    const handler = () => {
      if (dirty) {
        setExternalChangePending(true);
      } else {
        void load();
      }
    };
    // Guarded with typeof (rather than a plain `?.`) since vitest's vite-node HMR context
    // implements `on` but not `off` - the real browser Vite client (dist/client/client.mjs)
    // always has both, so this only matters for tests, never in production.
    if (typeof import.meta.hot?.on !== "function") {
      return;
    }
    import.meta.hot.on("cuesheet:changed", handler);
    return () => {
      if (typeof import.meta.hot?.off === "function") {
        import.meta.hot.off("cuesheet:changed", handler);
      }
    };
  }, [dirty, load]);

  const handleRestoreSnapshot = useCallback(() => {
    if (!restoreSnapshot) {
      return;
    }
    setDraft(restoreSnapshot.cuesheet);
    setRestoreSnapshot(null);
    toast({ type: "info", body: "Restored - click Save to confirm if this looks right." });
  }, [restoreSnapshot, toast]);

  const handleDiscardSnapshot = useCallback(() => {
    if (draft) {
      clearDraftSnapshot(draft.project.name);
    }
    // "Discard and use saved" must actually revert the on-screen draft to the saved file, not just
    // drop the localStorage snapshot + banner. Otherwise any divergence from the saved cuesheet
    // (e.g. an edit made while the banner was still up) keeps the Unsaved tag on, contradicting the
    // button's own label (2026-07-12 bug: clicking it left "Unsaved" showing).
    if (serverCuesheet) {
      setDraft(serverCuesheet);
    }
    setRestoreSnapshot(null);
  }, [draft, serverCuesheet]);

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
            Can't save:
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
        toast({ type: "info", body: "Saved." });
      } else {
        setSaveState({ status: "error", errors: result.errors });
        toast({
          type: "error",
          body: (
            <div>
              Save failed:
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
      toast({ type: "error", body: `Couldn't save: ${message} - please try again.` });
    }
  }, [draft, toast]);

  const handleReload = useCallback(() => {
    void load();
  }, [load]);

  return {
    serverCuesheet,
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
  };
}

function draftSnapshotKey(projectName: string): string {
  return `${DRAFT_SNAPSHOT_PREFIX}${projectName}`;
}

function loadDraftSnapshot(projectName: string): DraftSnapshot | null {
  try {
    const raw = localStorage.getItem(draftSnapshotKey(projectName));
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as DraftSnapshot;
  } catch {
    return null;
  }
}

function clearDraftSnapshot(projectName: string): void {
  try {
    localStorage.removeItem(draftSnapshotKey(projectName));
  } catch {
    // Silently ignore if localStorage is inaccessible (best-effort feature).
  }
}

/** localStorage key holding a temporary snapshot of unsaved edits. Separated per cuesheet (project name). */
const DRAFT_SNAPSHOT_PREFIX = "cuesheet-draft-snapshot:";
