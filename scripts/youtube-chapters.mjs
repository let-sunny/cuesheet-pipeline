#!/usr/bin/env node
// Prototype: derive a YouTube chapter list from a cuesheet.
// Grammar basis (reverse-engineered from the user's published edits): chapter
// transitions coincide with no-subtitle stretches and timelapse connectors —
// a chapter starts at the first content cut AFTER such a break.
// Usage: node scripts/youtube-chapters.mjs <cuesheet.json>
// Output: "m:ss Title" lines ready to paste into a YouTube description.

import { readFileSync } from "node:fs";

const TIMELAPSE_SPEED_THRESHOLD = 8;
const MIN_CHAPTER_GAP_S = 20; // YouTube requires chapters >= 10s; keep sections meaningful

const path = process.argv[2] ?? "project.cuesheet.json";
const cue = JSON.parse(readFileSync(path, "utf-8"));

const clock = (s) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
};

const chapters = [];
let t = 0;
let breakPending = true; // episode start is always a chapter start

for (const seg of cue.segments) {
  const dur = (seg.out - seg.in) / (seg.speed ?? 1);
  const isTimelapse = (seg.speed ?? 1) >= TIMELAPSE_SPEED_THRESHOLD;
  const isSilent = !seg.subtitle || seg.subtitle.trim() === "";

  if (isTimelapse || isSilent) {
    breakPending = true; // passage/no-subtitle stretch -> next content cut opens a chapter
  } else if (breakPending) {
    const last = chapters[chapters.length - 1];
    if (!last || t - last.atS >= MIN_CHAPTER_GAP_S) {
      chapters.push({ atS: t, title: seg.subtitle.trim() });
    }
    breakPending = false;
  }
  t += dur;
}

if (chapters.length > 0) chapters[0].atS = 0; // YouTube mandates a 0:00 first chapter
for (const c of chapters) console.log(`${clock(c.atS)} ${c.title}`);
console.error(`\n${chapters.length} chapters over ${clock(t)} total (${path})`);
