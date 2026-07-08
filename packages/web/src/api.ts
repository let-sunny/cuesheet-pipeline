import type { CueSheet } from "@cuesheet/schema";

/** Empty state where no draft (cuesheet file) has been generated yet - PRD section 8 "No draft (empty state)" catalog. */
export class CueSheetNotFoundError extends Error {}

export async function fetchCueSheet(): Promise<CueSheet> {
  const res = await fetch("/api/cuesheet");
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 404) {
      throw new CueSheetNotFoundError(text);
    }
    throw new Error(text);
  }
  return (await res.json()) as CueSheet;
}

export type SaveResult =
  | { ok: true; data: CueSheet }
  | { ok: false; errors: string[] };

/** Last line of defense right before saving — if segment.styleOverride is null/undefined, drop the key
 * entirely. App.tsx's edit path was already fixed (2026-07-08) to omit the key, but this normalizes it
 * once more here to prevent "styleOverride": null from lingering in the saved file. */
function normalizeCueSheetForSave(cuesheet: CueSheet): CueSheet {
  return {
    ...cuesheet,
    segments: cuesheet.segments.map((s) => {
      if (s.styleOverride == null) {
        const { styleOverride: _styleOverride, ...rest } = s;
        return rest;
      }
      return s;
    }),
  };
}

export async function saveCueSheet(cuesheet: CueSheet): Promise<SaveResult> {
  const res = await fetch("/api/cuesheet", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(normalizeCueSheetForSave(cuesheet)),
  });
  return (await res.json()) as SaveResult;
}

export type RenderStartResult = { ok: true; jobId: string } | { ok: false; error: string };

/** Only kicks off the render and returns immediately. Actual progress is polled via fetchRenderStatus.
 * burnSubtitles: false produces a clean video (no drawtext) meant to be paired with a CC/SRT track (default true). */
export async function startRender(burnSubtitles = true): Promise<RenderStartResult> {
  const res = await fetch("/api/render", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ burnSubtitles }),
  });
  return (await res.json()) as RenderStartResult;
}

export interface RenderStatus {
  state: "idle" | "running" | "done" | "error";
  progress: number;
  error?: string;
  outputReady: boolean;
}

export async function fetchRenderStatus(): Promise<RenderStatus> {
  const res = await fetch("/api/render/status");
  return (await res.json()) as RenderStatus;
}

export interface ProxyStatus {
  /** Original clip file names that haven't started processing yet (in wait order). */
  pending: string[];
  /** Original clip file name currently being turned into a proxy, or null if none. */
  generating: string | null;
}

export async function fetchProxyStatus(): Promise<ProxyStatus> {
  const res = await fetch("/api/proxy-status");
  return (await res.json()) as ProxyStatus;
}

export type ShotType = "hand-closeup" | "object" | "cat" | "change" | "reveal" | "wearing" | "other";

export interface Moment {
  inS: number;
  outS: number;
  shotType: ShotType;
  memo: string;
  quality: number;
}

export interface MonotonousRange {
  startS: number;
  endS: number;
  desc: string;
}

export interface ClipMoments {
  clip: string;
  clipSummary: string;
  moments: Moment[];
  monotonousRanges: MonotonousRange[];
}

export async function fetchMoments(): Promise<ClipMoments[]> {
  const res = await fetch("/api/moments");
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return (await res.json()) as ClipMoments[];
}

/** List of frame file names inside a clip folder. Empty array if none. */
export async function fetchDraftFrames(clipFolder: string): Promise<string[]> {
  const res = await fetch(`/api/draft-frames/${encodeURIComponent(clipFolder)}`);
  if (!res.ok) {
    return [];
  }
  return (await res.json()) as string[];
}

export interface NarrationFile {
  name: string;
  /** Duration (seconds) read via ffprobe. null if probing failed. */
  durationS: number | null;
}

export interface NarrationFilesResult {
  files: NarrationFile[];
  /** Info message for e.g. an unset/nonexistent folder. Absent if the listing is normal. */
  note?: string;
}

/**
 * Fetches the list of audio files in dir (with duration). If dir is passed, it's used as-is (so an
 * unsaved, currently-being-edited folder path is reflected immediately) — if omitted, the server falls
 * back to the on-disk cuesheet's narration.dir.
 */
export async function fetchNarrationFiles(dir?: string): Promise<NarrationFilesResult> {
  const query = dir ? `?dir=${encodeURIComponent(dir)}` : "";
  const res = await fetch(`/api/narration-files${query}`);
  return (await res.json()) as NarrationFilesResult;
}

/** Streaming URL for previewing a narration file. dir has the same meaning as in fetchNarrationFiles. */
export function narrationFileUrl(name: string, dir?: string): string {
  const query = dir ? `?dir=${encodeURIComponent(dir)}` : "";
  return `/api/narration-files/${encodeURIComponent(name)}${query}`;
}

export interface ClipFile {
  name: string;
  /** Duration (seconds) read via ffprobe. null if unknown, e.g. an undownloaded iCloud file. */
  durationS: number | null;
}

export interface ClipFilesResult {
  files: ClipFile[];
  /** Info message for e.g. clipDir being unset/inaccessible. Absent if the listing is normal. */
  note?: string;
}

/** List of video files (with duration) inside the on-disk cuesheet's clipDir — for picking an intro/outro. */
export async function fetchClipFiles(): Promise<ClipFilesResult> {
  const res = await fetch("/api/clip-files");
  if (!res.ok) {
    return { files: [] };
  }
  return (await res.json()) as ClipFilesResult;
}

export type UploadClipResult =
  | { ok: true; filename: string; durationS: number | null }
  | { ok: false; error: string };

/**
 * Uploads a local file (a File picked via file input/drag-and-drop) to clipDir.
 * Since browsers don't expose a file's actual disk path, "pick a file from disk" can only be
 * implemented by uploading the file itself to the server, not by entering a path.
 * onProgress reports upload progress (0-100) — only XMLHttpRequest provides upload progress events
 * (fetch doesn't), so XHR is used here specifically for that.
 */
export function uploadClip(file: File, onProgress?: (pct: number) => void): Promise<UploadClipResult> {
  return new Promise((resolvePromise) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/upload-clip?filename=${encodeURIComponent(file.name)}`);
    xhr.upload.onprogress = (e) => {
      if (onProgress && e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      try {
        resolvePromise(JSON.parse(xhr.responseText) as UploadClipResult);
      } catch {
        resolvePromise({ ok: false, error: "Upload failed: invalid server response" });
      }
    };
    xhr.onerror = () => {
      resolvePromise({ ok: false, error: "Upload failed: network error" });
    };
    xhr.send(file);
  });
}
