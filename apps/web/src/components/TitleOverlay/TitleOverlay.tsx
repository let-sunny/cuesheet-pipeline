import { useEffect, useRef } from "react";
import * as stylex from "@stylexjs/stylex";
import type { Title } from "@cuesheet/schema";
import { styles } from "./TitleOverlay.styles.js";

export interface TitleOverlayProps {
  title: Title | null | undefined;
  /** Playback time (seconds) relative to the segment's own start - a title always begins at the
   * cut's start (there is no separate `start` field in the schema), so this is simply
   * `currentVideoTime - segment.in`. */
  localTimeS: number;
}

/**
 * Live preview of a cut's title card (PRD backlog #2) - renders the same 4 presets the render
 * pipeline produces (typing via CSS reveal here / ASS karaoke at render time; gooey/melt/particle
 * via CSS+SVG/canvas here / headless-captured PNG overlay at render time - see
 * docs/research/title-render-spike.md for why the two paths differ). This is the first
 * full-anatomy component in the repo (folder + co-located .styles.ts + co-located test + index.ts
 * - see CLAUDE.md "component layering").
 */
export function TitleOverlay({ title, localTimeS }: TitleOverlayProps) {
  if (!title || !isTitleVisible(localTimeS, title.durationS)) {
    return null;
  }
  const dim = title.backdrop?.dim ?? 0;
  const dimOpacity = backdropOpacity(dim, title.durationS, localTimeS);
  const progress = Math.min(1, Math.max(0, localTimeS / title.durationS));

  return (
    <div {...stylex.props(styles.container)} data-testid="title-overlay">
      {dimOpacity > 0 ? <div {...stylex.props(styles.backdrop)} style={{ opacity: dimOpacity }} /> : null}
      <div {...stylex.props(styles.stage)}>
        {title.preset === "typing" ? (
          <TypingTitle text={title.text} durationS={title.durationS} localTimeS={localTimeS} />
        ) : title.preset === "gooey" ? (
          <GooeyTitle text={title.text} progress={progress} exit={false} />
        ) : title.preset === "melt" ? (
          <GooeyTitle text={title.text} progress={progress} exit />
        ) : (
          <ParticleTitle text={title.text} progress={progress} />
        )}
      </div>
    </div>
  );
}

/** True while `localTimeS` falls inside the title's [0, durationS] display window. */
export function isTitleVisible(localTimeS: number, durationS: number): boolean {
  return localTimeS >= 0 && localTimeS <= durationS;
}

/**
 * Backdrop dim opacity at a given moment - ramps 0 -> dim over the first fadeT seconds, holds,
 * ramps back to 0 over the final fadeT seconds. Mirrors packages/render/src/plan.ts's
 * `color=black...fade=...:alpha=1...colorchannelmixer=aa=<dim>` construction (same fadeT formula
 * and envelope shape) so the preview and the actual render agree on how the dim behaves.
 */
export function backdropOpacity(dim: number, durationS: number, localTimeS: number): number {
  if (dim <= 0 || !isTitleVisible(localTimeS, durationS)) {
    return 0;
  }
  const fadeT = Math.min(durationS / 2, 0.4);
  if (localTimeS < fadeT) {
    return (localTimeS / fadeT) * dim;
  }
  const fadeOutStart = Math.max(0, durationS - fadeT);
  if (localTimeS < fadeOutStart) {
    return dim;
  }
  const remaining = Math.max(0, durationS - localTimeS);
  return (remaining / fadeT) * dim;
}

/**
 * Whole-line fade envelope (0-1), mirroring the typing preset's ASS `\fad` - a quick fade in/out
 * framing the per-character karaoke reveal (see packages/render/src/title.ts's buildTitleAssContent).
 */
export function lineFadeOpacity(durationS: number, localTimeS: number): number {
  if (!isTitleVisible(localTimeS, durationS)) {
    return 0;
  }
  const fadeS = Math.min(0.3, durationS / 4);
  if (localTimeS < fadeS) {
    return localTimeS / fadeS;
  }
  const fadeOutStart = Math.max(0, durationS - fadeS);
  if (localTimeS > fadeOutStart) {
    return Math.max(0, (durationS - localTimeS) / fadeS);
  }
  return 1;
}

/**
 * Number of characters revealed so far - matches the typing preset's per-character equal-duration
 * ASS `\k` reveal (packages/render/src/title.ts), just evaluated continuously here instead of in
 * fixed centisecond steps.
 */
export function typingRevealedCount(textLength: number, durationS: number, localTimeS: number): number {
  if (textLength <= 0) {
    return 0;
  }
  const progress = Math.min(1, Math.max(0, localTimeS / durationS));
  return Math.min(textLength, Math.floor(progress * textLength + 1e-6));
}

/** Deterministic seeded pseudo-random (sine-hash) - same technique as the render-side capture animations. */
function seededRand(i: number, salt: number): number {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}
function easeOutCubic(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - c, 3);
}
function easeInCubic(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * c;
}

interface TypingTitleProps {
  text: string;
  durationS: number;
  localTimeS: number;
}

function TypingTitle({ text, durationS, localTimeS }: TypingTitleProps) {
  const chars = Array.from(text);
  const revealed = typingRevealedCount(chars.length, durationS, localTimeS);
  const fade = lineFadeOpacity(durationS, localTimeS);
  const cursorOn = revealed < chars.length && Math.floor(localTimeS * 2) % 2 === 0;
  return (
    <span {...stylex.props(styles.typingText)} style={{ fontSize: "8cqw", opacity: fade }}>
      {chars.map((ch, i) => (
        <span key={i} style={{ opacity: i < revealed ? 1 : 0 }}>
          {ch}
        </span>
      ))}
      <span style={{ opacity: cursorOn ? 1 : 0 }}>|</span>
    </span>
  );
}

