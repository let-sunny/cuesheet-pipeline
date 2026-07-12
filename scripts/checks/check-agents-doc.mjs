#!/usr/bin/env node
/**
 * check-agents-doc (issue #16): smoke-tests AGENTS.md by executing (not just reading) the
 * surfaces it documents, so a renamed flag/tool/endpoint/env var fails a check instead of
 * silently rotting the operator manual. Parsing strategy (see lib/agents-doc-matcher.mjs):
 * anchor purely on code-ish tokens - fenced-code-block invocations, `| \`tool\` |` table rows,
 * backtick-wrapped `METHOD /path` spans, backtick `CUESHEET_*` env var spans - never on
 * surrounding sentence text, so prose rewording never trips this check.
 *
 * Requires a prior build (`pnpm -r build`) for the CLI/bridge dist imports below - run as part
 * of `check:repo`, which always runs after Build in CI (same reason check-schema-examples.mjs
 * does).
 *
 * Deliberate exclusions (documented, not silently skipped):
 * - `pnpm episode` and the web dev server's HTTP endpoints are not executed (episode.mjs opens a
 *   real browser against a running dev server; the endpoints need that same dev server) - both
 *   are covered by a static source check only (flag/path presence), consistent with this issue's
 *   guidance that a static assertion is acceptable where running the dev server is out of scope.
 * - Bridge tool *behavior* (validate-only never writes, read-only mode, get_capabilities shape,
 *   etc.) is already covered end-to-end by packages/bridge/test/server.test.ts (issue #12) over a
 *   real in-memory MCP transport; duplicating that here would just re-test, not add drift
 *   coverage. This script instead calls the tool implementations directly (store.js, the same
 *   functions server.ts's tools are thin wrappers over) for the two behaviors AGENTS.md states in
 *   prose that aren't otherwise pinned: "validate_cuesheet never writes" and "get_schema returns
 *   draft 2020-12 JSON Schema" - and separately confirms the *names* registered in server.ts
 *   (a cheap static registry read, no MCP transport needed) match AGENTS.md's table exactly.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  extractBridgeToolNames,
  extractCommandFlags,
  extractEnvVarNames,
  extractHttpEndpoints,
  isFlagReferencedInSource,
} from "./lib/agents-doc-matcher.mjs";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const AGENTS_MD_PATH = join(repoRoot, "AGENTS.md");

const DRAFT_CLI_DIST = join(repoRoot, "packages/draft/dist/cli.js");
const RENDER_CLI_DIST = join(repoRoot, "packages/render/dist/index.js");
const BRIDGE_STORE_DIST = join(repoRoot, "packages/bridge/dist/store.js");
const DRAFT_CLI_SRC = join(repoRoot, "packages/draft/src/cli.ts");
const RENDER_INDEX_SRC = join(repoRoot, "packages/render/src/index.ts");
const EPISODE_MJS_SRC = join(repoRoot, "scripts/episode.mjs");
const BRIDGE_SERVER_SRC = join(repoRoot, "packages/bridge/src/server.ts");
const BRIDGE_INDEX_SRC = join(repoRoot, "packages/bridge/src/index.ts");
const ACTIVE_EPISODE_SRC = join(repoRoot, "packages/active-episode/src/index.ts");
const WEB_SERVER_SRC_DIR = join(repoRoot, "apps/web/src/server");

const violations = [];

await main();

async function main() {
  for (const distPath of [DRAFT_CLI_DIST, RENDER_CLI_DIST, BRIDGE_STORE_DIST]) {
    if (!existsSync(distPath)) {
      console.error(
        `check-agents-doc: could not find ${relative(distPath)} - build the workspace first (pnpm -r build).`,
      );
      process.exit(1);
    }
  }

  const agentsMd = readFileSync(AGENTS_MD_PATH, "utf-8");

  checkFlagsReferencedInSource(agentsMd);
  checkBridgeToolNames(agentsMd);
  checkHttpEndpoints(agentsMd);
  checkEnvVarsReferenced(agentsMd);
  runCliPipeline();
  await checkBridgeBehaviors();

  if (violations.length > 0) {
    console.error("check-agents-doc: AGENTS.md no longer matches the code it documents:");
    for (const v of violations) console.error(`  ${v}`);
    console.error(`\n${violations.length} violation(s).`);
    process.exit(1);
  }
  console.error("check-agents-doc: AGENTS.md's documented surfaces all check out.");
}

/**
 * Static safety net: every flag AGENTS.md documents for each CLI must still be read somewhere in
 * that CLI's source. Catches a rename/removal even for flags the execution checks below don't
 * specifically exercise by name.
 */
