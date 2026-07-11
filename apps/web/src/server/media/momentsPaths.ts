import { dirname, resolve } from "node:path";
import { repoRoot } from "../shared.js";

// Moment palette: storage location for the rough classification data and thumbnail frames.
const draftsRoot = resolve(repoRoot, "media/drafts");

export function momentsPath(): string {
  // Defaults to the currently active dataset (dotmix_v4) — when starting the server with a
  // different dataset, set MOMENTS_PATH explicitly.
  return process.env.MOMENTS_PATH ?? resolve(draftsRoot, "dotmix_v4/moments.json");
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
