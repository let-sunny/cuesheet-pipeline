import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { MouseEvent } from "react";
import * as stylex from "@stylexjs/stylex";
import type { CueSheet, Segment, SubtitleStyle, SubtitleStylePresets } from "@cuesheet/schema";
import { Button } from "@astryxdesign/core/Button";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { ChevronFirst, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { cropPreviewStyle } from "../../lib/cropPreview.js";
import { TitleOverlay } from "../TitleOverlay/index.js";
import type { ClipMoments, NarrationFile } from "../../api.js";
import { matchSceneInfo } from "../../lib/sceneInfo.js";
import { cumulativeCutStarts } from "../../lib/bgmCutMapping.js";
import { formatClock } from "../../lib/segmentTiming.js";
import { useSequenceAudio } from "../../hooks/useSequenceAudio.js";
import { MAX_PLAYBACK_RATE, useShuttle } from "../../hooks/useShuttle.js";
import {
  computeCurrentOutputPosition,
  pickActiveSlot,
  pickPreloadSlot,
  resolveProgressClickTarget,
} from "../../lib/sequenceScheduling.js";
import {
  mergeSubtitleStyle,
  subtitleBackgroundRgba,
  subtitleBackgroundPadding,
  subtitleOutlineStyle,
  subtitlePositionStyle,
  toCqw,
} from "../../lib/subtitleOverlay.js";
import { transitionOpacity } from "../../lib/transitionOverlay.js";
import { styles } from "./SequencePlayer.styles.js";

/** Handle for controlling playthrough from outside (e.g. the Space shortcut in App.tsx). */
export interface SequencePlayerHandle {
  togglePlay: () => void;
  /** L: forward playback/speed shuttle (repeated presses go 1x -> 2x -> 4x). */
  shuttleForward: () => void;
  /** J: reverse playback/speed shuttle (approximate, repeated presses go 1x -> 2x -> 4x, audio muted). */
  shuttleBackward: () => void;
  /** K: stop shuttle. */
  shuttleStop: () => void;
}

interface Props {
  segments: Segment[];
  /** Full cuesheet — segments is also passed separately above (existing prop, used by the video
   *  logic), but useSequenceAudio also needs bgm/narration to make BGM/narration audible here. */
  cue: CueSheet;
  /** /api/narration-files listing — passed through to useSequenceAudio to resolve each narrated
   *  segment's real clip duration by filename. */
  narrationFiles: NarrationFile[];
  /** Index of the cut currently playing/selected (shared with App's selectedIndex). */
  currentIndex: number;
  /** Draft vision-analysis data — used to show a small scene description for the current cut over the subtitle. */
  moments: ClipMoments[];
  subtitleStyle: SubtitleStyle;
  /** Named subtitle style presets dictionary - merged in ahead of a segment's own styleOverride. */
  subtitleStylePresets: SubtitleStylePresets | undefined;
  /** Used to convert subtitleStyle.margin (px, relative to source resolution) into a stage ratio (%). */
  projectHeight: number;
  /** Used to convert subtitleStyle.size/outlineWidth (px, relative to source resolution) into cqw relative to stage width. */
  projectWidth: number;
  /** Both auto-advance and mini-timeline clicks update App's selectedIndex through this single callback. */
  onIndexChange: (i: number) => void;
  /** Close button — exits playthrough mode (the parent tears down the sticky player area). */
  onExit: () => void;
}

/**
 * Full playthrough of the entire cut. Plays segments in order (only their in~out range) and
 * automatically switches to the next cut when one ends (just a seek if it's the same clip, or a
 * swap between two <video> slots if it's a different clip — the next clip is preloaded ahead of
 * time). A minor timing difference from the actual render output is acceptable for this
 * review-purpose preview.
 */
export const SequencePlayer = forwardRef<SequencePlayerHandle, Props>(function SequencePlayer(
  {
    segments,
    cue,
    narrationFiles,
    currentIndex,
    moments,
    subtitleStyle,
    subtitleStylePresets,
    projectHeight,
    projectWidth,
    onIndexChange,
    onExit,
  },
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
  // User preview playback rate (1x/1.5x/2x) — applied to video.playbackRate multiplied with the segment's own speed.
  const [userRate, setUserRate] = useState<number>(1);
  const userRateRef = useRef(userRate);
  // For progress bar display — current source time (seconds) of the active slot. Updated on timeupdate.
  const [videoNow, setVideoNow] = useState(0);
  // A one-shot channel for passing the source time that the next currentIndex effect should use
  // instead of seg.in, for when a progress-bar-click seek needs to jump to a different segment.
  const pendingSeekRef = useRef<{ index: number; time: number } | null>(null);

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
  useEffect(() => {
    userRateRef.current = userRate;
    // Speed toggle while playing — apply it directly to the video being watched now, without waiting for a cut change.
    const video = videoRefs[frontRef.current].current;
    const seg = segmentsRef.current[currentIndex];
    if (video && seg) {
      video.playbackRate = Math.min(seg.speed * userRate, MAX_PLAYBACK_RATE);
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

  // J/K/L shuttle (same mechanics as VideoPreview's per-cut trim view, shared via useShuttle) -
  // parameterized for this component's two differences: the active <video> is one of two
  // preload slots rather than a single stable ref, and reverse playback floors at 0 (the clip's
  // absolute start) rather than the cut's `in`, since this component's <video> holds the whole
  // source clip. The extra `playing`/playbackRate bookkeeping below (onReset/onStop/
  // onBackwardStart, and the shuttleForward wrapper) restores exactly what the inline version did.
  const {
    shuttleForward: shuttleForwardLevel,
    shuttleBackward,
    shuttleStop,
    resetShuttle,
  } = useShuttle({
    getVideo: () => videoRefs[frontRef.current].current,
    bounds: segments[currentIndex],
    setCurrentTime: setVideoNow,
    reverseFloor: 0,
    snapToInOnForwardStart: false,
    onReset: () => {
      const video = videoRefs[frontRef.current].current;
      const seg = segmentsRef.current[currentIndex];
      if (video && seg) {
        video.playbackRate = Math.min(seg.speed * userRateRef.current, MAX_PLAYBACK_RATE);
      }
    },
    onStop: () => setPlaying(false),
    onBackwardStart: () => setPlaying(false),
  });

  /** L: forward playback. Repeated presses raise the speed 1x -> 2x -> 4x (capped at 4x). If
      reverse playback is active, switches to forward 1x. */
  function shuttleForward() {
    const video = videoRefs[frontRef.current].current;
    const seg = segmentsRef.current[currentIndex];
    if (!video || !seg) {
      return;
    }
    shuttleForwardLevel();
    setPlaying(true);
  }

  // Switch to the current cut (currentIndex) — both mini-timeline clicks (external) and
  // auto-advance (internal) change this prop via onIndexChange, so they're handled through one path.
  useEffect(() => {
    let cancelled = false;
    advancingRef.current = false;
    // When the cut changes, clean up any shuttle (J/K/L) that was running for the previous cut (both forward-speed and reverse-playback loops).
    resetShuttle();

    void (async () => {
      const seg = segmentsRef.current[currentIndex];
      if (!seg) {
        setPlaying(false);
        return;
      }
      const oldFront = frontRef.current;
      const activeSlot = pickActiveSlot(clipOfSlot.current, oldFront, seg.clip);
      // Even for a slot that was preloaded, there's no guarantee loadedmetadata actually finished
      // (preload is fire-and-forget) — calling play() as-is can throw NotSupportedError at
      // readyState 0 when the cut is short. Always wait for it
      // (loadClipInto is an idempotent function that returns immediately if the clip is already loaded).
      const loaded = await loadClipInto(activeSlot, seg.clip);
      if (cancelled) {
        return;
      }

      if (!loaded) {
        // A clip that can't be decoded at all (unsupported codec, corrupted proxy, etc.) —
        // loadedmetadata will never fire, so instead of getting stuck here, skip to the next cut (prevents an infinite stall).
        console.warn(`[SequencePlayer] Clip can't be played, skipping: ${seg.clip}`);
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
        // If we arrived at this cut via a progress-bar-click seek, start from that specified point instead of seg.in.
        const pending = pendingSeekRef.current;
        pendingSeekRef.current = null;
        video.currentTime = pending && pending.index === currentIndex ? pending.time : seg.in;
        video.playbackRate = Math.min(seg.speed * userRateRef.current, MAX_PLAYBACK_RATE);
        video.volume = seg.volume;
        setVideoNow(video.currentTime);
        if (playingRef.current) {
          void video.play().catch(() => {});
        }
      }

      // Preload the next cut into the idle slot (only when it's a different clip).
      const nextSeg = segmentsRef.current[currentIndex + 1];
      const preloadSlot = pickPreloadSlot(clipOfSlot.current, activeSlot, nextSeg?.clip);
      if (nextSeg && preloadSlot !== null) {
        void loadClipInto(preloadSlot, nextSeg.clip);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  // Apply the play/pause toggle to the currently active slot. Right after mount (before the
  // currentIndex effect has filled in src), currentSrc is empty and play() would throw
  // NotSupportedError, so only apply it once the source has actually loaded.
  useEffect(() => {
    const video = videoRefs[front].current;
    if (!video || !video.currentSrc) {
      return;
    }
    if (playing) {
      void video.play().catch(() => {});
    } else {
      video.pause();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, front]);

  // Advance to the next cut once the out point is passed — attached to both slots, but only the
  // currently active (front) one reacts (so the listener doesn't drop right after a swap).
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
    // The shuttle* functions reference segmentsRef.current[currentIndex] through closure, so the
    // handle must be recreated whenever currentIndex changes to point at the latest cut
    // (togglePlay only uses a functional setPlaying update, so it's safe without a currentIndex dependency).
    [currentIndex],
  );

  const currentSegment = segments[currentIndex];
  const subtitle = currentSegment?.subtitle.trim() ?? "";
  // If this cut has its own style override, use the result of merging it into the global
  // subtitleStyle (render and preview both follow the same merge rule — see subtitleOverlay.ts).
  const effectiveStyle = mergeSubtitleStyle(
    subtitleStyle,
    subtitleStylePresets,
    currentSegment?.stylePreset,
    currentSegment?.styleOverride,
  );
  // Show a small hint above the subtitle so even a first-time viewer can tell what scene the
  // currently playing cut is. Cuts with no match are hidden silently (to avoid breaking
  // immersion during playthrough — an explicit "no scene info" is only enforced in the cut
  // list/inspector).
  const sceneHint = currentSegment ? matchSceneInfo(currentSegment, moments) : { kind: "none" as const };
  const sceneHintText = sceneHint.kind !== "none" ? sceneHint.memo : null;

  // Preview approximation of the active cut's transitionIn/transitionOut (PRD backlog #3) - only
  // meaningful merged into the *front* (visible) slot's own style below, never the back slot's
  // (which stays hidden via its own CSS class regardless of any style here).
  const frontStyle = currentSegment
    ? {
        ...cropPreviewStyle(currentSegment.crop),
        opacity: transitionOpacity(
          currentSegment.transitionIn,
          currentSegment.transitionOut,
          currentSegment.out - currentSegment.in,
          videoNow - currentSegment.in,
        ),
      }
    : undefined;

  // Cumulative offset (seconds) on the output timeline — the progress bar, time display, and
  // click-seeking all use this basis. cumulativeStart has one trailing entry equal to the total
  // (see lib/bgmCutMapping.ts), so totalOutputSeconds is just its last element.
  const cumulativeStart = cumulativeCutStarts(segments);
  const totalOutputSeconds = cumulativeStart[cumulativeStart.length - 1] ?? 0;
  const currentOutputPosition = computeCurrentOutputPosition(
    cumulativeStart,
    currentIndex,
    currentSegment,
    videoNow,
    totalOutputSeconds,
  );
  const progressRatio = totalOutputSeconds > 0 ? Math.min(1, currentOutputPosition / totalOutputSeconds) : 0;

  // Makes BGM/narration (and BGM ducking) actually audible during "Play all" - the <video>
  // elements above only ever carry the selected cut's own embedded audio track. Driven by the
  // same output-timeline position/playing state/user rate as everything else in this component.
  useSequenceAudio({
    cue,
    positionS: currentOutputPosition,
    playing,
    rate: userRate,
    narrationFiles,
  });

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

  /** Jump to the very start of the whole sequence - the first cut's `in` point. */
  function goToStart() {
    const startTime = segments[0]?.in ?? 0;
    if (currentIndex === 0) {
      const video = videoRefs[frontRef.current].current;
      if (video) {
        video.currentTime = startTime;
        setVideoNow(startTime);
      }
      return;
    }
    pendingSeekRef.current = { index: 0, time: startTime };
    onIndexChange(0);
  }

  // Progress bar click seek — click position (ratio on the output timeline) -> corresponding cut index + source offset within the cut.
  function handleProgressClick(e: MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const target = resolveProgressClickTarget(segments, cumulativeStart, totalOutputSeconds, ratio);
    if (!target) {
      return;
    }
    const { index: targetIndex, sourceTime } = target;

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
    <div {...stylex.props(styles.player)}>
      <div {...stylex.props(styles.stage)}>
        <video
          ref={videoRefs[0]}
          {...stylex.props(styles.video, front !== 0 && styles.videoHidden)}
          style={front === 0 ? frontStyle : undefined}
          playsInline
        />
        <video
          ref={videoRefs[1]}
          {...stylex.props(styles.video, front !== 1 && styles.videoHidden)}
          style={front === 1 ? frontStyle : undefined}
          playsInline
        />
        {sceneHintText ? (
          <div {...stylex.props(styles.sceneHint)} title={sceneHintText}>
            {sceneHintText}
          </div>
        ) : null}
        <TitleOverlay
          title={currentSegment?.title}
          currentTimeS={videoNow}
          inS={currentSegment?.in ?? 0}
          isPlaying={playing}
          projectWidth={projectWidth}
          projectHeight={projectHeight}
          projectFps={cue.project.fps}
        />
        {subtitle !== "" ? (
          <div
            {...stylex.props(
              styles.subtitle,
              effectiveStyle.position === "bottom" && styles.subtitleBottom,
              effectiveStyle.position === "top" && styles.subtitleTop,
              effectiveStyle.position === "center" && styles.subtitleCenter,
            )}
            data-testid="sequence-subtitle"
            style={{
              color: effectiveStyle.color,
              fontFamily: effectiveStyle.font,
              fontSize: toCqw(effectiveStyle.size, projectWidth),
              ...subtitleOutlineStyle(
                effectiveStyle.outlineWidth,
                toCqw(effectiveStyle.outlineWidth, projectWidth),
                effectiveStyle.outlineColor,
              ),
              // An approximation converting effectiveStyle.margin (source px) into % relative to
              // stage height — the stage is fixed at 16:9 (styles.css) so it may differ from the
              // project's actual aspect ratio, but this approximation is good enough for
              // reflecting the top/bottom offset instead of a fixed CSS value (24px).
              ...subtitlePositionStyle(effectiveStyle, projectHeight),
            }}
          >
            <span
              {...stylex.props(styles.subtitleText)}
              style={
                effectiveStyle.background
                  ? {
                      background: subtitleBackgroundRgba(
                        effectiveStyle.background.color,
                        effectiveStyle.background.opacity,
                      ),
                      padding: subtitleBackgroundPadding(effectiveStyle.background.padding),
                    }
                  : undefined
              }
            >
              {subtitle}
            </span>
          </div>
        ) : null}
        {!currentSegment ? <div {...stylex.props(styles.ended)}>End</div> : null}
      </div>

      <div
        {...stylex.props(styles.progress)}
        onClick={handleProgressClick}
        role="slider"
        aria-label="Play all progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progressRatio * 100)}
      >
        <div {...stylex.props(styles.progressFill)} style={{ width: `${progressRatio * 100}%` }} />
      </div>

      <div {...stylex.props(styles.controls)}>
        <div {...stylex.props(styles.transport)}>
          <IconButton
            label="Go to start"
            icon={<Icon icon={ChevronFirst} />}
            variant="ghost"
            tooltip="Go to start"
            isDisabled={currentIndex <= 0 && videoNow <= (segments[0]?.in ?? 0)}
            onClick={goToStart}
            data-testid="sequence-go-to-start"
          />
          <IconButton
            label="Previous cut"
            icon={<Icon icon={SkipBack} />}
            variant="ghost"
            tooltip="Previous cut"
            isDisabled={currentIndex <= 0}
            onClick={goToPrevCut}
            data-testid="sequence-prev-cut"
          />
          <IconButton
            label={playing ? "Pause" : "Play"}
            icon={<Icon icon={playing ? Pause : Play} />}
            variant="secondary"
            isDisabled={!currentSegment}
            onClick={() => setPlaying((p) => !p)}
            data-testid="sequence-playpause"
          />
          <IconButton
            label="Next cut"
            icon={<Icon icon={SkipForward} />}
            variant="ghost"
            tooltip="Next cut"
            isDisabled={currentIndex >= segments.length - 1}
            onClick={goToNextCut}
            data-testid="sequence-next-cut"
          />
        </div>

        {/* Playback-speed toggle (2026-07-11 stock-component migration) - a stock Astryx
            SegmentedControl replaces the old raw `.plain-button` row. */}
        <SegmentedControl value={String(userRate)} onChange={(v) => setUserRate(Number(v))} label="Playback speed" size="sm">
          {RATE_OPTIONS.map((rate) => (
            <SegmentedControlItem key={rate} value={String(rate)} label={`${rate}x`} />
          ))}
        </SegmentedControl>

        <span {...stylex.props(styles.counter)}>
          Cut {segments.length > 0 ? `${currentIndex + 1}/${segments.length}` : "0/0"} ·{" "}
          {formatClock(currentOutputPosition)} / {formatClock(totalOutputSeconds)}
        </span>

        <Button label="Close" variant="ghost" onClick={onExit} />
      </div>
    </div>
  );
});

function clipUrl(clip: string): string {
  return `/clips/${encodeURIComponent(clip)}`;
}

/**
 * Waits for metadata loading to complete. If the clip is in a format the browser can't decode
 * (e.g. HEVC — proxy generation failed/left corrupted and the original codec is served as-is),
 * loadedmetadata will never fire, so we also listen for the error event and resolve with false
 * to avoid waiting forever. If loading has already failed on this video element before
 * (video.error is set), the event won't fire again, so resolve with false immediately.
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

/** User preview playback rate options. Applied multiplied with the segment's own speed. */
const RATE_OPTIONS = [1, 1.5, 2] as const;