function checkFlagsReferencedInSource(agentsMd) {
  const targets = [
    { token: "cuesheet-draft scan", label: "cuesheet-draft scan", src: readFileSync(DRAFT_CLI_SRC, "utf-8") },
    {
      token: "cuesheet-draft assemble",
      label: "cuesheet-draft assemble",
      src: readFileSync(DRAFT_CLI_SRC, "utf-8"),
    },
    { token: "cuesheet-render", label: "cuesheet-render", src: readFileSync(RENDER_INDEX_SRC, "utf-8") },
    { token: "pnpm episode", label: "pnpm episode", src: readFileSync(EPISODE_MJS_SRC, "utf-8") },
  ];

  for (const { token, label, src } of targets) {
    const flags = extractCommandFlags(agentsMd, token);
    if (flags.size === 0) {
      violations.push(`AGENTS.md documents no --flags for "${label}" - parsing may have drifted.`);
      continue;
    }
    for (const flag of flags) {
      if (!isFlagReferencedInSource(flag, src)) {
        violations.push(
          `AGENTS.md documents ${flag} for "${label}" but its source no longer reads that flag.`,
        );
      }
    }
  }
}

/** The bridge's registered tool names (server.ts's registerTool call sites) must match AGENTS.md's table exactly. */
function checkBridgeToolNames(agentsMd) {
  const documented = new Set(extractBridgeToolNames(agentsMd));
  const serverSrc = readFileSync(BRIDGE_SERVER_SRC, "utf-8");
  const registered = new Set(
    [...serverSrc.matchAll(/server\.registerTool\(\s*"([a-z_]+)"/g)].map((m) => m[1]),
  );

  for (const name of documented) {
    if (!registered.has(name)) {
      violations.push(`AGENTS.md's bridge table documents \`${name}\`, but server.ts registers no such tool.`);
    }
  }
  for (const name of registered) {
    if (!documented.has(name)) {
      violations.push(`server.ts registers tool \`${name}\`, but AGENTS.md's bridge table omits it.`);
    }
  }
}

/**
 * Every documented `METHOD /path` must exist somewhere under apps/web/src/server/ (routes.ts and
 * media.ts used to hold every handler directly; both are now thin composers over per-route-group
 * modules under routes/ and media/ - concatenating every .ts file in the tree keeps this check
 * agnostic to which specific file a given mount call lives in), checked with the same method guard.
 */
function checkHttpEndpoints(agentsMd) {
  const serverSrc = readServerSrcTree(WEB_SERVER_SRC_DIR);
  for (const endpoint of extractHttpEndpoints(agentsMd)) {
    const [method, path] = endpoint.split(" ");
    const mountIndex = serverSrc.indexOf(`middlewares.use("${path}"`);
    if (mountIndex === -1) {
      violations.push(
        `AGENTS.md documents ${endpoint}, but no file under apps/web/src/server/ mounts middleware at "${path}".`,
      );
      continue;
    }
    const window = serverSrc.slice(mountIndex, mountIndex + 400);
    if (!window.includes(`req.method !== "${method}"`)) {
      violations.push(
        `AGENTS.md documents ${endpoint}, but the "${path}" handler doesn't guard on method === ${method}.`,
      );
    }
  }
}

/** Recursively concatenates every .ts file's source under dir (used to search for a mount call regardless of which sibling module it lives in). */
function readServerSrcTree(dir) {
  let combined = "";
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      combined += readServerSrcTree(path);
    } else if (name.endsWith(".ts")) {
      combined += `\n${readFileSync(path, "utf-8")}`;
    }
  }
  return combined;
}

