/**
 * Deterministic, frame-steppable HTML/JS/SVG/canvas animations for the three title presets that
 * can't be expressed in ASS/libass (gooey, melt, particle - see docs/research/title-render-spike.md).
 * Each returned HTML document follows the spike's capture contract exactly:
 *   1. Renders its first frame synchronously on load.
 *   2. Exposes `window.seekAnimation(frameIndex)` - deterministically sets the DOM/canvas/SVG
 *      state for exactly that frame (no requestAnimationFrame, no wall-clock timing).
 *   3. Exposes `window.FRAME_COUNT`.
 * A seeded pseudo-random function (sine-hash) replaces Math.random() so the same
 * (text, preset, duration) always produces byte-identical frames - required for content-addressed
 * caching (title.ts's titleCacheKey) to be sound.
 */

export interface TitleAnimationParams {
  text: string;
  width: number;
  height: number;
  frameCount: number;
}

/** Escapes text for embedding inside a single-quoted JS string literal in the generated HTML. */
function jsStringLiteral(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n");
}

/** Shared seeded-random + easing helpers injected into every capture page. */
const SHARED_SCRIPT = `
function seededRand(i, salt) {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}
function easeOutCubic(t) {
  const c = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - c, 3);
}
function easeInCubic(t) {
  const c = Math.min(1, Math.max(0, t));
  return c * c * c;
}
`;

/**
 * Gooey: each character is an SVG circle under an feGaussianBlur -> feColorMatrix -> feComposite
 * "goo" filter chain. Circles ease from a scattered origin toward their final letter-spaced
 * position, with per-character stagger so they converge one after another (entrance-only look).
 */
export function gooeyAnimationHtml(params: TitleAnimationParams): string {
  const { text, width, height, frameCount } = params;
  const chars = Array.from(text);
  return `<!doctype html>
<html><head><meta charset="utf-8">
<style>
  html,body { margin:0; padding:0; background:transparent; overflow:hidden; }
  svg { display:block; }
</style>
</head>
<body>
<svg id="stage" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <filter id="goo">
      <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur" />
      <feColorMatrix in="blur" mode="matrix"
        values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10" result="goo" />
      <feComposite in="SourceGraphic" in2="goo" operator="atop" />
    </filter>
  </defs>
  <g id="blobs" filter="url(#goo)" fill="#ffffff"></g>
</svg>
<script>
${SHARED_SCRIPT}
window.FRAME_COUNT = ${frameCount};
const chars = ${JSON.stringify(chars)};
const cx0 = ${width} / 2;
const cy0 = ${height} / 2;
const charSpacing = Math.min(${width} * 0.8 / Math.max(1, chars.length), 90);
const startX = cx0 - (chars.length - 1) * charSpacing / 2;
const g = document.getElementById("blobs");
const circles = chars.map((ch, i) => {
  const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  c.setAttribute("r", "34");
  g.appendChild(c);
  return c;
});
const origins = chars.map((_, i) => ({
  x: startX + i * charSpacing + (seededRand(i, 1) - 0.5) * 400,
  y: cy0 + (seededRand(i, 2) - 0.5) * 400,
}));
const targets = chars.map((_, i) => ({ x: startX + i * charSpacing, y: cy0 }));
const staggerPerChar = 0.5 / Math.max(1, chars.length);

window.seekAnimation = function (frame) {
  const t = frame / Math.max(1, window.FRAME_COUNT - 1);
  chars.forEach((_, i) => {
    const localT = easeOutCubic((t - i * staggerPerChar) / (1 - i * staggerPerChar || 1));
    const x = origins[i].x + (targets[i].x - origins[i].x) * localT;
    const y = origins[i].y + (targets[i].y - origins[i].y) * localT;
    circles[i].setAttribute("cx", String(x));
    circles[i].setAttribute("cy", String(y));
  });
};
window.seekAnimation(0);
</script>
</body></html>`;
}

/**
 * Melt: the Gooey exit variant (PRD backlog #2) - the text converges in quickly (first ~25% of
 * the duration), holds, then the same goo-filtered blobs drip downward and fade out over the
 * final portion (a "melting" exit instead of Gooey's pure entrance).
 */
