import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { Segment } from "@cuesheet/schema";
import { fetchProxyStatus, type ProxyStatus } from "../api.js";

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
}

/** 외부(App.tsx의 전역 단축키 등)에서 미리보기를 제어하기 위한 핸들. */
export interface VideoPreviewHandle {
  togglePlay: () => void;
  seekBy: (deltaSeconds: number) => void;
  setInFromCurrent: () => void;
  setOutFromCurrent: () => void;
  splitAtCurrent: () => void;
}

/**
 * 선택된 세그먼트의 플레이어: 클립 전체 길이 기준 스크럽 타임라인 위에
 * in~out 구간을 표시하고, 핸들 드래그·버튼으로 in/out을 조정하며,
 * 현재 위치에서 세그먼트를 분할할 수 있다.
 */
export const VideoPreview = forwardRef<VideoPreviewHandle, Props>(function VideoPreview(
  { segment, selectedIndex, onChange, onSplit, autoPlay = false },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const [missing, setMissing] = useState(false);
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

  useEffect(() => {
    autoPlayRef.current = autoPlay;
  }, [autoPlay]);

  useEffect(() => {
    setMissing(false);
    setDuration(0);
    setCurrentTime(0);
  }, [segment?.clip]);

  // 선택된 클립이 프록시 생성 대기/진행 중이면 10초마다 상태를 확인해
  // 안내를 갱신하고, 준비가 끝나면 <video>를 다시 마운트해 프록시로 전환한다.
  useEffect(() => {
    const clip = segment?.clip;
    if (!clip) {
      return;
    }
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const check = async () => {
      try {
        const status = await fetchProxyStatus();
        if (stopped) {
          return;
        }
        setProxyStatus(status);
        const stillPreparing = status.generating === clip || status.pending.includes(clip);
        if (stillPreparing) {
          timer = setTimeout(() => void check(), PROXY_STATUS_POLL_INTERVAL_MS);
        } else {
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

  const handlePlay = () => {
    const video = videoRef.current;
    if (!video || !segment) {
      return;
    }
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
          video.pause();
        }
      },
      seekBy: (deltaSeconds: number) => {
        seekTo(currentTime + deltaSeconds);
      },
      setInFromCurrent: handleSetIn,
      setOutFromCurrent: handleSetOut,
      splitAtCurrent: handleSplit,
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

  const pendingIndex = proxyStatus ? proxyStatus.pending.indexOf(segment.clip) : -1;
  const isGeneratingProxy = proxyStatus?.generating === segment.clip;
  const isPreparingProxy = segment.clip !== "" && (isGeneratingProxy || pendingIndex !== -1);

  return (
    <div className="video-preview">
      <div className="video-context-line" title={subtitleSummary}>
        <span className="video-context-index">#{selectedIndex + 1}</span>
        {subtitleSummary} · {segment.in.toFixed(1)}s~{segment.out.toFixed(1)}s
      </div>
      {isPreparingProxy ? (
        <div className="notice proxy-preparing">
          프록시 준비 중입니다 ({isGeneratingProxy ? "생성 중" : `${pendingIndex + 1}번째 대기`})
        </div>
      ) : null}
      {!isPreparingProxy && (missing || segment.clip === "") ? (
        <div className="empty">클립 없음: {segment.clip || "(파일명 없음)"}</div>
      ) : isPreparingProxy ? null : (
        <>
          <video
            key={`${segment.clip}:${reloadToken}`}
            ref={videoRef}
            src={`/clips/${encodeURIComponent(segment.clip)}`}
            onError={() => setMissing(true)}
          />

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
            현재 {currentTime.toFixed(1)}s · IN {segment.in.toFixed(1)}s · OUT {segment.out.toFixed(1)}s
          </div>

          <div className="video-controls-row">
            <button type="button" onClick={handleSetIn}>
              현재 위치를 IN으로
            </button>
            <button type="button" onClick={handleSetOut}>
              현재 위치를 OUT으로
            </button>
            <button type="button" onClick={handleSplit}>
              현재 위치에서 분할
            </button>
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
              전체 재생
            </button>
          </div>

          {notice ? <div className="notice">{notice}</div> : null}
        </>
      )}
      <button type="button" onClick={handlePlay} disabled={missing || isPreparingProxy}>
        재생 ({segment.in.toFixed(1)}s → {segment.out.toFixed(1)}s)
      </button>
    </div>
  );
});
