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
 * Live preview of a cut's title card (PRD backlog #2) - approximates, in continuous CSS/SVG time,
 * the same 4 Remotion presets the render pipeline captures frame-by-frame at render time (fade/
 * wordStagger/typing/highlight - see packages/render/src/remotion/ and
 * docs/research/title-render-spike.md for the ASS/hand-rolled-HTML approaches these replaced).
 * This is the first full-anatomy component in the repo (folder + co-located .styles.ts + co-located
 * test + index.ts - see CLAUDE.md "component layering").
 */
export function TitleOverlay({ title, localTimeS }: TitleOverlayProps) {
  if (!title || !isTitleVisible(localTimeS, title.durationS)) {
    return null;
  }
  const dim = title.backdrop?.dim ?? 0;
  const dimOpacity = backdropOpacity(dim, title.durationS, localTimeS);

  return (
    <div {...stylex.props(styles.container)} data-testid="title-overlay">
      {dimOpacity > 0 ? <div {...stylex.props(styles.backdrop)} style={{ opacity: dimOpacity }} /> : null}
      <div {...stylex.props(styles.stage)}>
        {title.preset === "typing" ? (
          <TypingTitle text={title.text} durationS={title.durationS} localTimeS={localTimeS} />
        ) : title.preset === "wordStagger" ? (
          <WordStaggerTitle text={title.text} localTimeS={localTimeS} />
        ) : title.preset === "highlight" ? (
          <HighlightTitle text={title.text} localTimeS={localTimeS} />
        ) : (
          <FadeTitle text={title.text} durationS={title.durationS} localTimeS={localTimeS} />
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
 * Number of characters revealed so far - matches the typing preset's render-time string-slicing
 * reveal (packages/render/src/remotion/TypewriterTitle.tsx), just evaluated continuously here
 * instead of in fixed per-frame steps.
 */
export function typingRevealedCount(textLength: number, _durationS: number, localTimeS: number): number {
  if (textLength <= 0 || localTimeS < 0) {
    return 0;
  }
  // A FIXED, fast reveal pace that matches the render (TypewriterTitle types one char every
  // CHAR_FRAMES=2 frames at project fps ~= SEC_PER_CHAR below), then HOLDS the full text. Earlier
  // this spread the whole text across the entire duration, so a mid-playhead scrub only ever showed
  // a partial, stuck-looking string (user report: "it cuts off at 'titl'"). Typing must complete
  // early and hold, not creep to the last frame.
  return Math.min(textLength, Math.floor(localTimeS / SEC_PER_CHAR));
}

/** Seconds per revealed character - mirrors the render's CHAR_FRAMES=2 at ~30fps (a calm ~15 cps). */
const SEC_PER_CHAR = 2 / 30;

/** Ease-out cubic, the same curve every preset below (and their Remotion counterparts) uses for entrances. */
function easeOutCubic(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - c, 3);
}

interface TypingTitleProps {
  text: string;
  durationS: number;
  localTimeS: number;
}

/**
 * Mirrors packages/render/src/remotion/TypewriterTitle.tsx: string slicing (never per-character
 * opacity), plus a blinking block cursor while text remains to reveal.
 */
function TypingTitle({ text, durationS, localTimeS }: TypingTitleProps) {
  const chars = Array.from(text);
  const revealed = typingRevealedCount(chars.length, durationS, localTimeS);
  const shown = chars.slice(0, revealed).join("");
  const cursorVisible = revealed < chars.length;
  const cursorOn = Math.floor(localTimeS * 2) % 2 === 0;
  return (
    <span {...stylex.props(styles.typingText)} style={{ fontSize: "8cqw" }}>
      {shown}
      <span
        style={{
          display: "inline-block",
          width: "0.08em",
          height: "1.05em",
          marginLeft: "0.06em",
          backgroundColor: "currentcolor",
          verticalAlign: "text-bottom",
          opacity: cursorVisible && cursorOn ? 1 : 0,
        }}
      />
    </span>
  );
}

interface FadeTitleProps {
  text: string;
  durationS: number;
  localTimeS: number;
}

/** Mirrors packages/render/src/remotion/FadeTitle.tsx: scale+opacity entrance, fade-out near the end. */
function FadeTitle({ text, durationS, localTimeS }: FadeTitleProps) {
  const enter = easeOutCubic(localTimeS / ENTER_S);
  const scale = 0.96 + 0.04 * enter;
  const exitStart = Math.max(0, durationS - EXIT_S);
  const exitOpacity = localTimeS < exitStart ? 1 : Math.max(0, (durationS - localTimeS) / EXIT_S);
  return (
    <span
      {...stylex.props(styles.typingText)}
      style={{ fontSize: "8cqw", transform: `scale(${scale})`, opacity: enter * exitOpacity }}
    >
      {text}
    </span>
  );
}

interface WordStaggerTitleProps {
  text: string;
  localTimeS: number;
}

/** Mirrors packages/render/src/remotion/WordStaggerTitle.tsx: each word eases in with a per-word delay. */
function WordStaggerTitle({ text, localTimeS }: WordStaggerTitleProps) {
  const words = text.split(" ");
  return (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "0 0.4em" }}>
      {words.map((word, i) => {
        const p = easeOutCubic((localTimeS - i * STAGGER_S) / WORD_ENTER_S);
        const translateY = 14 * (1 - p);
        return (
          <span
            key={i}
            {...stylex.props(styles.typingText)}
            style={{ fontSize: "8cqw", opacity: p, transform: `translateY(${translateY}px)` }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
}

interface HighlightTitleProps {
  text: string;
  localTimeS: number;
}

/** Mirrors packages/render/src/remotion/HighlightTitle.tsx: a pastel marker sweeps in behind the last word. */
function HighlightTitle({ text, localTimeS }: HighlightTitleProps) {
  const words = text.split(" ");
  const keyword = words[words.length - 1] ?? text;
  const lead = words.slice(0, -1).join(" ");
  const markerProgress = easeOutCubic(localTimeS / ENTER_S);
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: "0.3em" }}>
      {lead ? (
        <span {...stylex.props(styles.typingText)} style={{ fontSize: "8cqw" }}>
          {lead}
        </span>
      ) : null}
      <span style={{ position: "relative", display: "inline-block" }}>
        <span
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: "0.08em",
            height: "0.35em",
            backgroundColor: "#A7C7E7",
            transform: `scaleX(${markerProgress})`,
            transformOrigin: "left",
          }}
        />
        <span {...stylex.props(styles.typingText)} style={{ position: "relative", fontSize: "8cqw" }}>
          {keyword}
        </span>
      </span>
    </div>
  );
}

/** Entrance/exit duration (seconds) shared by the fade/highlight previews. */
const ENTER_S = 0.4;
const EXIT_S = 0.4;
/** Word-stagger preview timing (seconds). */
const STAGGER_S = 0.15;
const WORD_ENTER_S = 0.3;
