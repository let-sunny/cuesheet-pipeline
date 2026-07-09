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

echo "Fixture media ready in $OUT_DIR"
