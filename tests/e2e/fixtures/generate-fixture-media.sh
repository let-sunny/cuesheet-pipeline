#!/usr/bin/env bash
# Generates tiny E2E fixture media (ffmpeg testsrc/sine, no copyright/size concerns) - same pattern
# as scripts/generate-sample-clips.sh, just shorter (kept under the E2E suite's <2min budget).
# Called from tests/e2e/global-setup.ts; safe to re-run (skips files that already exist).
#
# Filenames are prefixed e2e_ deliberately (2026-07-09 incident) - the dev server's proxy cache
# (apps/web/src/server/media.ts's media/proxies/) is a single directory shared across whatever
# project happens to be running, keyed only by clip basename, not by clipDir. Plain names like
# cut_01.mp4/cut_02.mp4 collide with this repo's own real demo project (project.cuesheet.json's
# clipDir, media/clips/cut_01.mp4+cut_02.mp4) - running this suite silently overwrote the real
# project's cached proxies with this fixture's synthetic content. The e2e_ prefix guarantees no
# collision regardless of what a real project's clips happen to be named.
set -euo pipefail
OUT_DIR="$1"
mkdir -p "$OUT_DIR"
cd "$OUT_DIR"

FFMPEG=${FFMPEG:-ffmpeg}

if [ ! -f e2e_cut_01.mp4 ]; then
  "$FFMPEG" -y -f lavfi -i "testsrc2=size=640x360:rate=24:duration=3" \
    -f lavfi -i "sine=frequency=440:sample_rate=44100:duration=3" \
    -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest e2e_cut_01.mp4
fi

if [ ! -f e2e_cut_02.mp4 ]; then
  "$FFMPEG" -y -f lavfi -i "smptebars=size=640x360:rate=24:duration=3" \
    -f lavfi -i "sine=frequency=880:sample_rate=44100:duration=3" \
    -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest e2e_cut_02.mp4
fi

if [ ! -f e2e_bgm_test.m4a ]; then
  "$FFMPEG" -y -f lavfi -i "sine=frequency=220:sample_rate=44100:duration=4" \
    -c:a aac e2e_bgm_test.m4a
fi

# A "long clip" fixture for the TrimStrip zoom/precision journey (task #25) - the real-world case
# is a knitting long-take up to ~40min (docs/research/trim-ux-conventions.md), but 40min (or even
# the 900s used in QA notes elsewhere) would blow this suite's <2min budget just to encode once.
# 180s is already long enough that the default viewport (padded in/out, floored at 20s) is a small
# fraction of the clip - the property the journey actually needs to exercise - while encoding in a
# few seconds (ultrafast preset, no audio needed).
if [ ! -f e2e_cut_long.mp4 ]; then
  "$FFMPEG" -y -f lavfi -i "testsrc2=size=640x360:rate=24:duration=180" \
    -c:v libx264 -preset ultrafast -pix_fmt yuv420p -an e2e_cut_long.mp4
fi

echo "Fixture media ready in $OUT_DIR"
