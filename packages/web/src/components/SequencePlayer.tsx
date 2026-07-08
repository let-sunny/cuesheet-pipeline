import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { MouseEvent } from "react";
import type { Segment, SubtitleStyle } from "@cuesheet/schema";
import { Button } from "@astryxdesign/core/Button";
import { cropPreviewStyle } from "../lib/cropPreview.js";
import type { ClipMoments } from "../api.js";
import { matchSceneInfo } from "../lib/sceneInfo.js";
import { formatClock, playbackSeconds } from "../lib/segmentTiming.js";
import {
  mergeSubtitleStyle,
  subtitleBackgroundRgba,
  subtitleOutlineStyle,
  subtitlePositionStyle,
  toCqw,
} from "../lib/subtitleOverlay.js";

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
  /** Index of the cut currently playing/selected (shared with App's selectedIndex). */
  currentIndex: number;
  /** Draft vision-analysis data — used to show a small scene description for the current cut over the subtitle. */
  moments: ClipMoments[];
  subtitleStyle: SubtitleStyle;
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
  // User preview playback rate (1x/1.5x/2x) — applied to video.playbackRate multiplied with the segment's own speed.
  const [userRate, setUserRate] = useState<number>(1);
  const userRateRef = useRef(userRate);
  // For progress bar display — current source time (seconds) of the active slot. Updated on timeupdate.
  const [videoNow, setVideoNow] = useState(0);
  // A one-shot channel for passing the source time that the next currentIndex effect should use
  // instead of seg.in, for when a progress-bar-click seek needs to jump to a different segment.
  const pendingSeekRef = useRef<{ index: number; time: number } | null>(null);
  // J/K/L shuttle state (same approach as VideoPreview) — "stopped" means the shuttle isn't
  // involved, i.e. normal playback/pause (handled by existing logic like userRate speed).
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
  // Clean up on unmount so no reverse-playback rAF loop is left running.
  useEffect(() => {
    return () => stopShuttleRaf();
  }, []);
  useEffect(() => {
    userRateRef.current = userRate;
    // Speed toggle while playing — apply it directly to the video being watched now, without waiting for a cut change.
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

  /** Resets the shuttle (J/K/L) to its normal state — restores the rate to seg.speed*userRate. */
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

  /** Reverse playback frame loop — keeps the active slot's video paused and decrements
      currentTime directly on every rAF (an approximation, since negative playbackRate isn't
      supported). Doesn't cross the cut boundary; stops at 0. */
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

  /** L: forward playback. Repeated presses raise the speed 1x -> 2x -> 4x (capped at 4x). If
      reverse playback is active, switches to forward 1x. */
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

  /** J: reverse playback (approximate). Repeated presses go 1x -> 2x -> 4x. Audio is meaningless
      here so it's muted. If forward playback is active, switches to reverse 1x. */
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
      const back = oldFront === 0 ? 1 : 0;
      let activeSlot: 0 | 1;

      if (clipOfSlot.current[oldFront] === seg.clip) {
        activeSlot = oldFront;
      } else if (clipOfSlot.current[back] === seg.clip) {
        activeSlot = back;
      } else {
        activeSlot = oldFront;
      }
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
        video.playbackRate = seg.speed * userRateRef.current;
        video.volume = seg.volume;
        setVideoNow(video.currentTime);
        if (playingRef.current) {
          void video.play();
        }
      }

      // Preload the next cut into the idle slot (only when it's a different clip).
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

  // Apply the play/pause toggle to the currently active slot. Right after mount (before the
  // currentIndex effect has filled in src), currentSrc is empty and play() would throw
  // NotSupportedError, so only apply it once the source has actually loaded.
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
  const effectiveStyle = mergeSubtitleStyle(subtitleStyle, currentSegment?.styleOverride);
  // Show a small hint above the subtitle so even a first-time viewer can tell what scene the
  // currently playing cut is. Cuts with no match are hidden silently (to avoid breaking
  // immersion during playthrough — an explicit "no scene info" is only enforced in the cut
  // list/inspector).
  const sceneHint = currentSegment ? matchSceneInfo(currentSegment, moments) : { kind: "none" as const };
  const sceneHintText = sceneHint.kind !== "none" ? sceneHint.memo : null;

  // Cumulative offset (seconds) on the output timeline — the progress bar, time display, and click-seeking all use this basis.
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

  // Progress bar click seek — click position (ratio on the output timeline) -> corresponding cut index + source offset within the cut.
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
              // An approximation converting effectiveStyle.margin (source px) into % relative to
              // stage height — the stage is fixed at 16:9 (styles.css) so it may differ from the
              // project's actual aspect ratio, but this approximation is good enough for
              // reflecting the top/bottom offset instead of a fixed CSS value (24px).
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
        {!currentSegment ? <div className="sequence-player-ended">End</div> : null}
      </div>

      <div
        className="sequence-player-progress"
        onClick={handleProgressClick}
        role="slider"
        aria-label="Play all progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progressRatio * 100)}
      >
        <div className="sequence-player-progress-fill" style={{ width: `${progressRatio * 100}%` }} />
      </div>

      <div className="sequence-player-controls">
        <div className="sequence-player-transport">
          <Button label="Previous cut" variant="ghost" isDisabled={currentIndex <= 0} onClick={goToPrevCut} />
          <Button
            label={playing ? "Pause" : "Play"}
            variant="secondary"
            isDisabled={!currentSegment}
            onClick={() => setPlaying((p) => !p)}
          />
          <Button
            label="Next cut"
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
              className={`plain-button${userRate === rate ? " active" : ""}`}
              onClick={() => setUserRate(rate)}
            >
              {rate}x
            </button>
          ))}
        </div>

        <span className="sequence-player-counter">
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