interface GooeyTitleProps {
  text: string;
  progress: number;
  /** true = Melt (entrance + drip/fade exit), false = Gooey (entrance only). */
  exit: boolean;
}

/** Gooey (entrance) and Melt (entrance + drip exit) - both use the same SVG goo filter chain, ported directly from packages/render/src/titleAnimations.ts's capture math (continuous `progress` instead of a discrete frame index). */
function GooeyTitle({ text, progress, exit }: GooeyTitleProps) {
  const chars = Array.from(text);
  const spacing = Math.min(90, 400 / Math.max(1, chars.length));
  const startX = (-(chars.length - 1) * spacing) / 2;
  const filterId = exit ? "title-goo-melt" : "title-goo";
  const enterStagger = (exit ? 0.15 : 0.5) / Math.max(1, chars.length);
  const meltStagger = 0.3 / Math.max(1, chars.length);
  const ENTER_END = 0.25;
  const HOLD_END = 0.55;

  return (
    <svg {...stylex.props(styles.svgStage)} viewBox="-400 -200 800 400" preserveAspectRatio="xMidYMid meet">
      <defs>
        <filter id={filterId}>
          <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur" />
          <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10" result="goo" />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
      </defs>
      <g filter={`url(#${filterId})`} fill="#ffffff">
        {chars.map((_, i) => {
          const targetX = startX + i * spacing;
          let cx: number;
          let cy: number;
          let r = 34;
          let opacity = 1;

          if (!exit) {
            const localT = easeOutCubic((progress - i * enterStagger) / (1 - i * enterStagger || 1));
            const originX = targetX + (seededRand(i, 1) - 0.5) * 400;
            const originY = (seededRand(i, 2) - 0.5) * 400;
            cx = originX + (targetX - originX) * localT;
            cy = originY + (0 - originY) * localT;
          } else if (progress < ENTER_END) {
            const localT = easeOutCubic(
              (progress / ENTER_END - i * enterStagger) / (1 - i * enterStagger || 1),
            );
            const originX = targetX + (seededRand(i, 3) - 0.5) * 300;
            const originY = -200 - seededRand(i, 4) * 200;
            cx = originX + (targetX - originX) * localT;
            cy = originY + (0 - originY) * localT;
          } else if (progress < HOLD_END) {
            cx = targetX;
            cy = 0;
          } else {
            const meltT = (progress - HOLD_END) / (1 - HOLD_END);
            const localT = easeInCubic((meltT - i * meltStagger) / (1 - i * meltStagger || 1));
            const dripX = targetX + (seededRand(i, 5) - 0.5) * 40;
            const dripY = 260 + seededRand(i, 6) * 120;
            cx = targetX + (dripX - targetX) * localT;
            cy = 0 + (dripY - 0) * localT;
            r = 34 * (1 - 0.4 * localT);
            opacity = 1 - localT;
          }

          return <circle key={i} cx={cx} cy={cy} r={r} opacity={Math.max(0, opacity)} />;
        })}
      </g>
    </svg>
  );
}

interface ParticleTitleProps {
  text: string;
  progress: number;
}

const PARTICLE_CANVAS_WIDTH = 640;
const PARTICLE_CANVAS_HEIGHT = 360;
const PARTICLE_GRID_PX = 6;

/** Particle - samples the target text's shape into a point cloud once (cached per text), then eases each particle in from a seeded random origin, exactly like packages/render/src/titleAnimations.ts's capture version. */
function ParticleTitle({ text, progress }: ParticleTitleProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cacheRef = useRef<{
    text: string;
    points: { x: number; y: number }[];
    origins: { x: number; y: number }[];
    delays: number[];
  } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    const width = canvas.width;
    const height = canvas.height;

    if (!cacheRef.current || cacheRef.current.text !== text) {
      const off = document.createElement("canvas");
      off.width = width;
      off.height = height;
      const octx = off.getContext("2d");
      if (!octx) {
        return;
      }
      octx.fillStyle = "#ffffff";
      octx.font = "bold 60px sans-serif";
      octx.textAlign = "center";
      octx.textBaseline = "middle";
      octx.fillText(text, width / 2, height / 2);
      const data = octx.getImageData(0, 0, width, height).data;
      const points: { x: number; y: number }[] = [];
      for (let y = 0; y < height; y += PARTICLE_GRID_PX) {
        for (let x = 0; x < width; x += PARTICLE_GRID_PX) {
          const alpha = data[(y * width + x) * 4 + 3] ?? 0;
          if (alpha > 128) {
            points.push({ x, y });
          }
        }
      }
      cacheRef.current = {
        text,
        points,
        origins: points.map((_, i) => ({ x: seededRand(i, 11) * width, y: seededRand(i, 12) * height })),
        delays: points.map((_, i) => seededRand(i, 13) * 0.5),
      };
    }

    const { points, origins, delays } = cacheRef.current;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    points.forEach((p, i) => {
      const delay = delays[i] ?? 0;
      const origin = origins[i] ?? p;
      const localT = easeOutCubic((progress - delay) / (1 - delay || 1));
      const x = origin.x + (p.x - origin.x) * localT;
      const y = origin.y + (p.y - origin.y) * localT;
      ctx.globalAlpha = Math.max(0, Math.min(1, 0.3 + 0.7 * localT));
      ctx.beginPath();
      ctx.arc(x, y, 2.4, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }, [text, progress]);

  return (
    <canvas
      ref={canvasRef}
      width={PARTICLE_CANVAS_WIDTH}
      height={PARTICLE_CANVAS_HEIGHT}
      {...stylex.props(styles.canvasStage)}
    />
  );
}
