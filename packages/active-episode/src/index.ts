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

/** Inputs for {@link resolveDomainDir}: the repo root and the environment to read from. */
export interface ResolveDomainDirInput {
  /** Absolute path to the repo root; a relative stored/env path is resolved against this. */
  repoRoot: string;
  /** The environment to read DOMAIN_DIR from (injected, not read from process.env directly). */
  env: NodeJS.ProcessEnv;
}

/**
 * Resolves which domain bundle directory is "active", with precedence:
 * explicit `DOMAIN_DIR` env (non-empty) > `.active-domain` file > `domains/knitting` default.
 * Mirrors {@link resolveCuesheetPath} so the launcher, web server, and CLI all agree on which
 * domain a run uses. Env wins deliberately (lets a caller pin a hermetic domain regardless of the
 * on-disk `.active-domain`).
 *
 * A relative result (from either the env var or the file) is resolved against `repoRoot`; an
 * absolute result is returned as-is.
 */
export function resolveDomainDir({ repoRoot, env }: ResolveDomainDirInput): string {
  const fromEnv = env.DOMAIN_DIR;
  if (fromEnv !== undefined && fromEnv.trim() !== "") {
    return resolveAgainstRoot(repoRoot, fromEnv);
  }

  const fromFile = readActiveDomain(repoRoot);
  if (fromFile !== null) {
    return resolveAgainstRoot(repoRoot, fromFile);
  }

  return resolveAgainstRoot(repoRoot, DEFAULT_DOMAIN_DIR);
}

/**
 * Reads the `.active-domain` file's stored domain dir (trimmed), or null if the file is missing,
 * empty, or whitespace-only.
 */
export function readActiveDomain(repoRoot: string): string | null {
  const path = resolve(repoRoot, ACTIVE_DOMAIN_FILENAME);
  if (!existsSync(path)) return null;
  const contents = readFileSync(path, "utf-8").trim();
  return contents === "" ? null : contents;
}

/** Writes `domainDir` as the active domain (single line, newline-terminated). */
export function writeActiveDomain(repoRoot: string, domainDir: string): void {
  const path = resolve(repoRoot, ACTIVE_DOMAIN_FILENAME);
  writeFileSync(path, `${domainDir}\n`, "utf-8");
}

/** Resolves `value` against `repoRoot` unless it's already absolute. */
function resolveAgainstRoot(repoRoot: string, value: string): string {
  return isAbsolute(value) ? value : resolve(repoRoot, value);
}

/** Filename (relative to the repo root) of the file tracking the active episode's cuesheet path. */
export const ACTIVE_EPISODE_FILENAME = ".active-episode";

/** Filename (relative to the repo root) of the file tracking the active domain bundle dir. */
export const ACTIVE_DOMAIN_FILENAME = ".active-domain";

/** Default domain bundle when neither `DOMAIN_DIR` nor `.active-domain` selects one. */
export const DEFAULT_DOMAIN_DIR = "domains/knitting";
