// Side-effect CSS imports (the Pretendard @font-face bundle, imported in index.tsx so the Remotion
// render's Chrome loads the title font). tsc doesn't understand `.css` imports on its own; this
// ambient declaration lets it type-check them as side-effect-only. The Remotion bundler (webpack)
// is what actually processes the CSS + woff2 at bundle time.
declare module "*.css";
