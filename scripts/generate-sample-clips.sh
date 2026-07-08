#!/usr/bin/env bash
# Generates sample test clips with ffmpeg testsrc/sine (no copyright/size concerns).
# Regenerate: bash scripts/generate-sample-clips.sh
# Output goes to media/clips/ (repo-relative), regardless of the caller's cwd.
set -euo pipefail
OUT_DIR="$(dirname "$0")/../media/clips"
mkdir -p "$OUT_DIR"
cd "$OUT_DIR"

FFMPEG=${FFMPEG:-ffmpeg}

# cut_01.mp4: testsrc2 pattern + 440Hz sine wave, 12s, 1920x1080@30fps
"$FFMPEG" -y -f lavfi -i "testsrc2=size=1920x1080:rate=30:duration=12" \
  -f lavfi -i "sine=frequency=440:sample_rate=48000:duration=12" \
  -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest cut_01.mp4

# cut_02.mp4: SMPTE color bars + 880Hz sine wave, 12s, 1920x1080@30fps (visually/audibly distinct from cut_01)
"$FFMPEG" -y -f lavfi -i "smptebars=size=1920x1080:rate=30:duration=12" \
  -f lavfi -i "sine=frequency=880:sample_rate=48000:duration=12" \
  -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest cut_02.mp4

# bgm_test.m4a: 220Hz sine wave, 15s (audio only, for verifying the bgm render path)
"$FFMPEG" -y -f lavfi -i "sine=frequency=220:sample_rate=48000:duration=15" \
  -c:a aac bgm_test.m4a

echo "Done: cut_01.mp4, cut_02.mp4, bgm_test.m4a"
