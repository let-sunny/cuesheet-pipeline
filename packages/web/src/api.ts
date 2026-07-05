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

export type RenderResult = { ok: true; path: string } | { ok: false; error: string };

export async function renderCueSheet(): Promise<RenderResult> {
  const res = await fetch("/api/render", { method: "POST" });
  return (await res.json()) as RenderResult;
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
