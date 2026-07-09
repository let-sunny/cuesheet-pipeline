import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

/** Lists all git-tracked files under `repoRoot`, as POSIX-style paths relative to it. */
export function listTrackedFiles(repoRoot) {
  const out = execFileSync("git", ["ls-files"], { cwd: repoRoot, encoding: "utf8" });
  return out.split("\n").filter(Boolean);
}

/**
 * Reads a tracked file (given as a path relative to `repoRoot`) as UTF-8 text.
 * Returns null if the file looks binary (contains a NUL byte) so checks can skip it safely.
 */
export function readTrackedFile(repoRoot, relPath) {
  const buf = readFileSync(path.join(repoRoot, relPath));
  if (buf.includes(0)) return null;
  return buf.toString("utf8");
}

/** Reads every entry from `listTrackedFiles` into `{ path, content }` pairs. */
export function readTrackedFiles(repoRoot, relPaths) {
  return relPaths.map((relPath) => ({ path: relPath, content: readTrackedFile(repoRoot, relPath) }));
}