export function meltAnimationHtml(params: TitleAnimationParams): string {
  const { text, width, height, frameCount } = params;
  const chars = Array.from(text);
  return `<!doctype html>
<html><head><meta charset="utf-8">
<style>
  html,body { margin:0; padding:0; background:transparent; overflow:hidden; }
  svg { display:block; }
</style>
</head>
<body>
<svg id="stage" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <filter id="goo">
      <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur" />
      <feColorMatrix in="blur" mode="matrix"
        values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10" result="goo" />
      <feComposite in="SourceGraphic" in2="goo" operator="atop" />
    </filter>
  </defs>
  <g id="blobs" filter="url(#goo)" fill="#ffffff"></g>
</svg>
<script>
${SHARED_SCRIPT}
window.FRAME_COUNT = ${frameCount};
const chars = ${JSON.stringify(chars)};
const cx0 = ${width} / 2;
const cy0 = ${height} / 2;
const charSpacing = Math.min(${width} * 0.8 / Math.max(1, chars.length), 90);
const startX = cx0 - (chars.length - 1) * charSpacing / 2;
const g = document.getElementById("blobs");
const circles = chars.map(() => {
  const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  c.setAttribute("r", "34");
  g.appendChild(c);
  return c;
});
const entryOrigins = chars.map((_, i) => ({
  x: startX + i * charSpacing + (seededRand(i, 3) - 0.5) * 300,
  y: cy0 - 200 - seededRand(i, 4) * 200,
}));
const settled = chars.map((_, i) => ({ x: startX + i * charSpacing, y: cy0 }));
const dripTargets = chars.map((_, i) => ({
  x: settled[i].x + (seededRand(i, 5) - 0.5) * 40,
  y: cy0 + 260 + seededRand(i, 6) * 120,
}));

// Timeline (fractions of the full duration): 0-0.25 entrance, 0.25-0.55 hold, 0.55-1 melt/drip+fade.
const ENTER_END = 0.25;
const HOLD_END = 0.55;
const enterStagger = 0.15 / Math.max(1, chars.length);
const meltStagger = 0.3 / Math.max(1, chars.length);

window.seekAnimation = function (frame) {
  const t = frame / Math.max(1, window.FRAME_COUNT - 1);
  chars.forEach((_, i) => {
    let x, y, r = 34, opacity = 1;
    if (t < ENTER_END) {
      const local = easeOutCubic((t / ENTER_END - i * enterStagger) / (1 - i * enterStagger || 1));
      x = entryOrigins[i].x + (settled[i].x - entryOrigins[i].x) * local;
      y = entryOrigins[i].y + (settled[i].y - entryOrigins[i].y) * local;
    } else if (t < HOLD_END) {
      x = settled[i].x;
      y = settled[i].y;
    } else {
      const meltT = (t - HOLD_END) / (1 - HOLD_END);
      const local = easeInCubic((meltT - i * meltStagger) / (1 - i * meltStagger || 1));
      x = settled[i].x + (dripTargets[i].x - settled[i].x) * local;
      y = settled[i].y + (dripTargets[i].y - settled[i].y) * local;
      r = 34 * (1 - 0.4 * local);
      opacity = 1 - local;
    }
    circles[i].setAttribute("cx", String(x));
    circles[i].setAttribute("cy", String(y));
    circles[i].setAttribute("r", String(r));
    circles[i].setAttribute("opacity", String(Math.max(0, opacity)));
  });
};
window.seekAnimation(0);
</script>
</body></html>`;
}

/**
 * Particle: the target text is rendered once to an offscreen canvas, its pixel-alpha sampled on a
 * grid to build a point cloud shaped like the text; one particle per point starts at a randomized
 * (seeded) scattered origin and eases toward its target with a per-particle delay.
 */
export function particleAnimationHtml(params: TitleAnimationParams): string {
  const { text, width, height, frameCount } = params;
  return `<!doctype html>
<html><head><meta charset="utf-8">
<style>
  html,body { margin:0; padding:0; background:transparent; overflow:hidden; }
  canvas { display:block; }
</style>
</head>
<body>
<canvas id="stage" width="${width}" height="${height}"></canvas>
<script>
${SHARED_SCRIPT}
window.FRAME_COUNT = ${frameCount};
const text = '${jsStringLiteral(text)}';
const canvas = document.getElementById("stage");
const ctx = canvas.getContext("2d");

// Sample the text's shape into a point cloud on an offscreen canvas.
const off = document.createElement("canvas");
off.width = ${width};
off.height = ${height};
const octx = off.getContext("2d");
octx.fillStyle = "#ffffff";
octx.font = "bold 100px sans-serif";
octx.textAlign = "center";
octx.textBaseline = "middle";
octx.fillText(text, ${width} / 2, ${height} / 2);
const imgData = octx.getImageData(0, 0, ${width}, ${height}).data;
const GRID = 6;
const points = [];
for (let y = 0; y < ${height}; y += GRID) {
  for (let x = 0; x < ${width}; x += GRID) {
    const alpha = imgData[(y * ${width} + x) * 4 + 3];
    if (alpha > 128) points.push({ x, y });
  }
}
const origins = points.map((_, i) => ({
  x: seededRand(i, 11) * ${width},
  y: seededRand(i, 12) * ${height},
}));
const delays = points.map((_, i) => seededRand(i, 13) * 0.5);

window.seekAnimation = function (frame) {
  const t = frame / Math.max(1, window.FRAME_COUNT - 1);
  ctx.clearRect(0, 0, ${width}, ${height});
  ctx.fillStyle = "#ffffff";
  points.forEach((p, i) => {
    const localT = easeOutCubic((t - delays[i]) / (1 - delays[i] || 1));
    const x = origins[i].x + (p.x - origins[i].x) * localT;
    const y = origins[i].y + (p.y - origins[i].y) * localT;
    ctx.globalAlpha = Math.max(0, Math.min(1, 0.3 + 0.7 * localT));
    ctx.beginPath();
    ctx.arc(x, y, 2.4, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
};
window.seekAnimation(0);
</script>
</body></html>`;
}
