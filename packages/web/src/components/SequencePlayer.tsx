import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Segment, SubtitleStyle } from "@cuesheet/schema";
import { Button } from "@astryxdesign/core/Button";

/** 외부(App.tsx의 Space 단축키 등)에서 이어재생을 제어하기 위한 핸들. */
export interface SequencePlayerHandle {
  togglePlay: () => void;
}

interface Props {
  segments: Segment[];
  /** 현재 재생/선택 중인 컷 인덱스(App의 selectedIndex와 공유). */
  currentIndex: number;
  subtitleStyle: SubtitleStyle;
  /** 자동 전환·미니 타임라인 클릭 모두 이 콜백 하나로 App의 selectedIndex를 갱신한다. */
  onIndexChange: (i: number) => void;
  /** 정지 버튼 — 이어재생 모드 종료(부모가 오버레이를 걷어낸다). */
  onExit: () => void;
}

function clipUrl(clip: string): string {
  return `/clips/${encodeURIComponent(clip)}`;
}

/**
 * 메타데이터 로드 완료를 기다린다. 클립이 브라우저가 디코딩할 수 없는 포맷(예: HEVC —
 * 프록시 생성이 실패/손상된 채 남아 원본 코덱 그대로 서빙되는 경우)이면 loadedmetadata가
 * 영영 발생하지 않으므로, error 이벤트도 함께 듣고 false로 해소해 무한 대기를 막는다.
 * 이미 이 비디오 엘리먼트에서 로드가 실패한 적 있으면(video.error 존재) 이벤트가 다시
 * 발생하지 않으므로 즉시 false로 해소한다.
 */
function waitForMetadata(video: HTMLVideoElement): Promise<boolean> {
  if (video.readyState >= 1) {
    return Promise.resolve(true);
  }
  if (video.error) {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    const cleanup = () => {
      video.removeEventListener("loadedmetadata", onReady);
      video.removeEventListener("error", onError);
    };
    const onReady = () => {
      cleanup();
      resolve(true);
    };
    const onError = () => {
      cleanup();
      resolve(false);
    };
    video.addEventListener("loadedmetadata", onReady);
    video.addEventListener("error", onError);
  });
}

/** drawtext 재현이 아니라 대략적인 위치/색 확인용 텍스트 그림자 외곽선. */
function outlineShadow(color: string, width: number): string | undefined {
  if (width <= 0) {
    return undefined;
  }
  const w = width;
  return [
    `-${w}px -${w}px 0 ${color}`,
    `${w}px -${w}px 0 ${color}`,
    `-${w}px ${w}px 0 ${color}`,
    `${w}px ${w}px 0 ${color}`,
  ].join(", ");
}

/**
 * 본편 전체 이어재생. 세그먼트를 순서대로 in~out만 재생하고 컷이 끝나면
 * 다음 컷으로 자동 전환한다(같은 클립이면 시킹만, 다른 클립이면 두 개의
 * <video> 슬롯을 스왑 — 다음 클립을 미리 로드해 둔다). 렌더 결과와의 미세한
 * 타이밍 차이는 허용되는 검토용 미리보기다.
 */
