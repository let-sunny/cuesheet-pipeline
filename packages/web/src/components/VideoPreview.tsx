import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Button } from "@astryxdesign/core/Button";
import type { Segment, SubtitleStyle, SubtitleStylePresets } from "@cuesheet/schema";
import { CompactButton } from "./ui/CompactButton/index.js";
import { TitleOverlay } from "./TitleOverlay/index.js";
import { captureFrame, fetchProxyStatus, type ClipMoments, type ProxyStatus } from "../api.js";
import { clamp } from "../lib/clamp.js";
import { cropPreviewStyle } from "../lib/cropPreview.js";
import { useCropEditor } from "../hooks/useCropEditor.js";
import { MAX_PLAYBACK_RATE, useShuttle } from "../hooks/useShuttle.js";
import { matchSceneInfo, shotTypeLabel } from "../lib/sceneInfo.js";
import {
  mergeSubtitleStyle,
  subtitleBackgroundRgba,
  subtitleOutlineStyle,
  subtitlePositionStyle,
  toCqw,
} from "../lib/subtitleOverlay.js";
import { transitionOpacity } from "../lib/transitionOverlay.js";
import { computeDefaultTrimWindow, moveTrimWindow } from "../lib/trimWindow.js";
import { CropEditOverlay } from "./CropEditOverlay.js";

type PlayMode = "loop" | "free";

interface Props {
  segment: Segment | undefined;
  selectedIndex: number;
  onChange: (patch: Partial<Segment>) => void;
  onSplit: (at: number) => void;
  /** When on, automatically starts playback when the selected segment changes (e.g. subtitle-writing mode). */
  autoPlay?: boolean;
  /** Draft vision-analysis data — used to show "what scene is this" in the context header above the video. */
  moments: ClipMoments[];
  /** Global subtitle style — merged with the segment's stylePreset/styleOverride to draw the subtitle overlay over the video. */
  subtitleStyle: SubtitleStyle;
  /** Named subtitle style presets dictionary - merged in ahead of the segment's own styleOverride. */
  subtitleStylePresets: SubtitleStylePresets | undefined;
  /** Used to convert subtitleStyle.margin (px, relative to source resolution) into overlay position (%). */
  projectHeight: number;
  /** Used to convert subtitleStyle.size/outlineWidth (px, relative to source resolution) into cqw relative to overlay width. */
  projectWidth: number;
}

/** Handle for controlling the preview from outside (e.g. global shortcuts in App.tsx). */
export interface VideoPreviewHandle {
  togglePlay: () => void;
  seekBy: (deltaSeconds: number) => void;
  setInFromCurrent: () => void;
  setOutFromCurrent: () => void;
  splitAtCurrent: () => void;
  /** Enters crop edit mode (starts from the existing crop if there is one, otherwise the full frame). */
  startCropEdit: () => void;
  /** L: forward playback/speed shuttle (repeated presses go 1x -> 2x -> 4x). */
  shuttleForward: () => void;
  /** J: reverse playback/speed shuttle (approximate, repeated presses go 1x -> 2x -> 4x, audio muted). */
  shuttleBackward: () => void;
  /** K: stop shuttle. */
  shuttleStop: () => void;
}

/**
 * Player for the selected segment: shows the in~out range on a scrub timeline based on the
 * clip's full length, lets you adjust in/out by dragging handles or using buttons, and can
 * split the segment at the current position.
 */