/**
 * Every documented CUESHEET_* env var must actually be read (process.env.NAME) in the bridge's
 * env-reading surface: bridge/src/index.ts, plus @cuesheet/active-episode's resolver, which the
 * bridge delegates CUESHEET_PATH resolution to (active-episode > .active-episode file > default).
 */
function checkEnvVarsReferenced(agentsMd) {
  const src = [BRIDGE_INDEX_SRC, ACTIVE_EPISODE_SRC].map((p) => readFileSync(p, "utf-8")).join("\n");
  for (const name of extractEnvVarNames(agentsMd)) {
    if (!src.includes(`process.env.${name}`) && !src.includes(`env.${name}`)) {
      violations.push(`AGENTS.md documents env var ${name}, but neither bridge/src/index.ts nor active-episode reads it.`);
    }
  }
}

/**
 * Executes the documented scan -> assemble -> render pipeline against one tiny synthetic clip,
 * proving --json envelopes, --fps/--width/--height, --config, and --boundary-pad actually change
 * behavior (not just that the flag string appears somewhere) - and that scan's documented output
 * path convention (`<work-folder>/manifest.json`, `<work-folder>/frames/<clip-name>/*.jpg`) holds.
 */
function runCliPipeline() {
  const workDir = mkdtempSync(join(tmpdir(), "check-agents-doc-"));
  try {
    runScanCheck(workDir);
    runAssembleChecks(workDir);
    runRenderCheck(workDir);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

function runScanCheck(workDir) {
  const srcDir = join(workDir, "src");
  const scanOutDir = join(workDir, "scan-out");
  execFileSync("mkdir", ["-p", srcDir]);
  execFileSync(
    "ffmpeg",
    ["-y", "-f", "lavfi", "-i", "testsrc=duration=1:size=64x36:rate=10", join(srcDir, "clip.mp4")],
    { stdio: "ignore" },
  );

  const result = spawnSync("node", [DRAFT_CLI_DIST, "scan", srcDir, "--out", scanOutDir, "--json"], {
    encoding: "utf-8",
  });
  if (result.status !== 0) {
    violations.push(`cuesheet-draft scan --json failed: ${result.stderr}`);
    return;
  }
  const parsed = JSON.parse(result.stdout.trim().split("\n").filter(Boolean)[0] ?? "{}");
  if (Object.keys(parsed).sort().join(",") !== ["clips", "evicted", "frames", "manifestPath"].sort().join(",")) {
    violations.push(`cuesheet-draft scan --json envelope keys drifted: got ${JSON.stringify(Object.keys(parsed))}`);
  }
  const manifestPath = join(scanOutDir, "manifest.json");
  if (!existsSync(manifestPath)) {
    violations.push(
      `AGENTS.md documents scan writing "<work-folder>/manifest.json", but ${relative(manifestPath)} was not created.`,
    );
  }
  const framesDir = join(scanOutDir, "frames", "clip");
  if (!existsSync(framesDir)) {
    violations.push(
      `AGENTS.md documents scan writing "<work-folder>/frames/<clip-name>/*.jpg", but ${relative(framesDir)} was not created.`,
    );
  }
}

function runAssembleChecks(workDir) {
  const manifestPath = join(workDir, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify({ clips: [{ name: "a.mp4", durS: 999, interval: 5, frames: [] }], evicted: [] }));

  // Single-moment fixture (quality 4, always above the default threshold of 3) for the flags
  // that only need >=1 segment to survive: --fps/--width/--height and --boundary-pad.
  const singleMomentPath = join(workDir, "moments-single.json");
  writeFileSync(
    singleMomentPath,
    JSON.stringify([
      {
        clip: "a.mp4",
        clipSummary: "s",
        moments: [{ inS: 10, outS: 12, shotType: "object", memo: "m", quality: 4 }],
        monotonousRanges: [],
      },
    ]),
  );
  const baseArgs = (momentsPath) => [
    "assemble",
    "--manifest",
    manifestPath,
    "--moments",
    momentsPath,
    "--clip-dir",
    "/src",
    "--project-name",
    "t",
    "--json",
  ];

  // --fps/--width/--height: assert the exact overridden project dimensions land in the output,
  // proving these flags are read (not silently defaulted).
  const dimsOut = join(workDir, "dims.cuesheet.json");
  runAssemble([...baseArgs(singleMomentPath), "--out", dimsOut, "--fps", "24", "--width", "640", "--height", "360"]);
  const dimsCue = readJson(dimsOut);
  if (dimsCue?.project?.fps !== 24 || dimsCue?.project?.width !== 640 || dimsCue?.project?.height !== 360) {
    violations.push(
      `--fps/--width/--height didn't reach the output cuesheet's project (got ${JSON.stringify(dimsCue?.project)}).`,
    );
  }

  // --boundary-pad: 0 must reproduce the moment's raw in/out exactly; the documented default
  // (no flag -> config.boundaryPadS, 0.4s) must pad outward from it.
  const noPadOut = join(workDir, "nopad.cuesheet.json");
  runAssemble([...baseArgs(singleMomentPath), "--out", noPadOut, "--boundary-pad", "0"]);
  const noPadSeg = readJson(noPadOut)?.segments?.[0];
  if (noPadSeg?.in !== 10 || noPadSeg?.out !== 12) {
    violations.push(`--boundary-pad 0 didn't reproduce the raw moment bounds: got ${JSON.stringify(noPadSeg)}.`);
  }

  const defaultPadOut = join(workDir, "defaultpad.cuesheet.json");
  runAssemble([...baseArgs(singleMomentPath), "--out", defaultPadOut]);
  const defaultPadSeg = readJson(defaultPadOut)?.segments?.[0];
  if (!(defaultPadSeg?.in < 10) || !(defaultPadSeg?.out > 12)) {
    violations.push(
      `Default boundary padding (no --boundary-pad flag) didn't pad outward from the moment bounds: got ${JSON.stringify(defaultPadSeg)}.`,
    );
  }

  // --config: a qualityThreshold override must change which moments clear the bar. Two moments
  // (quality 4 and 5, far enough apart to never trigger cut-rhythm convergence/clamping) so a
  // threshold of 5 filters exactly one out while always leaving >=1 segment (required by the
  // cuesheet schema) either way.
  const twoMomentsPath = join(workDir, "moments-two.json");
  writeFileSync(
    twoMomentsPath,
    JSON.stringify([
      {
        clip: "a.mp4",
        clipSummary: "s",
        moments: [
          { inS: 10, outS: 12, shotType: "object", memo: "m1", quality: 4 },
          { inS: 100, outS: 102, shotType: "object", memo: "m2", quality: 5 },
        ],
        monotonousRanges: [],
      },
    ]),
  );
  const defaultConfigOut = join(workDir, "default-config.cuesheet.json");
  const defaultConfigResult = runAssemble([...baseArgs(twoMomentsPath), "--out", defaultConfigOut]);
  if (defaultConfigResult?.segments !== 2) {
    violations.push(
      `Default assemble (no --config) should keep both quality-4 and quality-5 moments (threshold 3): expected 2 segments, got ${defaultConfigResult?.segments}.`,
    );
  }

  const configPath = join(workDir, "config.json");
  writeFileSync(configPath, JSON.stringify({ qualityThreshold: 5 }));
  const configOut = join(workDir, "config.cuesheet.json");
  const configResult = runAssemble([...baseArgs(twoMomentsPath), "--out", configOut, "--config", configPath]);
  if (configResult?.segments !== 1) {
    violations.push(
      `--config qualityThreshold override didn't take effect: expected 1 segment (quality 4 < threshold 5, quality 5 keeps), got ${configResult?.segments}.`,
    );
  }
}

function runAssemble(args) {
  const result = spawnSync("node", [DRAFT_CLI_DIST, ...args], { encoding: "utf-8" });
  if (result.status !== 0) {
    violations.push(`cuesheet-draft assemble ${args.join(" ")} failed: ${result.stderr}`);
    return null;
  }
  return JSON.parse(result.stdout.trim().split("\n").filter(Boolean)[0] ?? "{}");
}

function runRenderCheck(workDir) {
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc=duration=1:size=64x36:rate=10",
      "-f",
      "lavfi",
      "-i",
      "anullsrc=r=44100:cl=stereo:d=1",
      "-shortest",
      join(workDir, "clip.mp4"),
    ],
    { stdio: "ignore" },
  );

  const cue = {
    project: { name: "t", fps: 10, width: 64, height: 36 },
    clipDir: workDir,
    intro: null,
    outro: null,
    segments: [{ clip: "clip.mp4", in: 0, out: 1, speed: 1, volume: 1, subtitle: "" }],
    bgm: [],
    subtitleStyle: {
      font: "Pretendard",
      size: 36,
      color: "#ffffff",
      outlineColor: "#000000",
      outlineWidth: 3,
      position: "bottom",
    },
  };
  const cuePath = join(workDir, "in.cuesheet.json");
  writeFileSync(cuePath, JSON.stringify(cue));
  const outPath = join(workDir, "render-out.mp4");
  const srtPath = join(workDir, "render-out.srt");

  const result = spawnSync(
    "node",
    [RENDER_CLI_DIST, cuePath, outPath, "--no-subtitles", "--srt", srtPath, "--json"],
    { encoding: "utf-8" },
  );
  if (result.status !== 0) {
    violations.push(`cuesheet-render --json failed: ${result.stderr}`);
    return;
  }
  const parsed = JSON.parse(result.stdout.trim().split("\n").filter(Boolean)[0] ?? "{}");
  if (Object.keys(parsed).sort().join(",") !== ["outputPath", "durationS", "srtPath"].sort().join(",")) {
    violations.push(`cuesheet-render --json envelope keys drifted: got ${JSON.stringify(Object.keys(parsed))}`);
  }
  if (!existsSync(outPath) || !existsSync(srtPath)) {
    violations.push("cuesheet-render --no-subtitles --srt did not produce both the video and the SRT file.");
  }
}

