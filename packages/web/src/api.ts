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
