#!/usr/bin/env bash
# Generates tiny E2E fixture media (ffmpeg testsrc/sine, no copyright/size concerns) - same pattern
# as scripts/generate-sample-clips.sh, just shorter (kept under the E2E suite's <2min budget).
# Called from tests/e2e/global-setup.ts; safe to re-run (skips files that already exist).
set -euo pipefail
OUT_DIR="$1"
mkdir -p "$OUT_DIR"
cd "$OUT_DIR"

FFMPEG=${FFMPEG:-ffmpeg}

if [ ! -f cut_01.mp4 ]; then
  "$FFMPEG" -y -f lavfi -i "testsrc2=size=640x360:rate=24:duration=3" \
    -f lavfi -i "sine=frequency=440:sample_rate=44100:duration=3" \
    -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest cut_01.mp4
fi

if [ ! -f cut_02.mp4 ]; then
  "$FFMPEG" -y -f lavfi -i "smptebars=size=640x360:rate=24:duration=3" \
    -f lavfi -i "sine=frequency=880:sample_rate=44100:duration=3" \
    -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest cut_02.mp4
fi

if [ ! -f bgm_test.m4a ]; then
  "$FFMPEG" -y -f lavfi -i "sine=frequency=220:sample_rate=44100:duration=4" \
    -c:a aac bgm_test.m4a
fi

# A "long clip" fixture for the TrimStrip zoom/precision journey (task #25) - the real-world case
# is a knitting long-take up to ~40min (docs/research/trim-ux-conventions.md), but 40min (or even
# the 900s used in QA notes elsewhere) would blow this suite's <2min budget just to encode once.
# 180s is already long enough that the default viewport (padded in/out, floored at 20s) is a small
# fraction of the clip - the property the journey actually needs to exercise - while encoding in a
# few seconds (ultrafast preset, no audio needed).
if [ ! -f cut_long.mp4 ]; then
  "$FFMPEG" -y -f lavfi -i "testsrc2=size=640x360:rate=24:duration=180" \
    -c:v libx264 -preset ultrafast -pix_fmt yuv420p -an cut_long.mp4
fi

echo "Fixture media ready in $OUT_DIR"
