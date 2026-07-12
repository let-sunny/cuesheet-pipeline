import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Pause, Play, SkipBack } from "lucide-react";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import type { Segment, SubtitleStyle, SubtitleStylePresets } from "@cuesheet/schema";
import { ToolbarButton } from "../ui/ToolbarButton/index.js";
import { TitleOverlay } from "../TitleOverlay/index.js";
import { captureFrame, fetchProxyStatus, type ClipMoments, type ProxyStatus } from "../../api.js";
import { clamp } from "../../lib/clamp.js";
import { cropPreviewStyle } from "../../lib/cropPreview.js";
import { useCropEditor } from "../../hooks/useCropEditor.js";
import { MAX_PLAYBACK_RATE, useShuttle } from "../../hooks/useShuttle.js";
import { matchSceneInfo, shotTypeLabel } from "../../lib/sceneInfo.js";
import { shotTypeBadgeVariant, TIMELAPSE_BADGE_VARIANT } from "../../lib/momentCards.js";
import { classifyVideoSourceError, videoSourceErrorMessage } from "../../lib/videoSourceError.js";
import {
  mergeSubtitleStyle,
  subtitleBackgroundRgba,
  subtitleBackgroundPadding,
  subtitleOutlineStyle,
  subtitlePositionStyle,
  toCqw,
} from "../../lib/subtitleOverlay.js";
import { transitionOpacity } from "../../lib/transitionOverlay.js";
import { MIN_GAP_S } from "../../lib/trimWindow.js";
import type { TrimWindow } from "../../lib/trimWindow.js";
import { CropEditOverlay } from "../CropEditOverlay/index.js";
import { TrimStrip } from "../TrimStrip/index.js";
import { styles } from "./VideoPreview.styles.js";

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
  /** Used to convert subtitleStyle.margin (px, relative to source resolution) into overlay position (%); also passed to TitleOverlay's Player as the composition height. */
  projectHeight: number;
  /** Used to convert subtitleStyle.size/outlineWidth (px, relative to source resolution) into cqw relative to overlay width; also passed to TitleOverlay's Player as the composition width. */
  projectWidth: number;
  /** Passed to TitleOverlay's Player as the composition frame rate. */
  projectFps: number;
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
    projectFps,
  },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cropFrameRef = useRef<HTMLDivElement | null>(null);
  // null = no error. Distinguishes a missing source (fetch 404) from a file that exists but
  // isn't playable video (Finding 3) - see lib/videoSourceError.ts for why this needs a
  // supplementary fetch rather than the <video> error event's own MediaError.code.
  const [missingKind, setMissingKind] = useState<"missing" | "undecodable" | null>(null);
  // The source video's own intrinsic pixel size (video.videoWidth/videoHeight), set once metadata
  // loads — used (with projectWidth/projectHeight) to derive the crop ratio-lock below.
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  // Drives the playback-controls button's Play/Pause label - kept in sync with the <video>
  // element's own play/pause events (below) rather than tracked independently, so it can never
  // drift from what's actually playing (e.g. when the shuttle's reverse-playback loop pauses the
  // element on its own).
  const [isPlaying, setIsPlaying] = useState(false);
  // TrimStrip's own current viewport (seconds) - purely for the "Now/In/Out" readout below to
  // also show the visible range while zoomed in; TrimStrip owns the actual viewport state.
  const [viewport, setViewport] = useState<TrimWindow>({ start: 0, end: 0 });
  const [playMode, setPlayMode] = useState<PlayMode>("loop");
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevClipRef = useRef<string | undefined>(segment?.clip);
  const autoPlayRef = useRef(autoPlay);
  const [proxyStatus, setProxyStatus] = useState<ProxyStatus | null>(null);
  // A value used to force-remount <video> when a proxy has just become ready, so it re-requests
  // the newly served proxy file (also clears any missing state left over from an original load failure).
  const [reloadToken, setReloadToken] = useState(0);
  // Guards against a double-click (or repeated clicks while the ffmpeg-backed capture is still
  // running) firing multiple concurrent frame captures - QA-2 diagnosed fix.
  const [capturePending, setCapturePending] = useState(false);

  const { cropEditDraft, lockRatio, updateCropDraft, startCropEdit, applyCropEdit, cancelCropEdit, resetCropEditToFullFrame, clearCropEdit } =
    useCropEditor({ segment, projectWidth, projectHeight, naturalSize, onChange });
  const { shuttleForward, shuttleBackward, shuttleStop, resetShuttle } = useShuttle({
    getVideo: () => videoRef.current,
    bounds: segment,
    setCurrentTime,
  });

  useEffect(() => {
    autoPlayRef.current = autoPlay;
  }, [autoPlay]);

  useEffect(() => {
    setMissingKind(null);
    setDuration(0);
    setCurrentTime(0);
    setIsPlaying(false);
  }, [segment?.clip]);

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
  // change would abort that in-flight request, wrongly landing on onError (missingKind set) -
  // missingKind only resets when segment.clip changes, so it would stay stuck from then on). So reloadToken
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
          setMissingKind(null);
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
      void video.play().catch(() => {});
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
        void video.play().catch(() => {});
      }
    };
    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      if (playMode === "loop" && video.currentTime >= segment.out) {
        video.currentTime = segment.in;
      }
    };
    // Reflects the element's actual playing state (not just what handlePlay/handlePause think it
    // is) - also catches the shuttle's reverse-playback loop pausing the video on its own.
    const handlePlayEvent = () => setIsPlaying(true);
    const handlePauseEvent = () => setIsPlaying(false);
    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("play", handlePlayEvent);
    video.addEventListener("pause", handlePauseEvent);
    video.playbackRate = Math.min(segment.speed, MAX_PLAYBACK_RATE);
    video.volume = segment.volume;
    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("play", handlePlayEvent);
      video.removeEventListener("pause", handlePauseEvent);
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
    void video.play().catch(() => {});
  };

  const handlePause = () => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    resetShuttle();
    video.pause();
  };

  /** Jump the playhead back to the start of this cut's range (its `in` point). */
  const handleGoToStart = () => {
    const video = videoRef.current;
    if (!video || !segment) {
      return;
    }
    resetShuttle();
    video.currentTime = segment.in;
    setCurrentTime(segment.in);
  };

  const handleSetIn = () => {
    if (!segment) {
      return;
    }
    if (currentTime >= segment.out - MIN_GAP_S) {
      showNotice("In must come before Out");
      return;
    }
    onChange({ in: currentTime });
  };

  const handleSetOut = () => {
    if (!segment) {
      return;
    }
    if (currentTime <= segment.in + MIN_GAP_S) {
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
    if (!segment || capturePending) {
      return;
    }
    setCapturePending(true);
    void captureFrame(segment.clip, currentTime)
      .then((result) => {
        if (!result.ok) {
          showNotice(result.error);
        }
      })
      .finally(() => setCapturePending(false));
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
          handlePause();
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
    return (
      <div {...stylex.props(styles.videoPreview, styles.videoPreviewEmpty)} data-testid="video-preview">
        Select a cut
      </div>
    );
  }

  // Split discoverability (2026-07-11 QA fix): previously a click near either edge silently
  // showed a "Too close to the edge to split" notice after the fact - the button itself gave no
  // advance signal that the current playhead position wasn't splittable, which was especially
  // common right after selecting a cut (the head starts at `in`, itself inside the margin).
  // Disabling the button ahead of time (with a tooltip explaining why, and where to move instead)
  // surfaces that up front. handleSplit's own edge check (below) stays as-is for the keyboard
  // shortcut (Cmd/Ctrl+B) path, which bypasses this button entirely.
  const canSplit = currentTime - segment.in >= SPLIT_MARGIN && segment.out - currentTime >= SPLIT_MARGIN;

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
    <div {...stylex.props(styles.videoPreview)} data-testid="video-preview">
      <div {...stylex.props(styles.contextHeader)}>
        <div
          {...stylex.props(styles.contextScene, sceneInfo.kind === "none" && styles.contextSceneEmpty)}
          title={sceneText}
          data-testid="video-context-scene"
        >
          <span {...stylex.props(styles.contextIndex)} data-testid="video-context-index">
            #{selectedIndex + 1}
          </span>
          {sceneInfo.kind === "moment" ? (
            <Badge
              variant={shotTypeBadgeVariant(sceneInfo.shotType)}
              label={shotTypeLabel(sceneInfo.shotType)}
              xstyle={styles.sceneBadge}
            />
          ) : null}
          {sceneInfo.kind === "monotonous" ? (
            <Badge variant={TIMELAPSE_BADGE_VARIANT} label="Timelapse cut" xstyle={styles.sceneBadge} />
          ) : null}
          <span {...stylex.props(styles.contextSceneText)}>{sceneText}</span>
        </div>
        <div {...stylex.props(styles.contextLine)} title={subtitleSummary}>
          Subtitle {subtitleSummary} · {segment.in.toFixed(1)}s~{segment.out.toFixed(1)}s
        </div>
      </div>
      {isPreparingProxy ? (
        <div {...stylex.props(styles.notice, styles.noticeProxyPreparing)}>
          Preparing video — will play automatically in a moment (
          {isGeneratingProxy ? "processing now" : `#${pendingIndex + 1} in line`})
        </div>
      ) : null}
      {!isPreparingProxy && (missingKind || segment.clip === "") ? (
        <div {...stylex.props(styles.missing)}>
          {videoSourceErrorMessage(missingKind ?? "missing", segment.clip)}
        </div>
      ) : isPreparingProxy ? null : (
        <>
          {cropEditDraft ? (
            <div {...stylex.props(styles.cropEditToolbar)}>
              <span className="crop-edit-readout">
                x {(cropEditDraft.x * 100).toFixed(0)}% · y {(cropEditDraft.y * 100).toFixed(0)}%
                {" "}· w {(cropEditDraft.w * 100).toFixed(0)}% · h {(cropEditDraft.h * 100).toFixed(0)}%
              </span>
              <div {...stylex.props(styles.cropEditActions)}>
                <ToolbarButton label="Full frame" variant="ghost" size="sm" onClick={resetCropEditToFullFrame} />
                <ToolbarButton label="Apply" variant="primary" size="sm" onClick={applyCropEdit} />
                <ToolbarButton label="Cancel" variant="ghost" size="sm" onClick={cancelCropEdit} />
                {segment.crop ? (
                  <ToolbarButton label="Clear" variant="ghost" size="sm" onClick={clearCropEdit} />
                ) : null}
              </div>
            </div>
          ) : null}
          <div {...stylex.props(styles.cropFrame)} ref={cropFrameRef}>
            <video
              key={`${segment.clip}:${reloadToken}`}
              ref={videoRef}
              {...stylex.props(styles.video)}
              src={`/clips/${encodeURIComponent(segment.clip)}`}
              onError={(e) => {
                // The <video> error event's own MediaError.code can't distinguish "file doesn't
                // exist" from "file exists but isn't playable video" (verified empirically - see
                // lib/videoSourceError.ts) - a supplementary fetch of the same src is what actually
                // tells the two apart.
                const src = e.currentTarget.currentSrc || e.currentTarget.src;
                void fetch(src, { method: "HEAD" })
                  .then((res) => setMissingKind(classifyVideoSourceError(res.ok)))
                  .catch(() => setMissingKind("missing"));
              }}
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
            {!cropEditDraft ? (
              <TitleOverlay
                title={segment.title}
                currentTimeS={currentTime}
                inS={segment.in}
                isPlaying={isPlaying}
                projectWidth={projectWidth}
                projectHeight={projectHeight}
                projectFps={projectFps}
              />
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
                          padding: subtitleBackgroundPadding(effectiveSubtitleStyle.background.padding),
                        }
                      : undefined
                  }
                >
                  {segment.subtitle.trim()}
                </span>
              </div>
            ) : null}
          </div>

          {/* Single zoomable filmstrip strip (screen-spec section 3, replacing the old two-level
              trim) - see docs/research/trim-ux-conventions.md section 4. */}
          <TrimStrip
            clip={segment.clip}
            durationS={duration}
            inS={segment.in}
            outS={segment.out}
            currentTimeS={currentTime}
            resetKey={selectedIndex}
            onChangeIn={(t) => onChange({ in: clamp(t, 0, segment.out - MIN_GAP_S) })}
            onChangeOut={(t) => onChange({ out: clamp(t, segment.in + MIN_GAP_S, duration) })}
            onSeek={seekTo}
            onViewportChange={setViewport}
          />

          <div {...stylex.props(styles.timeReadout)}>
            Now {currentTime.toFixed(1)}s · In {segment.in.toFixed(1)}s · Out {segment.out.toFixed(1)}s
            {duration > 0 && viewport.end - viewport.start < duration - 0.01
              ? ` · Viewing ${viewport.start.toFixed(1)}s–${viewport.end.toFixed(1)}s`
              : null}
          </div>

          {/* Playback controls — a single row attached directly below the video(+scrub) (screen-spec section 3). */}
          <div {...stylex.props(styles.videoControlsRow)}>
            <IconButton
              label="Go to start"
              icon={<Icon icon={SkipBack} />}
              variant="secondary"
              size="sm"
              tooltip="Go to start"
              onClick={handleGoToStart}
              data-testid="video-control-go-to-start"
            />
            <IconButton
              label={isPlaying ? "Pause" : "Play"}
              icon={<Icon icon={isPlaying ? Pause : Play} />}
              variant="primary"
              size="sm"
              onClick={isPlaying ? handlePause : handlePlay}
              data-testid="video-control-play"
            />
            <Button
              label="Mark In"
              variant="secondary"
              size="sm"
              onClick={handleSetIn}
              data-testid="video-control-set-in"
            />
            <Button
              label="Mark Out"
              variant="secondary"
              size="sm"
              onClick={handleSetOut}
              data-testid="video-control-set-out"
            />
            <Button
              label="Split"
              variant="secondary"
              size="sm"
              isDisabled={!canSplit}
              tooltip={canSplit ? undefined : "Move the playhead away from the cut's edges to split here"}
              onClick={handleSplit}
              data-testid="video-control-split"
            />
            <Button
              label={capturePending ? "Capturing…" : "Capture frame"}
              variant="secondary"
              size="sm"
              isDisabled={capturePending}
              tooltip="Captures the original frame (crop is not applied to the capture)"
              onClick={handleCapture}
              data-testid="video-control-capture-frame"
            />
            {/* Reframe entry point (2026-07-11 QA fix, "structure matches flow" - reframe/crop
                edits happen ON the video via an overlay, so its entry button belongs beside the
                other video-toolbar actions, not as a separate cut-settings group). Hidden while
                already editing (cropEditToolbar above takes over with Full frame/Apply/Cancel/
                Clear) so there's only ever one reframe-related control visible at a time. */}
            {!cropEditDraft ? (
              <Button
                label={segment.crop ? "Adjust reframe" : "Reframe"}
                variant="secondary"
                size="sm"
                onClick={startCropEdit}
                data-testid="video-control-reframe"
              />
            ) : null}
          </div>

          {/* Playback-range toggle (2026-07-11 stock-component migration) - a stock Astryx
              SegmentedControl replaces the old raw `.plain-button` pair. `size="sm"` keeps it
              deliberately smaller/quieter than the primary Play button above (2026-07-11 hierarchy
              fix) - this is a secondary playback setting, not this control area's primary action.
              SegmentedControlItem doesn't forward `data-testid` (destructures a fixed prop list with
              no `...rest` capture, same footgun CLAUDE.md documents for CheckboxInput), so the old
              video-playmode-loop/free testids are gone - tests select by role/name instead (see
              VideoPreview.test.tsx). */}
          <SegmentedControl value={playMode} onChange={(v) => setPlayMode(v as PlayMode)} label="Playback range" size="sm">
            <SegmentedControlItem value="loop" label="Loop range" />
            <SegmentedControlItem value="free" label="Full clip" />
          </SegmentedControl>

          {notice ? <div {...stylex.props(styles.notice)}>{notice}</div> : null}
        </>
      )}
    </div>
  );
});

/** Polling interval (ms) for proxy readiness status. */
const PROXY_STATUS_POLL_INTERVAL_MS = 10000;

/** Minimum gap (seconds) from the in/out boundary when splitting. */
const SPLIT_MARGIN = 0.2;
