import type { CueSheet } from "@cuesheet/schema";

export async function fetchCueSheet(): Promise<CueSheet> {
  const res = await fetch("/api/cuesheet");
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return (await res.json()) as CueSheet;
}

export type SaveResult =
  | { ok: true; data: CueSheet }
  | { ok: false; errors: string[] };

export async function saveCueSheet(cuesheet: CueSheet): Promise<SaveResult> {
  const res = await fetch("/api/cuesheet", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuesheet),
  });
  return (await res.json()) as SaveResult;
}

export type RenderStartResult = { ok: true; jobId: string } | { ok: false; error: string };

/** 렌더를 시작만 시키고 즉시 반환한다. 실제 진행은 fetchRenderStatus로 폴링한다. */
export async function startRender(): Promise<RenderStartResult> {
  const res = await fetch("/api/render", { method: "POST" });
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
  /** 아직 처리 시작 전인 원본 클립 파일명(대기 순서대로). */
  pending: string[];
  /** 지금 프록시 생성 중인 원본 클립 파일명, 없으면 null. */
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

/** 클립 폴더 안 프레임 파일명 목록. 없으면 빈 배열. */
export async function fetchDraftFrames(clipFolder: string): Promise<string[]> {
  const res = await fetch(`/api/draft-frames/${encodeURIComponent(clipFolder)}`);
  if (!res.ok) {
    return [];
  }
  return (await res.json()) as string[];
}
