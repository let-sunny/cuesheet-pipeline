import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { MouseEvent } from "react";
import type { Segment, SubtitleStyle } from "@cuesheet/schema";
import { Button } from "@astryxdesign/core/Button";
import { cropPreviewStyle } from "../cropPreview.js";
import type { ClipMoments } from "../api.js";
import { matchSceneInfo } from "../sceneInfo.js";
import {
  mergeSubtitleStyle,
  subtitleBackgroundRgba,
  subtitleOutlineStyle,
  subtitlePositionStyle,
  toCqw,
} from "../subtitleOverlay.js";

/** 외부(App.tsx의 Space 단축키 등)에서 이어재생을 제어하기 위한 핸들. */
export interface SequencePlayerHandle {
  togglePlay: () => void;
  /** L: 정방향 재생/배속 셔틀(연타 시 1x -> 2x -> 4x). */
  shuttleForward: () => void;
  /** J: 역방향 재생/배속 셔틀(근사, 연타 시 1x -> 2x -> 4x, 오디오 음소거). */
  shuttleBackward: () => void;
  /** K: 셔틀 정지. */
  shuttleStop: () => void;
}

interface Props {
  segments: Segment[];
  /** 현재 재생/선택 중인 컷 인덱스(App의 selectedIndex와 공유). */
  currentIndex: number;
  /** 초벌 비전 판독 데이터 — 현재 컷의 장면 묘사를 자막 위에 작게 표시하는 데 쓴다. */
  moments: ClipMoments[];
  subtitleStyle: SubtitleStyle;
  /** subtitleStyle.margin(px, 원본 해상도 기준)을 스테이지 비율(%)로 환산하는 데 쓴다. */
  projectHeight: number;
  /** subtitleStyle.size/outlineWidth(px, 원본 해상도 기준)를 스테이지 폭 대비 cqw로 환산하는 데 쓴다. */
  projectWidth: number;
  /** 자동 전환·미니 타임라인 클릭 모두 이 콜백 하나로 App의 selectedIndex를 갱신한다. */
  onIndexChange: (i: number) => void;
  /** 닫기 버튼 — 이어재생 모드 종료(부모가 스티키 플레이어 영역을 걷어낸다). */
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

/** 세그먼트의 출력 타임라인상 재생 길이(초). speed가 빠를수록 짧아진다. */
function playbackSeconds(seg: Segment): number {
  return (seg.out - seg.in) / seg.speed;
}

function formatClock(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds) && totalSeconds > 0 ? totalSeconds : 0;
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** 사용자 미리보기 배속 선택지. 세그먼트 자체 speed와 곱해 적용한다. */
const RATE_OPTIONS = [1, 1.5, 2] as const;

/**
 * 본편 전체 이어재생. 세그먼트를 순서대로 in~out만 재생하고 컷이 끝나면
 * 다음 컷으로 자동 전환한다(같은 클립이면 시킹만, 다른 클립이면 두 개의
 * <video> 슬롯을 스왑 — 다음 클립을 미리 로드해 둔다). 렌더 결과와의 미세한
 * 타이밍 차이는 허용되는 검토용 미리보기다.
 */
export const SequencePlayer = forwardRef<SequencePlayerHandle, Props>(function SequencePlayer(
  { segments, currentIndex, moments, subtitleStyle, projectHeight, projectWidth, onIndexChange, onExit },
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
  // 사용자 미리보기 배속(1x/1.5x/2x) — 세그먼트 자체 speed와 곱해 video.playbackRate에 반영한다.
  const [userRate, setUserRate] = useState<number>(1);
  const userRateRef = useRef(userRate);
  // 진행 바 표시용 — 활성 슬롯의 현재 source 시각(초). timeupdate에서 갱신한다.
  const [videoNow, setVideoNow] = useState(0);
  // 진행 바 클릭 시킹 중 다른 세그먼트로 넘어가야 할 때, 다음 currentIndex 이펙트가
  // seg.in 대신 사용할 source 시각을 1회성으로 전달하는 통로.
  const pendingSeekRef = useRef<{ index: number; time: number } | null>(null);
  // J/K/L 셔틀 상태(VideoPreview와 동일한 방식) — "stopped"는 셔틀이 관여하지 않는
  // 평상시 재생/일시정지(userRate 배속 등 기존 로직이 담당).
  const shuttleDirectionRef = useRef<"stopped" | "forward" | "backward">("stopped");
  const shuttleLevelRef = useRef(1);
  const shuttleRafRef = useRef<number | null>(null);
  const shuttleLastTsRef = useRef<number | undefined>(undefined);

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
  // 언마운트 시 역재생 rAF 루프가 남아있지 않게 정리한다.
  useEffect(() => {
    return () => stopShuttleRaf();
  }, []);
  useEffect(() => {
    userRateRef.current = userRate;
    // 재생 중 배속 토글 — 컷 전환을 기다리지 않고 지금 보고 있는 비디오에 바로 반영한다.
    const video = videoRefs[frontRef.current].current;
    const seg = segmentsRef.current[currentIndex];
    if (video && seg) {
      video.playbackRate = seg.speed * userRate;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userRate]);

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

  function stopShuttleRaf() {
    if (shuttleRafRef.current !== null) {
      cancelAnimationFrame(shuttleRafRef.current);
      shuttleRafRef.current = null;
    }
  }

  /** 셔틀(J/K/L)을 평상시 상태로 되돌린다 — 배속을 seg.speed*userRate로 복원한다. */
  function resetShuttle() {
    stopShuttleRaf();
    shuttleDirectionRef.current = "stopped";
    shuttleLevelRef.current = 1;
    const video = videoRefs[frontRef.current].current;
    const seg = segmentsRef.current[currentIndex];
    if (video) {
      video.muted = false;
      if (seg) {
        video.playbackRate = seg.speed * userRateRef.current;
      }
    }
  }

  function shuttleStop() {
    const video = videoRefs[frontRef.current].current;
    resetShuttle();
    if (video) {
      video.pause();
    }
    setPlaying(false);
  }

  /** 역재생 프레임 루프 — 활성 슬롯 video는 일시정지 상태로 두고 rAF마다 currentTime을
      직접 깎는다(음수 playbackRate 미지원 근사). 컷 경계는 넘지 않고 0에서 멈춘다. */
  function reverseTick(ts: number) {
    const video = videoRefs[frontRef.current].current;
    if (!video || shuttleDirectionRef.current !== "backward") {
      stopShuttleRaf();
      return;
    }
    const last = shuttleLastTsRef.current;
    shuttleLastTsRef.current = ts;
    if (last === undefined) {
      shuttleRafRef.current = requestAnimationFrame(reverseTick);
      return;
    }
    const dt = (ts - last) / 1000;
    const next = Math.max(0, video.currentTime - dt * shuttleLevelRef.current);
    video.currentTime = next;
    setVideoNow(next);
    if (next <= 0) {
      shuttleStop();
      return;
    }
    shuttleRafRef.current = requestAnimationFrame(reverseTick);
  }

  /** L: 정방향 재생. 연타 시 1x -> 2x -> 4x로 배속이 오른다(4x 상한). 역재생 중이면
      정방향 1x로 전환한다. */
  function shuttleForward() {
    const video = videoRefs[frontRef.current].current;
    const seg = segmentsRef.current[currentIndex];
    if (!video || !seg) {
      return;
    }
    if (shuttleDirectionRef.current === "forward") {
      shuttleLevelRef.current = shuttleLevelRef.current >= 4 ? 4 : shuttleLevelRef.current * 2;
    } else {
      stopShuttleRaf();
      shuttleDirectionRef.current = "forward";
      shuttleLevelRef.current = 1;
      video.muted = false;
    }
    video.playbackRate = seg.speed * shuttleLevelRef.current;
    video.volume = seg.volume;
    setPlaying(true);
    void video.play();
  }

  /** J: 역방향 재생(근사). 연타 시 1x -> 2x -> 4x. 오디오는 의미가 없어 음소거한다.
      정방향 재생 중이면 역방향 1x로 전환한다. */
  function shuttleBackward() {
    const video = videoRefs[frontRef.current].current;
    const seg = segmentsRef.current[currentIndex];
    if (!video || !seg) {
      return;
    }
    if (shuttleDirectionRef.current === "backward") {
      shuttleLevelRef.current = shuttleLevelRef.current >= 4 ? 4 : shuttleLevelRef.current * 2;
      return;
    }
    video.pause();
    setPlaying(false);
    shuttleDirectionRef.current = "backward";
    shuttleLevelRef.current = 1;
    video.muted = true;
    stopShuttleRaf();
    shuttleLastTsRef.current = undefined;
    shuttleRafRef.current = requestAnimationFrame(reverseTick);
  }

  // 현재 컷(currentIndex)으로 전환 — 미니 타임라인 클릭(외부)과 자동 전환(내부)이
  // 둘 다 onIndexChange를 거쳐 이 prop을 바꾸므로 한 경로로 처리된다.
  useEffect(() => {
    let cancelled = false;
    advancingRef.current = false;
    // 컷이 바뀌면 이전 컷 기준으로 돌던 셔틀(J/K/L)은 정리한다(정방향 배속/역재생 루프 모두).
    resetShuttle();

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
        // 진행 바 클릭 시킹으로 이 컷에 도착한 경우 seg.in이 아니라 그 지정 지점부터 시작한다.
        const pending = pendingSeekRef.current;
        pendingSeekRef.current = null;
        video.currentTime = pending && pending.index === currentIndex ? pending.time : seg.in;
        video.playbackRate = seg.speed * userRateRef.current;
        video.volume = seg.volume;
        setVideoNow(video.currentTime);
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
        if (frontRef.current !== slot) {
          return;
        }
        setVideoNow(video.currentTime);
        if (advancingRef.current) {
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
      togglePlay: () => {
        resetShuttle();
        setPlaying((p) => !p);
      },
      shuttleForward,
      shuttleBackward,
      shuttleStop,
    }),
    // shuttle* 함수들은 segmentsRef.current[currentIndex]를 클로저로 참조하므로
    // currentIndex가 바뀔 때마다 핸들을 다시 만들어야 최신 컷을 가리킨다(togglePlay는
    // setPlaying 함수형 업데이트만 쓰므로 currentIndex 의존이 없어도 안전하다).
    [currentIndex],
  );

  const currentSegment = segments[currentIndex];
  const subtitle = currentSegment?.subtitle.trim() ?? "";
  // 이 컷만의 스타일 오버라이드가 있으면 전역 subtitleStyle에 병합한 결과를 쓴다
  // (렌더/미리보기 모두 같은 병합 규칙 — subtitleOverlay.ts 참고).
  const effectiveStyle = mergeSubtitleStyle(subtitleStyle, currentSegment?.styleOverride);
  // 처음 보는 사람도 지금 재생 중인 컷이 무슨 장면인지 알 수 있도록 자막 위에
  // 작게 힌트를 띄운다. 매칭 실패 컷은 조용히 숨긴다(이어재생 몰입을 방해하지 않기
  // 위함 — "장면 정보 없음" 명시는 컷 리스트/인스펙터에서만 강제한다).
  const sceneHint = currentSegment ? matchSceneInfo(currentSegment, moments) : { kind: "none" as const };
  const sceneHintText = sceneHint.kind !== "none" ? sceneHint.memo : null;

  // 출력 타임라인 기준 누적 오프셋(초) — 진행 바/시간 표시/클릭 시킹 모두 이 기준을 쓴다.
  const cumulativeStart: number[] = [];
  let totalOutputSeconds = 0;
  for (const seg of segments) {
    cumulativeStart.push(totalOutputSeconds);
    totalOutputSeconds += playbackSeconds(seg);
  }
  const currentOutputPosition = currentSegment
    ? (cumulativeStart[currentIndex] ?? 0) + Math.max(0, videoNow - currentSegment.in) / currentSegment.speed
    : totalOutputSeconds;
  const progressRatio = totalOutputSeconds > 0 ? Math.min(1, currentOutputPosition / totalOutputSeconds) : 0;

  function goToPrevCut() {
    if (currentIndex > 0) {
      onIndexChange(currentIndex - 1);
    }
  }

  function goToNextCut() {
    if (currentIndex < segments.length - 1) {
      onIndexChange(currentIndex + 1);
    }
  }

  // 진행 바 클릭 시킹 — 클릭 위치(출력 타임라인 비율) -> 해당 컷 index + 컷 내 source 오프셋.
  function handleProgressClick(e: MouseEvent<HTMLDivElement>) {
    if (totalOutputSeconds <= 0 || segments.length === 0) {
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const targetOutput = ratio * totalOutputSeconds;

    let targetIndex = segments.length - 1;
    for (let i = 0; i < segments.length; i += 1) {
      const seg = segments[i];
      if (!seg) {
        continue;
      }
      const start = cumulativeStart[i] ?? 0;
      if (targetOutput < start + playbackSeconds(seg)) {
        targetIndex = i;
        break;
      }
    }
    const targetSeg = segments[targetIndex];
    if (!targetSeg) {
      return;
    }
    const offsetOutput = Math.max(0, targetOutput - (cumulativeStart[targetIndex] ?? 0));
    const sourceTime = Math.min(targetSeg.out, targetSeg.in + offsetOutput * targetSeg.speed);

    if (targetIndex === currentIndex) {
      const video = videoRefs[frontRef.current].current;
      if (video) {
        video.currentTime = sourceTime;
        setVideoNow(sourceTime);
      }
      return;
    }
    pendingSeekRef.current = { index: targetIndex, time: sourceTime };
    onIndexChange(targetIndex);
  }

  return (
    <div className="sequence-player">
      <div className="sequence-player-stage">
        <video
          ref={videoRefs[0]}
          className={front === 0 ? "sequence-video visible" : "sequence-video hidden"}
          style={front === 0 ? cropPreviewStyle(currentSegment?.crop) : undefined}
          playsInline
        />
        <video
          ref={videoRefs[1]}
          className={front === 1 ? "sequence-video visible" : "sequence-video hidden"}
          style={front === 1 ? cropPreviewStyle(currentSegment?.crop) : undefined}
          playsInline
        />
        {sceneHintText ? (
          <div className="sequence-scene-hint" title={sceneHintText}>
            {sceneHintText}
          </div>
        ) : null}
        {subtitle !== "" ? (
          <div
            className={`sequence-subtitle sequence-subtitle-${effectiveStyle.position}`}
            style={{
              color: effectiveStyle.color,
              fontFamily: effectiveStyle.font,
              fontSize: toCqw(effectiveStyle.size, projectWidth),
              ...subtitleOutlineStyle(
                effectiveStyle.outlineWidth,
                toCqw(effectiveStyle.outlineWidth, projectWidth),
                effectiveStyle.outlineColor,
              ),
              // effectiveStyle.margin(원본 px)을 스테이지 높이 대비 %로 환산한 근사치 —
              // 스테이지는 고정 16:9(styles.css)라 project 실제 화면비와 다를 수 있지만,
              // top/bottom 오프셋을 CSS 고정값(24px) 대신 반영하는 데는 이 정도 근사로 충분하다.
              ...subtitlePositionStyle(effectiveStyle, projectHeight),
            }}
          >
            <span
              className="sequence-subtitle-text"
              style={
                effectiveStyle.background
                  ? {
                      background: subtitleBackgroundRgba(
                        effectiveStyle.background.color,
                        effectiveStyle.background.opacity,
                      ),
                      padding: `${effectiveStyle.background.padding}px`,
                    }
                  : undefined
              }
            >
              {subtitle}
            </span>
          </div>
        ) : null}
        {!currentSegment ? <div className="sequence-player-ended">끝</div> : null}
      </div>

      <div
        className="sequence-player-progress"
        onClick={handleProgressClick}
        role="slider"
        aria-label="전체 재생 진행"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progressRatio * 100)}
      >
        <div className="sequence-player-progress-fill" style={{ width: `${progressRatio * 100}%` }} />
      </div>

      <div className="sequence-player-controls">
        <div className="sequence-player-transport">
          <Button label="이전 컷" variant="ghost" isDisabled={currentIndex <= 0} onClick={goToPrevCut} />
          <Button
            label={playing ? "일시정지" : "재생"}
            variant="secondary"
            isDisabled={!currentSegment}
            onClick={() => setPlaying((p) => !p)}
          />
          <Button
            label="다음 컷"
            variant="ghost"
            isDisabled={currentIndex >= segments.length - 1}
            onClick={goToNextCut}
          />
        </div>

        <div className="sequence-player-speed-toggle">
          {RATE_OPTIONS.map((rate) => (
            <button
              key={rate}
              type="button"
              className={userRate === rate ? "active" : ""}
              onClick={() => setUserRate(rate)}
            >
              {rate}x
            </button>
          ))}
        </div>

        <span className="sequence-player-counter">
          컷 {segments.length > 0 ? `${currentIndex + 1}/${segments.length}` : "0/0"} ·{" "}
          {formatClock(currentOutputPosition)} / {formatClock(totalOutputSeconds)}
        </span>

        <Button label="닫기" variant="ghost" onClick={onExit} />
      </div>
    </div>
  );
});
