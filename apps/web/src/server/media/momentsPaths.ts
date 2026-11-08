import { existsSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { cuesheetPath, repoRoot } from "../shared.js";

// Moment palette: storage location for the rough classification data and thumbnail frames.
const draftsRoot = resolve(repoRoot, "media/drafts");

/** Fallback dataset used only when the active episode has no matching drafts folder yet. */
const LEGACY_FALLBACK_MOMENTS_PATH = resolve(draftsRoot, "dotmix_v4/moments.json");

/**
 * Resolves moments.json the same way the active episode is resolved: explicit `MOMENTS_PATH` env
 * > the active episode's own drafts folder (`media/drafts/<episode slug>/moments.json`, slug
 * derived from the active cuesheet's filename) > the legacy dotmix_v4 fallback, for episodes that
 * predate this derivation or whose drafts folder was never created. Re-reads `cuesheetPath()` on
 * every call (not cached at module load), so it follows `.active-episode` changes live.
 */
export function momentsPath(): string {
  if (process.env.MOMENTS_PATH) return process.env.MOMENTS_PATH;
  const slug = basename(cuesheetPath()).replace(/\.cuesheet\.json$/, "");
  const derived = resolve(draftsRoot, slug, "moments.json");
  return existsSync(derived) ? derived : LEGACY_FALLBACK_MOMENTS_PATH;
}

/**
 * Thumbnail frames directory for the moment palette - always the "frames" folder living alongside
 * momentsPath()'s moments.json (same dataset), not a fixed path. This used to be hardcoded to the
 * legacy flat `media/drafts/frames` directory while momentsPath() already defaulted to the
 * dataset-specific `media/drafts/dotmix_v4/moments.json` - most clip folders happened to have
 * identical names in both places, masking the mismatch, but any clip whose frames only exist under
 * the dataset folder (e.g. ones added/regenerated after the v4 dataset was created) 404'd on every
 * card. Deriving this from momentsPath() instead keeps the two in sync automatically, including
 * when MOMENTS_PATH is overridden to a different dataset.
 */
export function framesRoot(): string {
  return resolve(dirname(momentsPath()), "frames");
}
