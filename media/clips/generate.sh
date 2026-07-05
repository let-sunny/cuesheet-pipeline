#!/usr/bin/env bash
# 테스트용 샘플 클립을 ffmpeg testsrc/sine으로 생성한다(저작권/용량 문제 없음).
# 재생성: bash media/clips/generate.sh
set -euo pipefail
cd "$(dirname "$0")"

FFMPEG=${FFMPEG:-ffmpeg}

# cut_01.mp4: testsrc2 패턴 + 440Hz 사인파, 12초, 1920x1080@30fps
"$FFMPEG" -y -f lavfi -i "testsrc2=size=1920x1080:rate=30:duration=12" \
  -f lavfi -i "sine=frequency=440:sample_rate=48000:duration=12" \
  -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest cut_01.mp4

# cut_02.mp4: SMPTE 컬러바 + 880Hz 사인파, 12초, 1920x1080@30fps (cut_01과 화면/소리 구분)
"$FFMPEG" -y -f lavfi -i "smptebars=size=1920x1080:rate=30:duration=12" \
  -f lavfi -i "sine=frequency=880:sample_rate=48000:duration=12" \
  -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest cut_02.mp4

# bgm_test.m4a: 220Hz 사인파, 15초 (오디오만, bgm 렌더 경로 검증용)
"$FFMPEG" -y -f lavfi -i "sine=frequency=220:sample_rate=48000:duration=15" \
  -c:a aac bgm_test.m4a

echo "생성 완료: cut_01.mp4, cut_02.mp4, bgm_test.m4a"
