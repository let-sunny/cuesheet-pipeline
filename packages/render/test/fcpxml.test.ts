import { describe, expect, it } from "vitest";
import { validateCueSheet } from "@cuesheet/schema";
import type { CueSheet } from "@cuesheet/schema";
import { buildFcpXml, resolveFcpXmlClipPath } from "../src/fcpxml.js";

function make(overrides: Record<string, unknown> = {}): CueSheet {
  const base = {
    project: { name: "t", fps: 30, width: 1920, height: 1080 },
    clipDir: "/clips",
    intro: null,
    outro: null,
    segments: [
      { clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "안녕하세요" },
      { clip: "b.mp4", in: 2, out: 16, speed: 14, volume: 1, subtitle: "" },
      { clip: "a.mp4", in: 10, out: 13, speed: 1, volume: 1, subtitle: "다시 a" },
    ],
    bgm: [],
    subtitleStyle: {
      font: "Pretendard",
      size: 48,
      color: "#ffffff",
      outlineColor: "#000000",
      outlineWidth: 3,
      position: "bottom",
    },
  };
  const r = validateCueSheet({ ...base, ...overrides });
  if (!r.ok) throw new Error(r.errors.join("\n"));
  return r.data;
}

const durations = { "/clips/a.mp4": 20, "/clips/b.mp4": 20 };

describe("resolveFcpXmlClipPath", () => {
  it("resolves a segment clip against clipDir", () => {
    expect(resolveFcpXmlClipPath(make(), "a.mp4", "segment")).toBe("/clips/a.mp4");
  });

  it("resolves an intro/outro path as-is, not against clipDir", () => {
    expect(resolveFcpXmlClipPath(make(), "/media/intro.mp4", "introOutro")).toBe("/media/intro.mp4");
  });
});

describe("buildFcpXml", () => {
  it("emits one asset-clip per segment and one asset resource per unique clip", () => {
    const { xml } = buildFcpXml(make(), durations);
    expect(xml.match(/<asset-clip /g)).toHaveLength(3);
    expect(xml.match(/<asset /g)).toHaveLength(2); // a.mp4 and b.mp4, deduplicated
  });

  it("places clips at the OUTPUT (speed-adjusted) duration, keeping the timeline in lockstep with buildSrt", () => {
    const { xml } = buildFcpXml(make(), durations);
    // seg 1: 0-5s @1x -> offset 0, duration 150/30s
    expect(xml).toContain('offset="0/30s" start="0/30s" duration="150/30s"');
    // seg 2: 2-16s @14x -> output duration 1s -> offset 150/30s, duration 30/30s
    expect(xml).toContain('offset="150/30s" start="60/30s" duration="30/30s"');
    // seg 3: 10-13s @1x -> offset 180/30s (5+1=6s), duration 90/30s
    expect(xml).toContain('offset="180/30s" start="300/30s" duration="90/30s"');
  });

  it("flags every speed!==1 segment as a manual speed fix, by segment index", () => {
    const { manualSpeedFixes } = buildFcpXml(make(), durations);
    expect(manualSpeedFixes).toEqual([{ segmentIndex: 1, clip: "b.mp4", speed: 14, inS: 2, outS: 16 }]);
  });

  it("produces well-formed XML with a DOCTYPE and fcpxml root", () => {
    const { xml } = buildFcpXml(make(), durations);
    expect(xml).toContain("<!DOCTYPE fcpxml>");
    expect(xml).toContain('<fcpxml version="1.9">');
    expect(xml.trim().endsWith("</fcpxml>")).toBe(true);
  });

  it("percent-encodes the file:// src path (spaces, non-ASCII)", () => {
    const cue = make({ clipDir: "/raw 폴더" });
    const { xml } = buildFcpXml(cue, { "/raw 폴더/a.mp4": 20, "/raw 폴더/b.mp4": 20 });
    expect(xml).toContain("file:///raw%20%ED%8F%B4%EB%8D%94/a.mp4");
  });

  it("omits hasAudio on a still-image asset (jpg has no audio stream) but keeps it on video assets", () => {
    const cue = make({ segments: [{ clip: "photo.jpg", in: 0, out: 2, speed: 1, volume: 1, subtitle: "" }] });
    const { xml } = buildFcpXml(cue, { "/clips/photo.jpg": 2 });
    expect(xml).toContain('name="photo.jpg" src="file:///clips/photo.jpg" start="0s" duration="60/30s" hasVideo="1" format="r1"');
    expect(xml).not.toMatch(/photo\.jpg.*hasAudio/);
    const { xml: videoXml } = buildFcpXml(make(), durations);
    expect(videoXml).toContain('hasVideo="1" hasAudio="1" format="r1"');
  });

  it("pins an image asset's declared duration to exactly what's used, never a large placeholder", () => {
    // A still has no real frame count - a large declared duration makes Resolve's FCPXML
    // importer read it as an image SEQUENCE spanning that many numbered frames, showing
    // everything past frame 1 as Media Offline. Even with a large (wrong) probed/placeholder
    // duration passed in, and the same photo reused twice, the asset's own duration must track
    // only the furthest point any asset-clip actually requests.
    const cue = make({
      segments: [
        { clip: "photo.jpg", in: 0, out: 2, speed: 1, volume: 1, subtitle: "" },
        { clip: "a.mp4", in: 0, out: 1, speed: 1, volume: 1, subtitle: "" },
        { clip: "photo.jpg", in: 5, out: 8, speed: 1, volume: 1, subtitle: "" },
      ],
    });
    const { xml } = buildFcpXml(cue, { "/clips/photo.jpg": 3600, "/clips/a.mp4": 20 });
    // furthest usage: second occurrence starts at 5s, 3s long -> asset duration must be 8s, not 3600s
    expect(xml).toContain('name="photo.jpg" src="file:///clips/photo.jpg" start="0s" duration="240/30s" hasVideo="1" format="r1"');
  });

  it("includes intro/outro as additional clips at the start/end when present", () => {
    const cue = make({ intro: "/media/intro.mp4", outro: "/media/outro.mp4" });
    const { xml } = buildFcpXml(cue, { ...durations, "/media/intro.mp4": 3, "/media/outro.mp4": 2 });
    expect(xml.match(/<asset-clip /g)).toHaveLength(5); // intro + 3 segments + outro
    expect(xml).toContain('name="intro.mp4"');
    expect(xml).toContain('name="outro.mp4"');
  });
});
