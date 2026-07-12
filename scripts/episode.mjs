#!/usr/bin/env node
/**
 * pnpm episode <source-folder> [--scan-only] [--no-open] [--rescan] [--domain <dir>]
 *
 * Handles the "mechanical part" of starting an episode in one shot:
 *   1) validate the raw footage folder (existence/video files/report iCloud not-downloaded count)
 *   2) run cuesheet-draft scan -> media/drafts/<slug>/manifest.json
 *   3) ensure the web editor server is up (if already up, just note it) + open the browser
 *   4) print the next step: run /episode <source-folder> in Claude Code
 *
 * Vision judgment (writing moments.json)/assemble/subtitle writing are the job of
 * Claude Code (the /episode custom command). This script only handles the
 * mechanical work before and after that.
 */
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { spawnSync, spawn } from "node:child_process";
import { createConnection } from "node:net";
import { basename, extname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const WEB_PORT = 5173;
const VIDEO_EXTS = new Set([".mp4", ".mov", ".mkv", ".m4v", ".webm"]);

/**
 * Parses `--flag` (boolean) and `--key=value` (valued, e.g. `--domain=domains/cooking`) plus
 * positionals. Valued flags use the `=` form so no lookahead is needed and a value can't be
 * mistaken for the source-folder positional.
 */
function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (const a of argv) {
    if (a.startsWith("--")) {
      const body = a.slice(2);
      const eq = body.indexOf("=");
      if (eq === -1) {
        flags[body] = true;
      } else {
        flags[body.slice(0, eq)] = body.slice(eq + 1);
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

/** Converts a folder name into a filesystem/URL-safe slug (keeps Korean characters as-is). */
function slugify(name) {
  const slug = name
    .trim()
    .replace(/[^\p{L}\p{N}_-]+/gu, "_")
    .replace(/^_+|_+$/g, "");
  return slug || "episode";
}

function isPortOpen(port) {
  return new Promise((res) => {
    // Keep host as "localhost" - on this machine Vite's default binding sometimes
    // only listens on IPv6 ([::1]) (hardcoding "127.0.0.1" would make that
    // connection always fail), so let the OS resolver pick an address that
    // matches the actual binding.
    const socket = createConnection({ port, host: "localhost" });
    const done = (result) => {
      socket.destroy();
      res(result);
    };
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.setTimeout(500, () => done(false));
  });
}

async function waitForPort(port, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isPortOpen(port)) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

function ensureDraftBuilt() {
  const cliPath = resolve(repoRoot, "packages/draft/dist/cli.js");
  if (existsSync(cliPath)) {
    return cliPath;
  }
  console.log("cuesheet-draft isn't built yet, building it first...");
  const result = spawnSync("pnpm", ["--filter", "@cuesheet/draft", "build"], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    console.error("cuesheet-draft build failed");
    process.exit(result.status ?? 1);
  }
  return cliPath;
}

function ensureActiveEpisodeBuilt() {
  const distPath = resolve(repoRoot, "packages/active-episode/dist/index.js");
  if (existsSync(distPath)) {
    return distPath;
  }
  console.log("@cuesheet/active-episode isn't built yet, building it first...");
  const result = spawnSync("pnpm", ["--filter", "@cuesheet/active-episode", "build"], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    console.error("@cuesheet/active-episode build failed");
    process.exit(result.status ?? 1);
  }
  return distPath;
}

function openBrowser(url) {
  const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  spawn(opener, [url], { stdio: "ignore", detached: true }).unref();
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const srcArg = positional[0];
  if (!srcArg) {
    console.error("Usage: pnpm episode <source-folder> [--scan-only] [--no-open] [--rescan]");
    process.exit(1);
  }

  const srcDir = resolve(srcArg);
  if (!existsSync(srcDir) || !statSync(srcDir).isDirectory()) {
    console.error(`Folder not found: ${srcDir}`);
    process.exit(1);
  }

  const entries = readdirSync(srcDir);
  const videoFiles = entries.filter((f) => VIDEO_EXTS.has(extname(f).toLowerCase()));
  if (videoFiles.length === 0) {
    console.error(`No video files found: ${srcDir}`);
    process.exit(1);
  }

  const evictedCount = videoFiles.filter((f) => statSync(resolve(srcDir, f)).blocks === 0).length;
  console.log(
    `Source folder: ${srcDir} (${videoFiles.length} videos, ${evictedCount} not downloaded from iCloud)`,
  );

  const slug = slugify(basename(srcDir));
  const draftDir = resolve(repoRoot, "media/drafts", slug);
  const episodesDir = resolve(repoRoot, "episodes");
  const cuesheetPath = resolve(episodesDir, `${slug}.cuesheet.json`);
  mkdirSync(episodesDir, { recursive: true });

  // Record this as the active episode so the web editor and the MCP bridge both edit it
  // (they resolve the active cuesheet from .active-episode). Stored repo-relative.
  const relCuesheetPath = relative(repoRoot, cuesheetPath);
  const { writeActiveEpisode, writeActiveDomain, resolveDomainDir } = await import(
    pathToFileURL(ensureActiveEpisodeBuilt()).href
  );
  writeActiveEpisode(repoRoot, relCuesheetPath);
  console.log(`Active episode -> ${relCuesheetPath} (written to .active-episode)`);

  // Domain selection (issue #31): --domain=<dir> persists a new active domain; otherwise the
  // previously-active one (default domains/knitting) is kept. Assemble + the web editor both
  // resolve the active domain the same way (.active-domain / DOMAIN_DIR).
  if (typeof flags.domain === "string") {
    const domainDir = resolve(flags.domain);
    if (!existsSync(resolve(domainDir, "shot-types.json"))) {
      console.error(`Not a domain bundle (no shot-types.json): ${domainDir}`);
      process.exit(1);
    }
    writeActiveDomain(repoRoot, relative(repoRoot, domainDir));
  }
  console.log(`Active domain  -> ${relative(repoRoot, resolveDomainDir({ repoRoot, env: process.env }))}`);

  const manifestPath = resolve(draftDir, "manifest.json");
  if (existsSync(manifestPath) && !flags.rescan) {
    console.log(`Already scanned, skipping: ${manifestPath} (use --rescan to scan again)`);
  } else {
    const cliPath = ensureDraftBuilt();
    mkdirSync(draftDir, { recursive: true });
    console.log(`Starting scan -> ${draftDir}`);
    const result = spawnSync("node", [cliPath, "scan", srcDir, "--out", draftDir], {
      cwd: repoRoot,
      stdio: "inherit",
    });
    if (result.status !== 0) {
      console.error("Scan failed");
      process.exit(result.status ?? 1);
    }
  }

  if (flags["scan-only"]) {
    console.log(`\nNext step: run in Claude Code -> /episode ${srcArg}`);
    return;
  }

  if (await isPortOpen(WEB_PORT)) {
    console.log(
      `\nThe web editor is already running at http://localhost:${WEB_PORT} (leaving it as is).\n` +
        `If it's running for a different episode, restart it to pick up the new active episode:\n` +
        `  pnpm --filter @cuesheet/web dev`,
    );
  } else {
    console.log(`Starting the web editor... (active episode: ${relCuesheetPath})`);
    const child = spawn("pnpm", ["--filter", "@cuesheet/web", "dev"], {
      cwd: repoRoot,
      detached: true,
      stdio: "ignore",
    });
    child.unref();

    const up = await waitForPort(WEB_PORT, 15000);
    if (!up) {
      console.error(
        `Port ${WEB_PORT} did not come up within 15s - check the logs (run pnpm --filter @cuesheet/web dev directly).`,
      );
    }
  }

  if (!flags["no-open"]) {
    openBrowser(`http://localhost:${WEB_PORT}`);
  }

  console.log(`\nEditor: http://localhost:${WEB_PORT}`);
  console.log(`Next step: run in Claude Code -> /episode ${srcArg}`);
}

main();
