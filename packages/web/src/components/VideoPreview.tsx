import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Button } from "@astryxdesign/core/Button";
import type { Crop, Segment, SubtitleStyle } from "@cuesheet/schema";
import { fetchProxyStatus, type ClipMoments, type ProxyStatus } from "../api.js";
import { cropPreviewStyle } from "../cropPreview.js";
import { matchSceneInfo, shotTypeLabel } from "../sceneInfo.js";
import {
  mergeSubtitleStyle,
  subtitleBackgroundRgba,
  subtitleOutlineStyle,
  subtitlePositionStyle,
  toCqw,
} from "../subtitleOverlay.js";
import { CropEditOverlay } from "./CropEditOverlay.js";

/** 프록시 준비 상태 폴링 주기(ms). */
const PROXY_STATUS_POLL_INTERVAL_MS = 10000;

/** 핸들 드래그 시 in/out 사이 최소 간격(초). */
const MIN_GAP = 0.05;
/** 분할 시 in/out 경계와 최소 간격(초). */
const SPLIT_MARGIN = 0.2;

type PlayMode = "loop" | "free";

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

interface Props {
  segment: Segment | undefined;
  selectedIndex: number;
  onChange: (patch: Partial<Segment>) => void;
  onSplit: (at: number) => void;
  /** 켜지면 선택 세그먼트가 바뀔 때(자막 쓰기 모드 등) 자동으로 재생을 시작한다. */
  autoPlay?: boolean;
  /** 초벌 비전 판독 데이터 — 비디오 위 맥락 헤더에 "지금 보는 게 무슨 장면인지" 보여주는 데 쓴다. */
  moments: ClipMoments[];
  /** 전역 자막 스타일 — 세그먼트 styleOverride와 병합해 비디오 위 자막 오버레이를 그리는 데 쓴다. */
  subtitleStyle: SubtitleStyle;
  /** subtitleStyle.margin(px, 원본 해상도 기준)을 오버레이 위치(%)로 환산하는 데 쓴다. */
  projectHeight: number;
  /** subtitleStyle.size/outlineWidth(px, 원본 해상도 기준)를 오버레이 폭 대비 cqw로 환산하는 데 쓴다. */
  projectWidth: number;
}

/** 외부(App.tsx의 전역 단축키 등)에서 미리보기를 제어하기 위한 핸들. */
export interface VideoPreviewHandle {
  togglePlay: () => void;
  seekBy: (deltaSeconds: number) => void;
  setInFromCurrent: () => void;
  setOutFromCurrent: () => void;
  splitAtCurrent: () => void;
  /** 크롭 편집 모드로 진입한다(기존 crop이 있으면 거기서, 없으면 전체 프레임에서 시작). */
  startCropEdit: () => void;
  /** L: 정방향 재생/배속 셔틀(연타 시 1x -> 2x -> 4x). */
  shuttleForward: () => void;
  /** J: 역방향 재생/배속 셔틀(근사, 연타 시 1x -> 2x -> 4x, 오디오 음소거). */
  shuttleBackward: () => void;
  /** K: 셔틀 정지. */
  shuttleStop: () => void;
}

/**
 * 선택된 세그먼트의 플레이어: 클립 전체 길이 기준 스크럽 타임라인 위에
 * in~out 구간을 표시하고, 핸들 드래그·버튼으로 in/out을 조정하며,
 * 현재 위치에서 세그먼트를 분할할 수 있다.
 */
