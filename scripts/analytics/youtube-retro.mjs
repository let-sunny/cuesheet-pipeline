#!/usr/bin/env node
// Episode retro: for the channel's recent uploads, pull each video's OWN first N days from the
// YouTube Analytics API and print a same-age comparison as markdown (see lib/retro-report.mjs).
//
// Usage:
//   pnpm retro [--days 8] [--max 12] [--out <report.md>] [--dump <raw.json>]
//   pnpm retro --from <raw.json> [--out <report.md>]     # rebuild a report offline
//
// Credentials (read from the environment, never from a file in this repo):
//   YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN
// See scripts/analytics/README.md for how to obtain them.

import { readFileSync, writeFileSync } from "node:fs";
import { buildRetroMarkdown, isWindowComplete, summarizeVideo, windowDates } from "./lib/retro-report.mjs";
import { getAccessToken, listUploads, queryVideoReport } from "./lib/youtube-api.mjs";

const flags = parseFlags(process.argv.slice(2));
const days = Number(flags.days ?? 8);
const now = new Date().toISOString();

const raw = flags.from ? JSON.parse(readFileSync(flags.from, "utf-8")) : await fetchRaw();
if (flags.dump) writeFileSync(flags.dump, JSON.stringify(raw, null, 2));

const summaries = raw.videos.map((v) => summarizeVideo(v.video, v.totals, v.bySource));
const markdown = buildRetroMarkdown(summaries, { days: raw.days, generatedAt: raw.generatedAt });
if (flags.out) {
  writeFileSync(flags.out, markdown);
  console.error(`Retro written: ${summaries.length} videos -> ${flags.out}`);
} else {
  process.stdout.write(markdown);
}

async function fetchRaw() {
  const credentials = {
    clientId: process.env.YT_CLIENT_ID,
    clientSecret: process.env.YT_CLIENT_SECRET,
    refreshToken: process.env.YT_REFRESH_TOKEN,
  };
  const missing = Object.entries(credentials).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length > 0) {
    console.error(
      `Missing credentials: ${missing.join(", ")}. Set YT_CLIENT_ID, YT_CLIENT_SECRET and YT_REFRESH_TOKEN (see scripts/analytics/README.md), or pass --from <raw.json>.`,
    );
    process.exit(1);
  }

  const token = await getAccessToken(credentials);
  const uploads = await listUploads(token, Number(flags.max ?? 12));
  const videos = [];
  for (const video of uploads) {
    // A video still inside its first N days would be compared at a younger age than the rest.
    if (!isWindowComplete(video.publishedAt, days, now)) {
      console.error(`Skipping ${video.title}: its first ${days} days are not over yet`);
      continue;
    }
    const window = windowDates(video.publishedAt, days);
    const [totals] = await queryVideoReport(token, { videoId: video.videoId, ...window, metrics: TOTAL_METRICS });
    const bySource = await queryVideoReport(token, {
      videoId: video.videoId,
      ...window,
      metrics: ["views"],
      dimensions: ["insightTrafficSourceType"],
    });
    videos.push({ video, totals: totals ?? null, bySource });
  }
  return { days, generatedAt: now.slice(0, 10), videos };
}

function parseFlags(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const next = argv[i + 1];
    out[a.slice(2)] = next !== undefined && !next.startsWith("--") ? argv[++i] : "true";
  }
  return out;
}

const TOTAL_METRICS = ["views", "estimatedMinutesWatched", "averageViewPercentage", "subscribersGained"];