export const VideoPreview = forwardRef<VideoPreviewHandle, Props>(function VideoPreview(
  {
    segment,
    selectedIndex,
    onChange,
    onSplit,
    autoPlay = false,
    moments,
    subtitleStyle,
    subtitleStylePresets,
    projectHeight,
    projectWidth,
  },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // The detail (zoomed-in) trim bar - the one with draggable In/Out handles.
  const timelineRef = useRef<HTMLDivElement | null>(null);
  // The overview bar (full clip) - shows/moves the detail bar's zoom window.
  const overviewTimelineRef = useRef<HTMLDivElement | null>(null);
  const cropFrameRef = useRef<HTMLDivElement | null>(null);
  const [missing, setMissing] = useState(false);
  // The source video's own intrinsic pixel size (video.videoWidth/videoHeight), set once metadata
  // loads — used (with projectWidth/projectHeight) to derive the crop ratio-lock below.
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  // The detail bar's zoom window (seconds, [start,end] within [0,duration]) - two-level trim
  // (screen-spec section 3): on a long clip, mapping the full duration to the trim bar's width
  // gives sub-pixel handles for a short in/out range (undraggable). Reset to a default centered on
  // the cut's current in/out whenever the selected cut or the clip's duration changes (a fresh
  // clip's metadata just loaded), but intentionally NOT on every in/out change - within one
  // edit session the window should hold still while dragging the detail handles; only the overview
  // bar (a deliberate, separate action) repositions it.
  const [trimWindow, setTrimWindow] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const [playMode, setPlayMode] = useState<PlayMode>("loop");
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevClipRef = useRef<string | undefined>(segment?.clip);
  const autoPlayRef = useRef(autoPlay);
  const [proxyStatus, setProxyStatus] = useState<ProxyStatus | null>(null);
  // A value used to force-remount <video> when a proxy has just become ready, so it re-requests
  // the newly served proxy file (also clears any missing state left over from an original load failure).
  const [reloadToken, setReloadToken] = useState(0);

  const { cropEditDraft, lockRatio, updateCropDraft, startCropEdit, applyCropEdit, cancelCropEdit, resetCropEditToFullFrame, clearCropEdit } =
    useCropEditor({ segment, projectWidth, projectHeight, naturalSize, onChange });
  const { shuttleForward, shuttleBackward, shuttleStop, resetShuttle } = useShuttle({ videoRef, segment, setCurrentTime });

  useEffect(() => {
    autoPlayRef.current = autoPlay;
  }, [autoPlay]);

  useEffect(() => {
    setMissing(false);
    setDuration(0);
    setCurrentTime(0);
  }, [segment?.clip]);

  // Resets the detail bar's zoom window to a default centered on the selected cut - fires on cut
  // change (selectedIndex) and whenever duration updates (a new clip's metadata just loaded; for a
  // cut on an already-loaded clip, duration is unchanged so this is a no-op re-run). Deliberately
  // excludes segment.in/out from the deps so dragging the detail handles doesn't fight itself by
  // resetting the very window it's being dragged within.
  useEffect(() => {
    if (segment) {
      setTrimWindow(computeDefaultTrimWindow(segment.in, segment.out, duration));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex, duration]);

  // When the selected cut changes, discard any in-progress crop edit (a draft based on a
  // different cut), and also clean up any shuttle (J/K/L speed/reverse playback) running for the previous cut.
  useEffect(() => {
    cancelCropEdit();
    resetShuttle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex]);

  // If the selected clip's proxy is pending/being generated, check status every 10 seconds to
  // refresh the notice, and once ready, remount <video> to switch over to the proxy.
  //
  // Race caution: if the first check right after mount already responds "not preparing" (a clip
  // that never needed a proxy wait to begin with), reloadToken must not be bumped — at that
  // point the original <video> may already be loading its own src, and a remount from the key
  // change would abort that in-flight request, wrongly landing on onError (missing=true) (missing
  // only resets when segment.clip changes, so it would stay stuck from then on). So reloadToken
  // is only bumped when an actual "preparing -> ready" transition occurs (i.e. only after
  // stillPreparing===true has been observed at least once for this clip).
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

  // When the selected segment changes (including when <video> doesn't remount because it's the
  // same clip), seek the playback position to the new segment's in. Depends only on
  // selectedIndex so it doesn't react to drag edits that only change in/out values.
  useEffect(() => {
    const video = videoRef.current;
    const clipChanged = prevClipRef.current !== segment?.clip;
    prevClipRef.current = segment?.clip;
    if (!video || !segment || clipChanged || video.readyState < 1) {
      // When the clip changes, <video> remounts and the loadedmetadata flow handles it.
      return;
    }
    video.currentTime = segment.in;
    setCurrentTime(segment.in);
    if (autoPlayRef.current) {
      video.playbackRate = Math.min(segment.speed, MAX_PLAYBACK_RATE);
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
      setNaturalSize({ width: video.videoWidth, height: video.videoHeight });
      video.currentTime = segment.in;
      video.playbackRate = Math.min(segment.speed, MAX_PLAYBACK_RATE);
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
    video.playbackRate = Math.min(segment.speed, MAX_PLAYBACK_RATE);
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
    resetShuttle();
    if (
      playMode === "loop" &&
      (video.currentTime < segment.in || video.currentTime >= segment.out)
    ) {
      video.currentTime = segment.in;
      setCurrentTime(segment.in);
    }
    video.playbackRate = Math.min(segment.speed, MAX_PLAYBACK_RATE);
    video.volume = segment.volume;
    void video.play();
  };

  const handleSetIn = () => {
    if (!segment) {
      return;
    }
    if (currentTime >= segment.out - MIN_GAP) {
      showNotice("In must come before Out");
      return;
    }
    onChange({ in: currentTime });
  };

  const handleSetOut = () => {
    if (!segment) {
      return;
    }
    if (currentTime <= segment.in + MIN_GAP) {
      showNotice("Out must come after In");
      return;
    }
    onChange({ out: currentTime });
  };

  const handleSplit = () => {
    if (!segment) {
      return;
    }
    if (currentTime - segment.in < SPLIT_MARGIN || segment.out - currentTime < SPLIT_MARGIN) {
      showNotice("Too close to the edge to split");
      return;
    }
    onSplit(currentTime);
  };

  // Captures a full-resolution PNG of the current preview position from the ORIGINAL clip
  // (currentTime already tracks the position within the clip's own timeline, unaffected by any
  // crop/reframe applied to the preview) and downloads it - PRD backlog #6.
  const handleCapture = () => {
    if (!segment) {
      return;
    }
    void captureFrame(segment.clip, currentTime).then((result) => {
      if (!result.ok) {
        showNotice(result.error);
      }
    });
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
    return <div className="video-preview empty">Select a cut</div>;
  }

  // Detail bar - maps [trimWindow.start, trimWindow.end] to its own width, giving real pixel room
  // to In/Out handles even when that range is a tiny fraction of a long clip's full duration.
  const detailTimeAtClientX = (clientX: number): number => {
    const el = timelineRef.current;
    const windowWidth = trimWindow.end - trimWindow.start;
    if (!el || windowWidth <= 0) {
      return trimWindow.start;
    }
    const rect = el.getBoundingClientRect();
    const fraction = clamp((clientX - rect.left) / rect.width, 0, 1);
    return trimWindow.start + fraction * windowWidth;
  };

  const detailPct = (t: number): number => {
    const windowWidth = trimWindow.end - trimWindow.start;
    return windowWidth > 0 ? clamp(((t - trimWindow.start) / windowWidth) * 100, 0, 100) : 0;
  };

  const handleTimelinePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (trimWindow.end - trimWindow.start <= 0) {
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    seekTo(detailTimeAtClientX(e.clientX));
  };

  const handleTimelinePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.buttons === 0 || trimWindow.end - trimWindow.start <= 0) {
      return;
    }
    seekTo(detailTimeAtClientX(e.clientX));
  };

  const startHandleDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const dragHandle = (which: "in" | "out") => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.buttons === 0 || trimWindow.end - trimWindow.start <= 0) {
      return;
    }
    e.stopPropagation();
    const t = detailTimeAtClientX(e.clientX);
    if (which === "in") {
      onChange({ in: clamp(t, 0, segment.out - MIN_GAP) });
    } else {
      onChange({ out: clamp(t, segment.in + MIN_GAP, duration) });
    }
  };

  // Overview bar - the full clip, [0, duration]. Click/drag anywhere on it re-centers the detail
  // bar's zoom window on that point (clamped to stay inside the clip) - the window's width itself
  // doesn't change here, only its position.
  const overviewTimeAtClientX = (clientX: number): number => {
    const el = overviewTimelineRef.current;
    if (!el || duration <= 0) {
      return 0;
    }
    const rect = el.getBoundingClientRect();
    const fraction = clamp((clientX - rect.left) / rect.width, 0, 1);
    return fraction * duration;
  };

  const overviewPct = (t: number): number => (duration > 0 ? clamp((t / duration) * 100, 0, 100) : 0);

  const handleOverviewPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (duration <= 0) {
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    setTrimWindow(moveTrimWindow(trimWindow, duration, overviewTimeAtClientX(e.clientX)));
  };

  const handleOverviewPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.buttons === 0 || duration <= 0) {
      return;
    }
    setTrimWindow(moveTrimWindow(trimWindow, duration, overviewTimeAtClientX(e.clientX)));
  };

  const subtitleSummary = segment.subtitle.trim() !== "" ? segment.subtitle.trim() : "(no subtitle)";
  // If this cut has its own style override, use the result of merging it into the global
  // subtitleStyle for the overlay (render and preview both follow the same merge rule — see subtitleOverlay.ts).
  const effectiveSubtitleStyle = mergeSubtitleStyle(
    subtitleStyle,
    subtitleStylePresets,
    segment.stylePreset,
    segment.styleOverride,
  );
  const sceneInfo = matchSceneInfo(segment, moments);
  const sceneText = sceneInfo.kind === "none" ? "No scene info" : sceneInfo.memo;

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
            <span className="scene-shot-badge shot-monotonous">Timelapse cut</span>
          ) : null}
          <span className="video-context-scene-label">Scene</span>
          <span className="video-context-scene-text">{sceneText}</span>
        </div>
        <div className="video-context-line" title={subtitleSummary}>
          Subtitle {subtitleSummary} · {segment.in.toFixed(1)}s~{segment.out.toFixed(1)}s
        </div>
      </div>
      {isPreparingProxy ? (
        <div className="notice proxy-preparing">
          Preparing video — will play automatically in a moment (
          {isGeneratingProxy ? "processing now" : `#${pendingIndex + 1} in line`})
        </div>
      ) : null}
      {!isPreparingProxy && (missing || segment.clip === "") ? (
        <div className="empty">Can't find the source: {segment.clip || "(no filename)"}</div>
      ) : isPreparingProxy ? null : (
        <>
          {cropEditDraft ? (
            <div className="crop-edit-toolbar">
              <span className="crop-edit-readout">
                x {(cropEditDraft.x * 100).toFixed(0)}% · y {(cropEditDraft.y * 100).toFixed(0)}%
                {" "}· w {(cropEditDraft.w * 100).toFixed(0)}% · h {(cropEditDraft.h * 100).toFixed(0)}%
              </span>
              <div className="crop-edit-actions">
                <CompactButton label="Full frame" variant="ghost" size="sm" onClick={resetCropEditToFullFrame} />
                <CompactButton label="Apply" variant="primary" size="sm" onClick={applyCropEdit} />
                <CompactButton label="Cancel" variant="ghost" size="sm" onClick={cancelCropEdit} />
                {segment.crop ? (
                  <CompactButton label="Clear" variant="ghost" size="sm" onClick={clearCropEdit} />
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
              style={
                cropEditDraft
                  ? undefined
                  : {
                      ...cropPreviewStyle(segment.crop),
                      // Preview approximation of transitionIn/transitionOut (PRD backlog #3) - see
                      // lib/transitionOverlay.ts's module doc for why this isn't pixel-exact with
                      // the real render.
                      opacity: transitionOpacity(
                        segment.transitionIn,
                        segment.transitionOut,
                        segment.out - segment.in,
                        currentTime - segment.in,
                      ),
                    }
              }
            />
            {cropEditDraft ? (
              <CropEditOverlay
                crop={cropEditDraft}
                frameRef={cropFrameRef}
                onChange={updateCropDraft}
                lockRatio={lockRatio}
              />
            ) : null}
            {!cropEditDraft ? <TitleOverlay title={segment.title} localTimeS={currentTime - segment.in} /> : null}
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

          {/* Two-level trim (screen-spec section 3): the overview bar is the full clip and shows/
              moves the detail bar's zoom window; the detail bar is where In/Out are actually
              dragged, with real pixel room regardless of how long the source clip is. */}
          <div className="trim-timeline-label">
            Overview (full clip {duration.toFixed(1)}s) — click/drag to move the zoomed-in window below
          </div>
          <div
            className="trim-overview"
            ref={overviewTimelineRef}
            onPointerDown={handleOverviewPointerDown}
            onPointerMove={handleOverviewPointerMove}
          >
            <div className="scrub-track" />
            <div
              className="scrub-range"
              style={{
                left: `${overviewPct(segment.in)}%`,
                width: `${Math.max(0, overviewPct(segment.out) - overviewPct(segment.in))}%`,
              }}
            />
            <div
              className="trim-overview-window"
              style={{
                left: `${overviewPct(trimWindow.start)}%`,
                width: `${Math.max(0, overviewPct(trimWindow.end) - overviewPct(trimWindow.start))}%`,
              }}
            />
            <div className="scrub-playhead" style={{ left: `${overviewPct(currentTime)}%` }} />
          </div>

          <div className="trim-timeline-label">
            Zoomed in ({trimWindow.start.toFixed(1)}s–{trimWindow.end.toFixed(1)}s) — drag the handles below
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
              style={{ left: `${detailPct(segment.in)}%`, width: `${Math.max(0, detailPct(segment.out) - detailPct(segment.in))}%` }}
            />
            <div
              className="scrub-handle in"
              style={{ left: `${detailPct(segment.in)}%` }}
              onPointerDown={startHandleDrag}
              onPointerMove={dragHandle("in")}
            />
            <div
              className="scrub-handle out"
              style={{ left: `${detailPct(segment.out)}%` }}
              onPointerDown={startHandleDrag}
              onPointerMove={dragHandle("out")}
            />
            <div className="scrub-playhead" style={{ left: `${detailPct(currentTime)}%` }} />
          </div>

          <div className="time-readout">
            Now {currentTime.toFixed(1)}s · In {segment.in.toFixed(1)}s · Out {segment.out.toFixed(1)}s
          </div>

          {/* Playback controls — a single row attached directly below the video(+scrub) (screen-spec section 3). */}
          <div className="video-controls-row">
            <Button label="Play" variant="primary" size="sm" onClick={handlePlay} />
            <Button label="Set In here" variant="secondary" size="sm" onClick={handleSetIn} />
            <Button label="Set Out here" variant="secondary" size="sm" onClick={handleSetOut} />
            <Button label="Split" variant="secondary" size="sm" onClick={handleSplit} />
            <Button
              label="Capture frame"
              variant="secondary"
              size="sm"
              tooltip="Captures the original frame (crop is not applied to the capture)"
              onClick={handleCapture}
            />
          </div>

          <div className="playmode-toggle">
            <button
              type="button"
              className={`plain-button${playMode === "loop" ? " active" : ""}`}
              onClick={() => setPlayMode("loop")}
            >
              Loop range
            </button>
            <button
              type="button"
              className={`plain-button${playMode === "free" ? " active" : ""}`}
              onClick={() => setPlayMode("free")}
            >
              Full clip
            </button>
          </div>

          {notice ? <div className="notice">{notice}</div> : null}
        </>
      )}
    </div>
  );
});

/** Polling interval (ms) for proxy readiness status. */
const PROXY_STATUS_POLL_INTERVAL_MS = 10000;

/** Minimum gap (seconds) between in/out when dragging a handle. */
const MIN_GAP = 0.05;
/** Minimum gap (seconds) from the in/out boundary when splitting. */
const SPLIT_MARGIN = 0.2;