export const VideoPreview = forwardRef<VideoPreviewHandle, Props>(function VideoPreview(
  { segment, selectedIndex, onChange, onSplit, autoPlay = false, moments, subtitleStyle, projectHeight, projectWidth },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const cropFrameRef = useRef<HTMLDivElement | null>(null);
  const [missing, setMissing] = useState(false);
  // null = 크롭 편집 모드 아님. 값이 있으면 편집 중인 draft crop(아직 세그먼트에 커밋 전).
  const [cropEditDraft, setCropEditDraft] = useState<Crop | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playMode, setPlayMode] = useState<PlayMode>("loop");
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevClipRef = useRef<string | undefined>(segment?.clip);
  const autoPlayRef = useRef(autoPlay);
  const [proxyStatus, setProxyStatus] = useState<ProxyStatus | null>(null);
  // 프록시가 새로 준비됐을 때 <video>를 강제로 다시 마운트해 새로 서빙되는
  // 프록시 파일을 다시 요청하게 만드는 값(원본 로드 실패로 남은 missing 상태도 함께 지운다).
  const [reloadToken, setReloadToken] = useState(0);
  // J/K/L 셔틀 상태 — 리렌더를 유발할 필요가 없는 재생 방향/배속이라 ref로만 관리한다.
  // "stopped"는 셔틀이 관여하지 않는 평상시 재생/일시정지 상태(기존 handlePlay 등이 담당).
  const shuttleDirectionRef = useRef<"stopped" | "forward" | "backward">("stopped");
  const shuttleLevelRef = useRef(1);
  const shuttleRafRef = useRef<number | null>(null);
  const shuttleLastTsRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    autoPlayRef.current = autoPlay;
  }, [autoPlay]);

  useEffect(() => {
    setMissing(false);
    setDuration(0);
    setCurrentTime(0);
  }, [segment?.clip]);

  // 선택된 컷이 바뀌면 진행 중이던 크롭 편집(다른 컷 기준 draft)은 버리고, 이전 컷
  // 기준으로 돌던 셔틀(J/K/L 배속/역재생)도 정리한다.
  useEffect(() => {
    setCropEditDraft(null);
    resetShuttle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex]);

  // 언마운트 시 역재생 rAF 루프가 남아있지 않게 정리한다.
  useEffect(() => {
    return () => {
      stopShuttleRaf();
    };
  }, []);

  // 선택된 클립이 프록시 생성 대기/진행 중이면 10초마다 상태를 확인해
  // 안내를 갱신하고, 준비가 끝나면 <video>를 다시 마운트해 프록시로 전환한다.
  //
  // 레이스 주의: 마운트 직후 첫 체크가 "이미 준비 중이 아님"으로 응답하면(애초에
  // 프록시 대기가 필요 없던 클립) reloadToken을 올리면 안 된다 — 그 시점엔 이미
  // 원본 <video>가 자기 src를 로딩 중일 수 있고, key 변경으로 인한 리마운트가 그
  // 진행 중이던 요청을 abort시켜 onError(missing=true)로 잘못 귀결된다(missing은
  // segment.clip이 바뀔 때만 리셋되므로 그 뒤로도 계속 굳어버림). 그래서 실제로
  // "준비 중 -> 준비 끝"으로 전환된 경우에만(즉 이 클립에 대해 한 번이라도
  // stillPreparing===true를 관측한 뒤에만) reloadToken을 올린다.
  useEffect(() => {
    const clip = segment?.clip;
    if (!clip) {
      return;
    }
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let wasPreparing = false;

    const check = async () => {
      try {
        const status = await fetchProxyStatus();
        if (stopped) {
          return;
        }
        setProxyStatus(status);
        const stillPreparing = status.generating === clip || status.pending.includes(clip);
        if (stillPreparing) {
          wasPreparing = true;
          timer = setTimeout(() => void check(), PROXY_STATUS_POLL_INTERVAL_MS);
        } else if (wasPreparing) {
          setMissing(false);
          setReloadToken((v) => v + 1);
        }
      } catch {
        if (!stopped) {
          timer = setTimeout(() => void check(), PROXY_STATUS_POLL_INTERVAL_MS);
        }
      }
    };
    void check();

    return () => {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [segment?.clip]);

  // 선택된 세그먼트가 바뀔 때(같은 clip이라 <video>가 리마운트되지 않는 경우 포함)
  // 재생 위치를 새 세그먼트의 in으로 시킹한다. in/out 값만 바뀌는 드래그 편집에는
  // 반응하지 않도록 selectedIndex에만 의존시킨다.
  useEffect(() => {
    const video = videoRef.current;
    const clipChanged = prevClipRef.current !== segment?.clip;
    prevClipRef.current = segment?.clip;
    if (!video || !segment || clipChanged || video.readyState < 1) {
      // 클립이 바뀌는 경우는 <video>가 리마운트되어 loadedmetadata 흐름이 처리한다.
      return;
    }
    video.currentTime = segment.in;
    setCurrentTime(segment.in);
    if (autoPlayRef.current) {
      video.playbackRate = segment.speed;
      video.volume = segment.volume;
      void video.play();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex]);

  useEffect(() => {
    return () => {
      if (noticeTimer.current) {
        clearTimeout(noticeTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !segment) {
      return;
    }
    const handleLoadedMetadata = () => {
      setDuration(video.duration);
      video.currentTime = segment.in;
      video.playbackRate = segment.speed;
      video.volume = segment.volume;
      setCurrentTime(segment.in);
      if (autoPlayRef.current) {
        void video.play();
      }
    };
    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      if (playMode === "loop" && video.currentTime >= segment.out) {
        video.currentTime = segment.in;
      }
    };
    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.playbackRate = segment.speed;
    video.volume = segment.volume;
    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("timeupdate", handleTimeUpdate);
    };
  }, [segment, playMode]);

  const showNotice = (msg: string) => {
    setNotice(msg);
    if (noticeTimer.current) {
      clearTimeout(noticeTimer.current);
    }
    noticeTimer.current = setTimeout(() => setNotice(null), 2000);
  };

  const seekTo = (t: number) => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    const clamped = clamp(t, 0, duration || t);
    video.currentTime = clamped;
    setCurrentTime(clamped);
  };

  const stopShuttleRaf = () => {
    if (shuttleRafRef.current !== null) {
      cancelAnimationFrame(shuttleRafRef.current);
      shuttleRafRef.current = null;
    }
  };

  /** 셔틀(J/K/L) 상태를 평상시(정지) 상태로 되돌린다 — 배속/음소거/역재생 루프 정리. */
  const resetShuttle = () => {
    stopShuttleRaf();
    shuttleDirectionRef.current = "stopped";
    shuttleLevelRef.current = 1;
    const video = videoRef.current;
    if (video) {
      video.muted = false;
    }
  };

  const handlePlay = () => {
    const video = videoRef.current;
    if (!video || !segment) {
      return;
    }
    resetShuttle();
    if (
      playMode === "loop" &&
      (video.currentTime < segment.in || video.currentTime >= segment.out)
    ) {
      video.currentTime = segment.in;
      setCurrentTime(segment.in);
    }
    video.playbackRate = segment.speed;
    video.volume = segment.volume;
    void video.play();
  };

  const shuttleStop = () => {
    const video = videoRef.current;
    resetShuttle();
    if (video) {
      video.pause();
    }
  };

  /** 역재생 프레임 루프 — video는 일시정지 상태로 두고 rAF마다 currentTime을 직접 깎는다
      (HTML video는 음수 playbackRate를 지원하지 않아 이렇게 근사한다). */
  const reverseTick = (ts: number) => {
    const video = videoRef.current;
    if (!video || !segment || shuttleDirectionRef.current !== "backward") {
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
    const next = Math.max(segment.in, video.currentTime - dt * shuttleLevelRef.current);
    video.currentTime = next;
    setCurrentTime(next);
    if (next <= segment.in) {
      shuttleStop();
      return;
    }
    shuttleRafRef.current = requestAnimationFrame(reverseTick);
  };

  /** L: 정방향 재생. 연타 시 1x -> 2x -> 4x로 배속이 오른다(4x 상한). 역재생 중이면 정방향
      1x로 전환한다. */
  const shuttleForward = () => {
    const video = videoRef.current;
    if (!video || !segment) {
      return;
    }
    if (shuttleDirectionRef.current === "forward") {
      shuttleLevelRef.current = shuttleLevelRef.current >= 4 ? 4 : shuttleLevelRef.current * 2;
    } else {
      stopShuttleRaf();
      shuttleDirectionRef.current = "forward";
      shuttleLevelRef.current = 1;
      video.muted = false;
      if (video.currentTime < segment.in || video.currentTime >= segment.out) {
        video.currentTime = segment.in;
        setCurrentTime(segment.in);
      }
    }
    video.playbackRate = segment.speed * shuttleLevelRef.current;
    video.volume = segment.volume;
    void video.play();
  };

  /** J: 역방향 재생(근사). 연타 시 1x -> 2x -> 4x로 배속이 오른다(4x 상한). 오디오는
      의미가 없으므로 음소거한다. 정방향 재생 중이면 역방향 1x로 전환한다. */
  const shuttleBackward = () => {
    const video = videoRef.current;
    if (!video || !segment) {
      return;
    }
    if (shuttleDirectionRef.current === "backward") {
      shuttleLevelRef.current = shuttleLevelRef.current >= 4 ? 4 : shuttleLevelRef.current * 2;
      return;
    }
    video.pause();
    shuttleDirectionRef.current = "backward";
    shuttleLevelRef.current = 1;
    video.muted = true;
    stopShuttleRaf();
    shuttleLastTsRef.current = undefined;
    shuttleRafRef.current = requestAnimationFrame(reverseTick);
  };

  const handleSetIn = () => {
    if (!segment) {
      return;
    }
    if (currentTime >= segment.out - MIN_GAP) {
      showNotice("IN은 OUT보다 앞서야 합니다");
      return;
    }
    onChange({ in: currentTime });
  };

  const handleSetOut = () => {
    if (!segment) {
      return;
    }
    if (currentTime <= segment.in + MIN_GAP) {
      showNotice("OUT은 IN보다 뒤여야 합니다");
      return;
    }
    onChange({ out: currentTime });
  };

  const handleSplit = () => {
    if (!segment) {
      return;
    }
    if (currentTime - segment.in < SPLIT_MARGIN || segment.out - currentTime < SPLIT_MARGIN) {
      showNotice("경계와 너무 가까워 분할할 수 없습니다");
      return;
    }
    onSplit(currentTime);
  };

  const startCropEdit = () => {
    if (!segment) {
      return;
    }
    // 신규 크롭 시작값은 정사각 비율(w==h) — 소스·출력이 같은 종횡비(16:9)일 때
    // w==h면 크롭 창도 16:9라 왜곡이 없다(CropEditOverlay가 드래그 중에도 이 불변을 유지).
    setCropEditDraft(segment.crop ?? { x: 0.15, y: 0.15, w: 0.7, h: 0.7 });
  };

  const applyCropEdit = () => {
    if (!cropEditDraft) {
      return;
    }
    onChange({ crop: cropEditDraft });
    setCropEditDraft(null);
  };

  const cancelCropEdit = () => {
    setCropEditDraft(null);
  };

  /** 편집 모드는 유지한 채(적용/커밋 없이) draft만 전체 프레임으로 되돌린다 — 핸들 드래그로
   * 프레임 경계까지 벌리는 게 번거로울 때 쓰는 지름길. 여기서 다시 좁혀서 적용할 수도 있다. */
  const resetCropEditToFullFrame = () => {
    setCropEditDraft({ x: 0, y: 0, w: 1, h: 1 });
  };

  const clearCropEdit = () => {
    onChange({ crop: null });
    setCropEditDraft(null);
  };

  // 크롭 편집 중일 때만 Esc(취소)/Enter(적용)를 가로챈다.
  useEffect(() => {
    if (!cropEditDraft) {
      return;
    }
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancelCropEdit();
      } else if (e.key === "Enter") {
        e.preventDefault();
        applyCropEdit();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cropEditDraft]);

  useImperativeHandle(
    ref,
    () => ({
      togglePlay: () => {
        const video = videoRef.current;
        if (!video) {
          return;
        }
        if (video.paused) {
          handlePlay();
        } else {
          resetShuttle();
          video.pause();
        }
      },
      seekBy: (deltaSeconds: number) => {
        seekTo(currentTime + deltaSeconds);
      },
      setInFromCurrent: handleSetIn,
      setOutFromCurrent: handleSetOut,
      splitAtCurrent: handleSplit,
      startCropEdit,
      shuttleForward,
      shuttleBackward,
      shuttleStop,
    }),
    [currentTime, duration, playMode, segment],
  );

  if (!segment) {
    return <div className="video-preview empty">세그먼트를 선택하세요</div>;
  }

  const timeAtClientX = (clientX: number): number => {
    const el = timelineRef.current;
    if (!el || duration <= 0) {
      return 0;
    }
    const rect = el.getBoundingClientRect();
    const fraction = clamp((clientX - rect.left) / rect.width, 0, 1);
    return fraction * duration;
  };

  const handleTimelinePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (duration <= 0) {
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    seekTo(timeAtClientX(e.clientX));
  };

  const handleTimelinePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.buttons === 0 || duration <= 0) {
      return;
    }
    seekTo(timeAtClientX(e.clientX));
  };

  const startHandleDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const dragHandle = (which: "in" | "out") => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.buttons === 0 || duration <= 0) {
      return;
    }
    e.stopPropagation();
    const t = timeAtClientX(e.clientX);
    if (which === "in") {
      onChange({ in: clamp(t, 0, segment.out - MIN_GAP) });
    } else {
      onChange({ out: clamp(t, segment.in + MIN_GAP, duration) });
    }
  };

  const pct = (t: number): number => (duration > 0 ? clamp((t / duration) * 100, 0, 100) : 0);

  const subtitleSummary = segment.subtitle.trim() !== "" ? segment.subtitle.trim() : "(자막 없음)";
  // 이 컷만의 스타일 오버라이드가 있으면 전역 subtitleStyle에 병합한 결과를 오버레이에 쓴다
  // (렌더/미리보기 모두 같은 병합 규칙 — subtitleOverlay.ts 참고).
  const effectiveSubtitleStyle = mergeSubtitleStyle(subtitleStyle, segment.styleOverride);
  const sceneInfo = matchSceneInfo(segment, moments);
  const sceneText = sceneInfo.kind === "none" ? "장면 정보 없음" : sceneInfo.memo;

  const pendingIndex = proxyStatus ? proxyStatus.pending.indexOf(segment.clip) : -1;
  const isGeneratingProxy = proxyStatus?.generating === segment.clip;
  const isPreparingProxy = segment.clip !== "" && (isGeneratingProxy || pendingIndex !== -1);

  return (
    <div className="video-preview">
      <div className="video-context-header">
        <div
          className={`video-context-scene${sceneInfo.kind === "none" ? " empty" : ""}`}
          title={sceneText}
        >
          <span className="video-context-index">#{selectedIndex + 1}</span>
          {sceneInfo.kind === "moment" ? (
            <span className={`scene-shot-badge shot-${sceneInfo.shotType}`}>
              {shotTypeLabel(sceneInfo.shotType)}
            </span>
          ) : null}
          {sceneInfo.kind === "monotonous" ? (
            <span className="scene-shot-badge shot-monotonous">배속구간</span>
          ) : null}
          <span className="video-context-scene-label">장면</span>
          <span className="video-context-scene-text">{sceneText}</span>
        </div>
        <div className="video-context-line" title={subtitleSummary}>
          자막 {subtitleSummary} · {segment.in.toFixed(1)}s~{segment.out.toFixed(1)}s
        </div>
      </div>
      {isPreparingProxy ? (
        <div className="notice proxy-preparing">
          영상 준비 중이에요 - 곧 자동 재생됩니다 (
          {isGeneratingProxy ? "지금 처리 중" : `${pendingIndex + 1}번째 순서 대기`})
        </div>
      ) : null}
      {!isPreparingProxy && (missing || segment.clip === "") ? (
        <div className="empty">원본을 찾을 수 없어요: {segment.clip || "(파일명 없음)"}</div>
      ) : isPreparingProxy ? null : (
        <>
          {cropEditDraft ? (
            <div className="crop-edit-toolbar">
              <span className="crop-edit-readout">
                x {(cropEditDraft.x * 100).toFixed(0)}% · y {(cropEditDraft.y * 100).toFixed(0)}%
                {" "}· w {(cropEditDraft.w * 100).toFixed(0)}% · h {(cropEditDraft.h * 100).toFixed(0)}%
              </span>
              <div className="crop-edit-actions">
                <Button label="전체 프레임" variant="ghost" size="sm" onClick={resetCropEditToFullFrame} />
                <Button label="적용" variant="primary" size="sm" onClick={applyCropEdit} />
                <Button label="취소" variant="ghost" size="sm" onClick={cancelCropEdit} />
                {segment.crop ? (
                  <Button label="해제" variant="ghost" size="sm" onClick={clearCropEdit} />
                ) : null}
              </div>
            </div>
          ) : null}
          <div className="video-crop-frame" ref={cropFrameRef}>
            <video
              key={`${segment.clip}:${reloadToken}`}
              ref={videoRef}
              src={`/clips/${encodeURIComponent(segment.clip)}`}
              onError={() => setMissing(true)}
              style={cropEditDraft ? undefined : cropPreviewStyle(segment.crop)}
            />
            {cropEditDraft ? (
              <CropEditOverlay crop={cropEditDraft} frameRef={cropFrameRef} onChange={setCropEditDraft} />
            ) : null}
            {!cropEditDraft && segment.subtitle.trim() !== "" ? (
              <div
                className={`video-subtitle-overlay video-subtitle-overlay-${effectiveSubtitleStyle.position}`}
                style={{
                  color: effectiveSubtitleStyle.color,
                  fontFamily: effectiveSubtitleStyle.font,
                  fontSize: toCqw(effectiveSubtitleStyle.size, projectWidth),
                  ...subtitleOutlineStyle(
                    effectiveSubtitleStyle.outlineWidth,
                    toCqw(effectiveSubtitleStyle.outlineWidth, projectWidth),
                    effectiveSubtitleStyle.outlineColor,
                  ),
                  ...subtitlePositionStyle(effectiveSubtitleStyle, projectHeight),
                }}
              >
                <span
                  className="video-subtitle-overlay-text"
                  style={
                    effectiveSubtitleStyle.background
                      ? {
                          background: subtitleBackgroundRgba(
                            effectiveSubtitleStyle.background.color,
                            effectiveSubtitleStyle.background.opacity,
                          ),
                          padding: `${effectiveSubtitleStyle.background.padding}px`,
                        }
                      : undefined
                  }
                >
                  {segment.subtitle.trim()}
                </span>
              </div>
            ) : null}
          </div>

          <div
            className="scrub-timeline"
            ref={timelineRef}
            onPointerDown={handleTimelinePointerDown}
            onPointerMove={handleTimelinePointerMove}
          >
            <div className="scrub-track" />
            <div
              className="scrub-range"
              style={{ left: `${pct(segment.in)}%`, width: `${Math.max(0, pct(segment.out) - pct(segment.in))}%` }}
            />
            <div
              className="scrub-handle in"
              style={{ left: `${pct(segment.in)}%` }}
              onPointerDown={startHandleDrag}
              onPointerMove={dragHandle("in")}
            />
            <div
              className="scrub-handle out"
              style={{ left: `${pct(segment.out)}%` }}
              onPointerDown={startHandleDrag}
              onPointerMove={dragHandle("out")}
            />
            <div className="scrub-playhead" style={{ left: `${pct(currentTime)}%` }} />
          </div>

          <div className="time-readout">
            현재 {currentTime.toFixed(1)}s · 시작 {segment.in.toFixed(1)}s · 끝 {segment.out.toFixed(1)}s
          </div>

          {/* 재생 컨트롤 — 비디오(+스크럽)에 바로 붙는 한 행(screen-spec 3절). */}
          <div className="video-controls-row">
            <Button label="재생" variant="primary" size="sm" onClick={handlePlay} />
            <Button label="현재 위치를 시작으로" variant="secondary" size="sm" onClick={handleSetIn} />
            <Button label="현재 위치를 끝으로" variant="secondary" size="sm" onClick={handleSetOut} />
            <Button label="분할" variant="secondary" size="sm" onClick={handleSplit} />
          </div>

          <div className="playmode-toggle">
            <button
              type="button"
              className={playMode === "loop" ? "active" : ""}
              onClick={() => setPlayMode("loop")}
            >
              구간 반복
            </button>
            <button
              type="button"
              className={playMode === "free" ? "active" : ""}
              onClick={() => setPlayMode("free")}
            >
              클립 전체
            </button>
          </div>

          {notice ? <div className="notice">{notice}</div> : null}
        </>
      )}
    </div>
  );
});
