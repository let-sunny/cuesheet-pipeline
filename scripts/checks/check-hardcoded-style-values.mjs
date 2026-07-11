#!/usr/bin/env node
/**
 * check-hardcoded-style-values: no raw color literals (hex / rgb() / hsl()) and no literal
 * borderRadius numbers in apps/web co-located StyleX (`*.styles.ts`). Every such value must come
 * from an Astryx token (`colorVars` / `radiusVars` / `spacingVars`), so the active theme controls
 * it - the 2026-07-11 theme regression guard (a hardcoded rounded corner or off-palette color is
 * invisible under the theme you develop against and only surfaces under another, e.g. y2k's 0px
 * radius; this fails at write time instead).
 *
 * Two escape hatches for genuinely theme-independent VIDEO-content surfaces (a title/subtitle/crop
 * overlay or a scrim sits ON the footage and must look the same regardless of the app's theme):
 *   - Whole-file: listed in DOMAIN_OVERLAY_FILES below.
 *   - Per-line: a `// theme-exempt` marker on the offending line (or the line above it).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listTrackedFiles, readTrackedFiles } from "./lib/tracked-files.mjs";

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");

// Video-content overlays whose colors are fixed by design (they render over the footage, not as app
// chrome, so they correctly do NOT follow the Astryx theme).
const DOMAIN_OVERLAY_FILES = new Set([
  "apps/web/src/components/TitleOverlay/TitleOverlay.styles.ts",
  "apps/web/src/components/SequencePlayer/SequencePlayer.styles.ts",
  "apps/web/src/components/CropEditOverlay/CropEditOverlay.styles.ts",
  "apps/web/src/components/Swatch/Swatch.styles.ts",
]);

const RAW_COLOR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\s*\(/;
const LITERAL_RADIUS = /borderRadius\s*:\s*[0-9]/;
const EXEMPT = /theme-exempt/;

main();

function main() {
  const files = readTrackedFiles(
    repoRoot,
    listTrackedFiles(repoRoot).filter((f) => f.startsWith("apps/web/src/") && f.endsWith(".styles.ts")),
  );

  const violations = [];
  for (const { path: relPath, content } of files) {
    if (DOMAIN_OVERLAY_FILES.has(relPath)) continue;
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue; // comments
      const hasRawColor = RAW_COLOR.test(line);
      const hasLiteralRadius = LITERAL_RADIUS.test(line);
      if (!hasRawColor && !hasLiteralRadius) continue;
      if (EXEMPT.test(line) || (i > 0 && EXEMPT.test(lines[i - 1]))) continue; // per-line escape hatch
      const kind = hasRawColor ? "raw color literal" : "literal borderRadius";
      violations.push(`  ${relPath}:${i + 1}: ${kind} - use an Astryx token (colorVars/radiusVars): ${trimmed}`);
    }
  }

  if (violations.length > 0) {
    console.error("check-hardcoded-style-values: hardcoded style values in co-located StyleX:");
    for (const v of violations) console.error(v);
    console.error(
      `\n${violations.length} violation(s). Use a token so the theme controls it. If this is a fixed ` +
        `video-content overlay color, add a "// theme-exempt" marker with a reason (or add the file to ` +
        `DOMAIN_OVERLAY_FILES in this check).`,
    );
    process.exit(1);
  }
  console.log("check-hardcoded-style-values: all co-located StyleX uses tokens (or documented theme-exempt overlays).");
}