export const SequencePlayer = forwardRef<SequencePlayerHandle, Props>(function SequencePlayer(
  { segments, currentIndex, subtitleStyle, onIndexChange, onExit },
  ref,
) {
  const videoRefs = [useRef<HTMLVideoElement | null>(null), useRef<HTMLVideoElement | null>(null)] as const;
  const clipOfSlot = useRef<[string | null, string | null]>([null, null]);
  const [front, setFront] = useState<0 | 1>(0);
  const frontRef = useRef<0 | 1>(0);
  const [playing, setPlaying] = useState(true);
  const playingRef = useRef(playing);
  const advancingRef = useRef(false);
  const segmentsRef = useRef(segments);
  const onIndexChangeRef = useRef(onIndexChange);

  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);
  useEffect(() => {
    onIndexChangeRef.current = onIndexChange;
  }, [onIndexChange]);
  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);
  useEffect(() => {
    frontRef.current = front;
  }, [front]);

  function loadClipInto(slot: 0 | 1, clip: string): Promise<boolean> {
    const video = videoRefs[slot].current;
    if (!video) {
      return Promise.resolve(true);
    }
    if (clipOfSlot.current[slot] === clip) {
      return waitForMetadata(video);
    }
    clipOfSlot.current[slot] = clip;
    video.src = clipUrl(clip);
    return waitForMetadata(video);
  }

  // 현재 컷(currentIndex)으로 전환 — 미니 타임라인 클릭(외부)과 자동 전환(내부)이
  // 둘 다 onIndexChange를 거쳐 이 prop을 바꾸므로 한 경로로 처리된다.
  useEffect(() => {
    let cancelled = false;
    advancingRef.current = false;

    void (async () => {
      const seg = segmentsRef.current[currentIndex];
      if (!seg) {
        setPlaying(false);
        return;
      }
      const oldFront = frontRef.current;
      const back = oldFront === 0 ? 1 : 0;
      let activeSlot: 0 | 1;

      if (clipOfSlot.current[oldFront] === seg.clip) {
        activeSlot = oldFront;
      } else if (clipOfSlot.current[back] === seg.clip) {
        activeSlot = back;
      } else {
        activeSlot = oldFront;
      }
      // 미리 로드해 둔 슬롯이라도 loadedmetadata가 실제로 끝났다는 보장은 없다
      // (프리로드는 fire-and-forget) — 그대로 play()를 호출하면 컷 길이가 짧을 때
      // readyState 0 상태에서 NotSupportedError가 난다. 항상 대기한다
      // (loadClipInto는 이미 로드된 클립이면 즉시 반환하는 멱등 함수).
      const loaded = await loadClipInto(activeSlot, seg.clip);
      if (cancelled) {
        return;
      }

      if (!loaded) {
        // 디코딩 자체가 불가능한 클립(코덱 미지원, 손상된 프록시 등) — loadedmetadata가
        // 영영 안 오므로 여기서 멈추지 않고 다음 컷으로 건너뛴다(무한 정지 방지).
        console.warn(`[SequencePlayer] 재생할 수 없는 클립, 건너뜀: ${seg.clip}`);
        const next = segmentsRef.current[currentIndex + 1];
        if (next) {
          onIndexChangeRef.current(currentIndex + 1);
        } else {
          setPlaying(false);
        }
        return;
      }

      if (activeSlot !== oldFront) {
        videoRefs[oldFront].current?.pause();
        frontRef.current = activeSlot;
        setFront(activeSlot);
      }

      const video = videoRefs[activeSlot].current;
      if (video) {
        video.currentTime = seg.in;
        video.playbackRate = seg.speed;
        video.volume = seg.volume;
        if (playingRef.current) {
          void video.play();
        }
      }

      // 다음 컷을 남는 슬롯에 미리 로드(다른 클립일 때만).
      const nextSeg = segmentsRef.current[currentIndex + 1];
      if (nextSeg) {
        const idleSlot = activeSlot === 0 ? 1 : 0;
        if (clipOfSlot.current[idleSlot] !== nextSeg.clip && clipOfSlot.current[activeSlot] !== nextSeg.clip) {
          void loadClipInto(idleSlot, nextSeg.clip);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  // 재생/일시정지 토글을 현재 활성 슬롯에 반영. 마운트 직후(currentIndex 이펙트가
  // 아직 src를 채우기 전)에는 currentSrc가 비어 있어 play()가 NotSupportedError를
  // 던지므로, 소스가 실제로 로드된 뒤에만 반영한다.
  useEffect(() => {
    const video = videoRefs[front].current;
    if (!video || !video.currentSrc) {
      return;
    }
    if (playing) {
      void video.play();
    } else {
      video.pause();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, front]);

  // out 지점을 넘으면 다음 컷으로 — 두 슬롯 모두에 걸어두고 지금 active(front)인
  // 쪽만 반응한다(스왑 직후에도 리스너가 끊기지 않게).
  useEffect(() => {
    const cleanups: Array<() => void> = [];
    videoRefs.forEach((videoRef, slot) => {
      const video = videoRef.current;
      if (!video) {
        return;
      }
      const handleTimeUpdate = () => {
        if (frontRef.current !== slot || advancingRef.current) {
          return;
        }
        const seg = segmentsRef.current[currentIndex];
        if (!seg || video.currentTime < seg.out) {
          return;
        }
        const next = segmentsRef.current[currentIndex + 1];
        if (next) {
          advancingRef.current = true;
          onIndexChangeRef.current(currentIndex + 1);
        } else {
          video.pause();
          setPlaying(false);
        }
      };
      video.addEventListener("timeupdate", handleTimeUpdate);
      cleanups.push(() => video.removeEventListener("timeupdate", handleTimeUpdate));
    });
    return () => cleanups.forEach((fn) => fn());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  useImperativeHandle(
    ref,
    () => ({
      togglePlay: () => setPlaying((p) => !p),
    }),
    [],
  );

  const currentSegment = segments[currentIndex];
  const subtitle = currentSegment?.subtitle.trim() ?? "";

  return (
    <div className="sequence-player">
      <div className="sequence-player-stage">
        <video
          ref={videoRefs[0]}
          className={front === 0 ? "sequence-video visible" : "sequence-video hidden"}
          playsInline
        />
        <video
          ref={videoRefs[1]}
          className={front === 1 ? "sequence-video visible" : "sequence-video hidden"}
          playsInline
        />
        {subtitle !== "" ? (
          <div
            className={`sequence-subtitle sequence-subtitle-${subtitleStyle.position}`}
            style={{
              color: subtitleStyle.color,
              fontFamily: subtitleStyle.font,
              textShadow: outlineShadow(subtitleStyle.outlineColor, subtitleStyle.outlineWidth),
            }}
          >
            {subtitle}
          </div>
        ) : null}
        {!currentSegment ? <div className="sequence-player-ended">끝</div> : null}
      </div>

      <div className="sequence-player-controls">
        <span className="sequence-player-counter">
          {segments.length > 0 ? `${currentIndex + 1} / ${segments.length}` : "0 / 0"}
        </span>
        <Button
          label={playing ? "일시정지" : "재생"}
          variant="secondary"
          isDisabled={!currentSegment}
          onClick={() => setPlaying((p) => !p)}
        />
        <Button label="정지" variant="ghost" onClick={onExit} />
      </div>
    </div>
  );
});
