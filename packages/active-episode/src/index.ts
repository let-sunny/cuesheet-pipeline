import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

/** Inputs for {@link resolveCuesheetPath}: the repo root and the environment to read from. */
export interface ResolveCuesheetPathInput {
  /** Absolute path to the repo root; a relative stored/env path is resolved against this. */
  repoRoot: string;
  /** The environment to read CUESHEET_PATH from (injected, not read from process.env directly). */
  env: NodeJS.ProcessEnv;
}

/**
 * Resolves which cuesheet file is "active", with precedence:
 * explicit `CUESHEET_PATH` env (non-empty) > `.active-episode` file > `./project.cuesheet.json`
 * default. Env wins deliberately — it lets callers (e.g. e2e tests) pin a hermetic path
 * regardless of whatever `.active-episode` happens to hold on a developer's machine.
 *
 * A relative result (from either the env var or the file) is resolved against `repoRoot`; an
 * absolute result is returned as-is.
 */
export function resolveCuesheetPath({ repoRoot, env }: ResolveCuesheetPathInput): string {
  const fromEnv = env.CUESHEET_PATH;
  if (fromEnv !== undefined && fromEnv.trim() !== "") {
    return resolveAgainstRoot(repoRoot, fromEnv);
  }

  const fromFile = readActiveEpisode(repoRoot);
  if (fromFile !== null) {
    return resolveAgainstRoot(repoRoot, fromFile);
  }

  return resolveAgainstRoot(repoRoot, "./project.cuesheet.json");
}

/**
 * Reads the `.active-episode` file's stored cuesheet path (trimmed), or null if the file is
 * missing, empty, or whitespace-only.
 */
export function readActiveEpisode(repoRoot: string): string | null {
  const path = resolve(repoRoot, ACTIVE_EPISODE_FILENAME);
  if (!existsSync(path)) return null;
  const contents = readFileSync(path, "utf-8").trim();
  return contents === "" ? null : contents;
}

/** Writes `cuesheetPath` as the active episode (single line, newline-terminated). */
export function writeActiveEpisode(repoRoot: string, cuesheetPath: string): void {
  const path = resolve(repoRoot, ACTIVE_EPISODE_FILENAME);
  writeFileSync(path, `${cuesheetPath}\n`, "utf-8");
}

/** Resolves `value` against `repoRoot` unless it's already absolute. */
function resolveAgainstRoot(repoRoot: string, value: string): string {
  return isAbsolute(value) ? value : resolve(repoRoot, value);
}

/** Filename (relative to the repo root) of the file tracking the active episode's cuesheet path. */
export const ACTIVE_EPISODE_FILENAME = ".active-episode";
