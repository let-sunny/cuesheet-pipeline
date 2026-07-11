/** Shared type/size for every title-card preset (cozy serif look, PRD backlog #2's mood). */
export const TITLE_FONT_FAMILY = "Georgia, serif";
export const TITLE_FONT_SIZE_PX = 72;

/**
 * Fixed title-card text color (no schema field for this yet - every preset renders in this one
 * cozy, warm tone). Lives here (rather than in title.ts, which is Node-only) so it's importable
 * from the browser-safe `@cuesheet/render/remotion` subpath too - both the Node render pipeline
 * (title.ts's renderTitleFrames) and the web preview (TitleOverlay, via @remotion/player) read this
 * single constant, so there's no hand-synced duplicate left to drift.
 */
export const TITLE_TEXT_COLOR = "#3a3128";
