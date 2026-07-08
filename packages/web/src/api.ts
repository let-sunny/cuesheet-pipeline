import type { CueSheet } from "@cuesheet/schema";

/** 아직 초안(큐시트 파일)이 생성되지 않은 빈 상태 - PRD 8절 "초안 없음(빈 상태)" 카탈로그. */
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

export async function saveCueSheet(cuesheet: CueSheet): Promise<SaveResult> {
  const res = await fetch("/api/cuesheet", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuesheet),
  });
  return (await res.json()) as SaveResult;
}

export type RenderStartResult = { ok: true; jobId: string } | { ok: false; error: string };

/** 렌더를 시작만 시키고 즉시 반환한다. 실제 진행은 fetchRenderStatus로 폴링한다.
 * burnSubtitles: false면 drawtext 없이 CC/SRT 트랙과 조합할 클린 영상을 만든다(기본 true). */
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

export interface NarrationFile {
  name: string;
  /** ffprobe로 읽은 길이(초). 프로빙 실패 시 null. */
  durationS: number | null;
}

export interface NarrationFilesResult {
  files: NarrationFile[];
  /** 폴더 미설정/미존재 등 안내 메시지. 정상 목록이면 없음. */
  note?: string;
}

/**
 * dir 안의 오디오 파일 목록(길이 포함)을 가져온다. dir을 넘기면 그 값을 그대로
 * 쓴다(저장 전 편집 중인 폴더 경로도 즉시 반영하기 위함) — 생략하면 서버가
 * 디스크에 저장된 큐시트의 narration.dir로 대체한다.
 */
export async function fetchNarrationFiles(dir?: string): Promise<NarrationFilesResult> {
  const query = dir ? `?dir=${encodeURIComponent(dir)}` : "";
  const res = await fetch(`/api/narration-files${query}`);
  return (await res.json()) as NarrationFilesResult;
}

/** 내레이션 파일 미리듣기 스트리밍 URL. dir은 fetchNarrationFiles와 동일한 의미. */
export function narrationFileUrl(name: string, dir?: string): string {
  const query = dir ? `?dir=${encodeURIComponent(dir)}` : "";
  return `/api/narration-files/${encodeURIComponent(name)}${query}`;
}

export interface ClipFile {
  name: string;
  /** ffprobe로 읽은 길이(초). iCloud 미다운로드 등으로 알 수 없으면 null. */
  durationS: number | null;
}

export interface ClipFilesResult {
  files: ClipFile[];
  /** clipDir 미설정/접근 불가 등 안내 메시지. 정상 목록이면 없음. */
  note?: string;
}

/** 디스크에 저장된 큐시트의 clipDir 안 비디오 파일 목록(길이 포함) — 인트로/아웃트로 선택용. */
export async function fetchClipFiles(): Promise<ClipFilesResult> {
  const res = await fetch("/api/clip-files");
  if (!res.ok) {
    return { files: [] };
  }
  return (await res.json()) as ClipFilesResult;
}