/**
 * Calls the bridge's tool implementations directly (store.js - the same functions server.ts's
 * tools wrap) for the two documented behaviors not otherwise pinned by packages/bridge/test:
 * validate_cuesheet never writes to disk, and get_schema serves draft 2020-12 JSON Schema.
 */
async function checkBridgeBehaviors() {
  const store = await import(pathToFileURL(BRIDGE_STORE_DIST).href);

  const schema = store.getCuesheetJsonSchema();
  if (typeof schema.$schema !== "string" || !schema.$schema.includes("2020-12")) {
    violations.push(
      `get_schema no longer serves draft 2020-12 JSON Schema as AGENTS.md documents (got $schema=${JSON.stringify(schema.$schema)}).`,
    );
  }

  const tmpCuesheetPath = join(mkdtempSync(join(tmpdir(), "check-agents-doc-bridge-")), "project.cuesheet.json");
  try {
    const invalidCandidate = { project: { name: "t" } }; // missing required fields
    const validated = store.validateCuesheet(invalidCandidate);
    if (validated.ok !== false) {
      violations.push("validate_cuesheet accepted an invalid candidate - fixture drifted, re-check the schema.");
    }
    if (existsSync(tmpCuesheetPath)) {
      violations.push("validate_cuesheet wrote to disk - AGENTS.md documents it as a dry run that never writes.");
    }

    const updated = store.updateCuesheet(tmpCuesheetPath, invalidCandidate);
    if (updated.ok !== false) {
      violations.push("update_cuesheet accepted an invalid candidate - fixture drifted, re-check the schema.");
    }
    if (existsSync(tmpCuesheetPath)) {
      violations.push("A failed update_cuesheet call wrote to disk - AGENTS.md documents nothing being saved on failure.");
    }
  } finally {
    rmSync(join(tmpCuesheetPath, ".."), { recursive: true, force: true });
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function relative(absPath) {
  return absPath.startsWith(repoRoot) ? absPath.slice(repoRoot.length) : absPath;
}
