import { basename, join, resolve } from "node:path";
import type { CueSheet } from "@cuesheet/schema";

/** A manually-fixable gap this generator leaves behind: a sped-up cut it could only place at its
 * correct timeline duration by showing the clip at 1x (source range truncated to that duration)
 * rather than the full in-out range played back sped up. FCPXML has no generator-portable
 * speed-ramp primitive across Resolve versions, so these need Resolve's own speed/retime applied
 * by hand after import. */
export interface FcpXmlManualSpeedFix {
  segmentIndex: number;
  clip: string;
  speed: number;
  inS: number;
  outS: number;
}

export interface FcpXmlBuildResult {
  xml: string;
  manualSpeedFixes: FcpXmlManualSpeedFix[];
}

/** Resolves the same absolute source path used both when probing durations (CLI) and when
 * emitting <asset src="..."> (here), so the two stay in lockstep. Segment clips are filename-only
 * and resolved against clipDir; intro/outro are already full/relative paths, used as-is. */
export function resolveFcpXmlClipPath(cue: Pick<CueSheet, "clipDir">, clip: string, kind: "segment" | "introOutro"): string {
  return kind === "segment" ? resolve(join(cue.clipDir, clip)) : resolve(clip);
}

/**
 * Converts a cuesheet into FCPXML 1.9 (DaVinci Resolve-importable): every cut's clip + in/out +
 * timeline position, seeding a Resolve timeline instead of a blank one. Subtitles are NOT
 * embedded here - reuse buildSrt() and import the result as a separate subtitle track, since
 * FCPXML title-effect UIDs are fragile across Resolve versions while SRT import is universal.
 * This lives in render (not draft/web) per the dependency-direction rule: any logic that consumes
 * a cuesheet to produce an output artifact belongs here.
 *
 * `durationsByAbsolutePath` must have an entry (ffprobe'd source duration, seconds) for every
 * clip/intro/outro this cuesheet references, keyed by resolveFcpXmlClipPath()'s result - the CLI
 * probes these since this module stays pure (no filesystem access).
 */
export function buildFcpXml(cue: CueSheet, durationsByAbsolutePath: Record<string, number>): FcpXmlBuildResult {
  const fps = cue.project.fps;
  const toTime = (seconds: number) => secondsToFcpTime(seconds, fps);

  const assets = new Map<string, { id: string; path: string; durationS: number }>();
  const assetIdFor = (absolutePath: string): string => {
    const existing = assets.get(absolutePath);
    if (existing) return existing.id;
    const id = `r${assets.size + 2}`; // r1 is the format resource
    const durationS = durationsByAbsolutePath[absolutePath] ?? 0;
    assets.set(absolutePath, { id, path: absolutePath, durationS });
    return id;
  };

  const manualSpeedFixes: FcpXmlManualSpeedFix[] = [];
  const clipItems: string[] = [];
  let cursorS = 0;

  const pushClip = (absolutePath: string, name: string, startS: number, outputDurationS: number) => {
    const id = assetIdFor(absolutePath);
    clipItems.push(
      `        <asset-clip ref="${id}" name="${escapeXml(name)}" offset="${toTime(cursorS)}" start="${toTime(startS)}" duration="${toTime(outputDurationS)}"/>`,
    );
    cursorS += outputDurationS;
  };

  if (cue.intro) {
    const absolutePath = resolveFcpXmlClipPath(cue, cue.intro, "introOutro");
    const durationS = durationsByAbsolutePath[absolutePath] ?? 0;
    pushClip(absolutePath, basename(cue.intro), 0, durationS);
  }

  cue.segments.forEach((seg, segmentIndex) => {
    const absolutePath = resolveFcpXmlClipPath(cue, seg.clip, "segment");
    const outputDurationS = (seg.out - seg.in) / seg.speed;
    if (seg.speed !== 1) {
      manualSpeedFixes.push({ segmentIndex, clip: seg.clip, speed: seg.speed, inS: seg.in, outS: seg.out });
    }
    // Always placed at the OUTPUT (speed-adjusted) duration so the timeline stays in lockstep
    // with buildSrt()'s cumulative accounting; for speed !== 1 this truncates the shown source
    // range to `in .. in + outputDurationS` at 1x rather than the full in-out range sped up - see
    // manualSpeedFixes.
    pushClip(absolutePath, seg.clip, seg.in, outputDurationS);
  });

  if (cue.outro) {
    const absolutePath = resolveFcpXmlClipPath(cue, cue.outro, "introOutro");
    const durationS = durationsByAbsolutePath[absolutePath] ?? 0;
    pushClip(absolutePath, basename(cue.outro), 0, durationS);
  }

  const totalDurationS = cursorS;
  const assetResources = [...assets.values()]
    .map((a) => {
      // Still images (jpg/png/heic/...) have no audio stream - declaring hasAudio="1" on one
      // makes Resolve's FCPXML importer look for an audio component that doesn't exist, which
      // shows the asset as Media Offline. Videos keep both flags.
      const audioFlag = isImagePath(a.path) ? "" : ` hasAudio="1"`;
      return `    <asset id="${a.id}" name="${escapeXml(basename(a.path))}" src="file://${encodeFilePath(a.path)}" start="0s" duration="${toTime(a.durationS)}" hasVideo="1"${audioFlag} format="r1"/>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.9">
  <resources>
    <format id="r1" name="FFVideoFormat${cue.project.height}p${fps}" frameDuration="1/${fps}s" width="${cue.project.width}" height="${cue.project.height}"/>
${assetResources}
  </resources>
  <library>
    <event name="${escapeXml(cue.project.name)}">
      <project name="${escapeXml(cue.project.name)}">
        <sequence format="r1" duration="${toTime(totalDurationS)}" tcStart="0s">
          <spine>
${clipItems.join("\n")}
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>
`;

  return { xml, manualSpeedFixes };
}

/** FCPXML times are rational (frames/fps), never decimal seconds - this project's cuesheets are
 * always a flat fps (project.fps), so frames/fps is exact with no NTSC drop-frame complication. */
function secondsToFcpTime(seconds: number, fps: number): string {
  const frames = Math.max(0, Math.round(seconds * fps));
  return `${frames}/${fps}s`;
}

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".heic", ".heif", ".bmp", ".gif", ".tiff", ".tif"]);

function isImagePath(path: string): boolean {
  const ext = path.slice(path.lastIndexOf(".")).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** file:// URLs need their path segments percent-encoded (spaces, Korean text, etc.) but not the
 * path separators themselves. */
function encodeFilePath(absolutePath: string): string {
  return absolutePath.split("/").map(encodeURIComponent).join("/");
}
