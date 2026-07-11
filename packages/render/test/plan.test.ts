import { describe, expect, it } from "vitest";
import { validateCueSheet } from "@cuesheet/schema";
import type { CueSheet } from "@cuesheet/schema";
import { buildRenderPlan } from "../src/plan.js";
import { TWO_PASS_INPUT_THRESHOLD } from "../src/twoPass.js";

function make(overrides: Record<string, unknown> = {}): CueSheet {
  const base = {
    project: { name: "t", fps: 30, width: 1920, height: 1080 },
    clipDir: "/clips",
    intro: null,
    outro: null,
    segments: [
      { clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "" },
      { clip: "b.mp4", in: 2, out: 6, speed: 1.5, volume: 0.3, subtitle: "안녕" },
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

describe("buildRenderPlan", () => {
  it("concats one input per segment, adding trim/scale/fps", () => {
    const p = buildRenderPlan(make(), "out.mp4");
    expect(p.filterComplex).toContain("[v0][a0][v1][a1]concat=n=2:v=1:a=1[vout][amain]");
    expect(p.filterComplex).toContain("scale=1920:1080");
    expect(p.filterComplex).toContain("fps=30");
    // Segment b: -ss 2 -t 4 (out-in)
    expect(p.args.join(" ")).toContain("-ss 2 -t 4 -i /clips/b.mp4");
    expect(p.args.join(" ")).toContain("-ss 0 -t 5 -i /clips/a.mp4");
  });

  it("concat inputs alternate [v][a] per segment (not grouped by type)", () => {
    const p = buildRenderPlan(make({ intro: "/i.mp4", outro: "/o.mp4" }), "out.mp4");
    expect(p.filterComplex).toContain(
      "[v0][a0][v1][a1][v2][a2][v3][a3]concat=n=4:v=1:a=1[vout][amain]",
    );
  });

  it("applies volume 0.3 and speed 1.5 (atempo)", () => {
    const p = buildRenderPlan(make(), "out.mp4");
    expect(p.filterComplex).toContain("volume=0.3");
    expect(p.filterComplex).toContain("atempo=1.5");
    expect(p.filterComplex).toContain("setpts=PTS/1.5");
  });

  it("adds drawtext when a subtitle is present, omits it otherwise", () => {
    const p = buildRenderPlan(make(), "out.mp4");
    expect(p.filterComplex).toContain("drawtext=text='안녕'");
    // The first segment has an empty subtitle -> only one drawtext exists
    expect(p.filterComplex.match(/drawtext/g)?.length).toBe(1);
  });

  it("decomposes an out-of-range speed into an atempo chain", () => {
    const p = buildRenderPlan(make({ segments: [{ clip: "x.mp4", in: 0, out: 4, speed: 4, volume: 1, subtitle: "" }] }), "o.mp4");
    // 4x speed -> atempo=2,atempo=2
    expect(p.filterComplex).toContain("atempo=2,atempo=2");
  });

  it("attaches intro/outro front and back, increasing the concat count", () => {
    const p = buildRenderPlan(make({ intro: "/i.mp4", outro: "/o.mp4" }), "out.mp4");
    // intro + 2 segments + outro = 4
    expect(p.filterComplex).toContain("concat=n=4:v=1:a=1");
    expect(p.args.join(" ")).toContain("-i /i.mp4");
    expect(p.args.join(" ")).toContain("-i /o.mp4");
  });

  it("when bgm is present, atrims by end-start then adelay+volume and mixes via amix", () => {
    const p = buildRenderPlan(
      make({ bgm: [{ file: "/bgm.mp3", start: 1, end: 10, volume: 0.4 }] }),
      "out.mp4",
    );
    expect(p.filterComplex).toContain("atrim=0:9,adelay=1000|1000,volume=0.4");
    expect(p.filterComplex).toContain("amix=inputs=2:duration=first[aout]");
    expect(p.args.join(" ")).toContain("-map [aout]");
  });

  it("produces an identical command when narration is absent (field not present at all)", () => {
    const withNarration = buildRenderPlan(make(), "out.mp4");
    const withoutField = buildRenderPlan(make(), "out.mp4");
    expect(withNarration.args).toEqual(withoutField.args);
    expect(withNarration.filterComplex).toEqual(withoutField.filterComplex);
    expect(withNarration.filterComplex).not.toContain("nar");
  });

  it("is identical to the baseline when narration.enabled is false, even with a segment filename present", () => {
    const base = buildRenderPlan(make(), "out.mp4");
    const disabled = buildRenderPlan(
      make({
        narration: { enabled: false, dir: "/narration", volume: 1 },
        segments: [
          { clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "", narration: "n0.mp3" },
          { clip: "b.mp4", in: 2, out: 6, speed: 1.5, volume: 0.3, subtitle: "안녕", narration: "n1.mp3" },
        ],
      }),
      "out.mp4",
    );
    expect(disabled.args).toEqual(base.args);
    expect(disabled.filterComplex).toEqual(base.filterComplex);
  });

  it("when narration is on and only 1 of 2 segments has a file, only that one is included in amix with its delay time", () => {
    const p = buildRenderPlan(
      make({
        narration: { enabled: true, dir: "/narration", volume: 0.9 },
        segments: [
          { clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "" },
          { clip: "b.mp4", in: 2, out: 6, speed: 1.5, volume: 0.3, subtitle: "안녕", narration: "n1.mp3" },
        ],
      }),
      "out.mp4",
    );
    // Segment a (0-5s, speed 1) finishes first, so segment b's output start time is 5s = 5000ms
    expect(p.filterComplex).toContain("adelay=5000|5000,volume=0.9[nar");
    expect(p.args.join(" ")).toContain("-i /narration/n1.mp3");
    expect(p.filterComplex).toContain("amix=inputs=2:duration=first[aout]");
    expect(p.args.join(" ")).toContain("-map [aout]");
  });

  it("when a sped-up segment comes first, the output start time is computed as a cumulative sum of (out-in)/speed", () => {
    const p = buildRenderPlan(
      make({
        narration: { enabled: true, dir: "/narration", volume: 1 },
        segments: [
          // (out-in)/speed = (6-2)/2 = 2s
          { clip: "a.mp4", in: 2, out: 6, speed: 2, volume: 1, subtitle: "" },
          // (out-in)/speed = (9-3)/1.5 = 4s -> cumulative 2+4 = starts at the 6s mark
          { clip: "b.mp4", in: 3, out: 9, speed: 1.5, volume: 1, subtitle: "" },
          { clip: "c.mp4", in: 0, out: 1, speed: 1, volume: 1, subtitle: "", narration: "n2.mp3" },
        ],
      }),
      "out.mp4",
    );
    expect(p.filterComplex).toContain("adelay=6000|6000");
  });

  it("includes all three in amix when bgm and narration are both present", () => {
    const p = buildRenderPlan(
      make({
        bgm: [{ file: "/bgm.mp3", start: 0, end: 10, volume: 0.4 }],
        narration: { enabled: true, dir: "/narration", volume: 1 },
        segments: [
          { clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "", narration: "n0.mp3" },
          { clip: "b.mp4", in: 2, out: 6, speed: 1.5, volume: 0.3, subtitle: "안녕" },
        ],
      }),
      "out.mp4",
    );
    expect(p.filterComplex).toContain("amix=inputs=3:duration=first[aout]");
  });

  it("produces an identical filter chain when crop is absent (no crop filter)", () => {
    const withCropField = buildRenderPlan(make(), "out.mp4");
    const withoutCropField = buildRenderPlan(make(), "out.mp4");
    expect(withCropField.filterComplex).toEqual(withoutCropField.filterComplex);
    expect(withCropField.filterComplex).not.toContain("crop=");
  });

  it("inserts the crop filter right after trim and before scale for a segment with crop", () => {
    const p = buildRenderPlan(
      make({
        segments: [
          {
            clip: "a.mp4",
            in: 0,
            out: 5,
            speed: 1,
            volume: 1,
            subtitle: "",
            crop: { x: 0, y: 0.25, w: 0.75, h: 0.75 },
          },
        ],
      }),
      "out.mp4",
    );
    expect(p.filterComplex).toContain(
      "setpts=PTS-STARTPTS,crop=w=iw*0.75:h=ih*0.75:x=iw*0:y=ih*0.25,scale=1920:1080",
    );
  });

  it("passes when sourceDimensions is given and the actual source ratio matches the project ratio", () => {
    const cue = make({
      segments: [
        {
          clip: "a.mp4",
          in: 0,
          out: 5,
          speed: 1,
          volume: 1,
          subtitle: "",
          crop: { x: 0, y: 0.25, w: 0.75, h: 0.75 },
        },
      ],
    });
    // project is 1920x1080 (16:9); a same-aspect source (1920x1080) + a square crop (w===h)
    // keeps the crop's own pixel aspect at 16:9 too.
    expect(() =>
      buildRenderPlan(cue, "out.mp4", { sourceDimensions: { "a.mp4": { width: 1920, height: 1080 } } }),
    ).not.toThrow();
  });

  it("fails with a field path when sourceDimensions' actual ratio deviates from the project ratio by more than 1%", () => {
    const cue = make({
      segments: [
        {
          clip: "a.mp4",
          in: 0,
          out: 5,
          speed: 1,
          volume: 1,
          subtitle: "",
          crop: { x: 0, y: 0.25, w: 0.75, h: 0.75 },
        },
      ],
    });
    // Source isn't actually 16:9 (1920x1440, 4:3) despite the schema-level w===h crop —
    // the crop's actual pixel aspect ends up 4:3, not the project's 16:9.
    expect(() =>
      buildRenderPlan(cue, "out.mp4", { sourceDimensions: { "a.mp4": { width: 1920, height: 1440 } } }),
    ).toThrowError(/segments\[0\]\.crop: clip "a\.mp4"/);
  });

  it("skips the check when sourceDimensions has no entry for the clip (optional, so it does not fail)", () => {
    const cue = make({
      segments: [
        {
          clip: "a.mp4",
          in: 0,
          out: 5,
          speed: 1,
          volume: 1,
          subtitle: "",
          crop: { x: 0, y: 0.25, w: 0.75, h: 0.75 },
        },
      ],
    });
    expect(() => buildRenderPlan(cue, "out.mp4", { sourceDimensions: {} })).not.toThrow();
  });

  it("burnSubtitles: false omits drawtext while keeping the rest of the filters identical (clean video for CC/SRT)", () => {
    const withSubs = buildRenderPlan(make(), "out.mp4");
    const clean = buildRenderPlan(make(), "out.mp4", { burnSubtitles: false });
    expect(clean.filterComplex).not.toContain("drawtext");
    expect(clean.filterComplex).toContain("scale=1920:1080");
    expect(clean.filterComplex).toContain("atempo=1.5");
    expect(clean.filterComplex).toContain("volume=0.3");
    // Only the drawtext filter should be missing; the rest of the filter graph should be identical.
    expect(clean.filterComplex).toEqual(
      withSubs.filterComplex.replace(",drawtext=text='안녕':fontsize=48:fontcolor=#ffffff:borderw=3:bordercolor=#000000:font='Pretendard':x=(w-text_w)/2:y=h-text_h-40", ""),
    );
    // -i input arguments (trim/file path) are identical regardless of subtitle presence.
    expect(clean.args.join(" ")).toContain("-ss 0 -t 5 -i /clips/a.mp4");
    expect(clean.args.join(" ")).toContain("-ss 2 -t 4 -i /clips/b.mp4");
  });

  it("produces an identical render command to the baseline when burnSubtitles is omitted (regression)", () => {
    const withoutOpts = buildRenderPlan(make(), "out.mp4");
    const withDefaultOpts = buildRenderPlan(make(), "out.mp4", {});
    const withExplicitTrue = buildRenderPlan(make(), "out.mp4", { burnSubtitles: true });
    expect(withDefaultOpts).toEqual(withoutOpts);
    expect(withExplicitTrue).toEqual(withoutOpts);
  });

  it("is identical to the baseline when subtitleStyle.background is absent (regression, no box filter)", () => {
    const p = buildRenderPlan(make(), "out.mp4");
    expect(p.filterComplex).not.toContain("box=1");
  });

  it("adds box/boxcolor/boxborderw to drawtext when subtitleStyle.background is present", () => {
    const p = buildRenderPlan(
      make({
        subtitleStyle: {
          font: "Pretendard",
          size: 48,
          color: "#ffffff",
          outlineColor: "#000000",
          outlineWidth: 3,
          position: "bottom",
          background: { color: "#000000", opacity: 0.75, padding: 10 },
        },
      }),
      "out.mp4",
    );
    expect(p.filterComplex).toContain("box=1:boxcolor=#000000@0.75:boxborderw=10");
  });

  it("produces an identical drawtext to the baseline when styleOverride is absent (omitted) (regression)", () => {
    const withField = buildRenderPlan(
      make({
        segments: [
          { clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "안녕", styleOverride: undefined },
        ],
      }),
      "out.mp4",
    );
    const withoutField = buildRenderPlan(
      make({
        segments: [{ clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "안녕" }],
      }),
      "out.mp4",
    );
    expect(withField.filterComplex).toEqual(withoutField.filterComplex);
    expect(withField.filterComplex).toContain(
      "drawtext=text='안녕':fontsize=48:fontcolor=#ffffff:borderw=3:bordercolor=#000000:font='Pretendard':x=(w-text_w)/2:y=h-text_h-40",
    );
  });

  it("applies the global style unchanged when styleOverride is null (same as no override)", () => {
    const p = buildRenderPlan(
      make({
        segments: [
          {
            clip: "a.mp4",
            in: 0,
            out: 5,
            speed: 1,
            volume: 1,
            subtitle: "안녕",
            styleOverride: null,
          },
        ],
      }),
      "out.mp4",
    );
    expect(p.filterComplex).toContain("fontsize=48:fontcolor=#ffffff");
  });

  it("overlays only the fields given in styleOverride on top of the global style in drawtext (partial merge)", () => {
    const p = buildRenderPlan(
      make({
        segments: [
          {
            clip: "a.mp4",
            in: 0,
            out: 5,
            speed: 1,
            volume: 1,
            subtitle: "이 컷만 다르게",
            styleOverride: { size: 60, color: "#ffff00" },
          },
        ],
      }),
      "out.mp4",
    );
    // size/color are the override values; outlineColor/outlineWidth/font/position/margin stay global.
    expect(p.filterComplex).toContain(
      "drawtext=text='이 컷만 다르게':fontsize=60:fontcolor=#ffff00" +
        ":borderw=3:bordercolor=#000000:font='Pretendard':x=(w-text_w)/2:y=h-text_h-40",
    );
  });

  it("fully replaces (not merges) the global background when styleOverride.background is present", () => {
    const p = buildRenderPlan(
      make({
        subtitleStyle: {
          font: "Pretendard",
          size: 48,
          color: "#ffffff",
          outlineColor: "#000000",
          outlineWidth: 3,
          position: "bottom",
          background: { color: "#000000", opacity: 0.75, padding: 10 },
        },
        segments: [
          {
            clip: "a.mp4",
            in: 0,
            out: 5,
            speed: 1,
            volume: 1,
            subtitle: "박스 색만 바꿈",
            styleOverride: { background: { color: "#ff0000", opacity: 0.4, padding: 8 } },
          },
        ],
      }),
      "out.mp4",
    );
    // The global opacity(0.75)/padding(10) don't leak through; they're fully replaced by the override background.
    expect(p.filterComplex).toContain("box=1:boxcolor=#ff0000@0.4:boxborderw=8");
    expect(p.filterComplex).not.toContain("@0.75");
  });

  it("keeps other segments on the global style even when one segment has styleOverride", () => {
    const p = buildRenderPlan(
      make({
        segments: [
          { clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "기본" },
          {
            clip: "b.mp4",
            in: 0,
            out: 4,
            speed: 1,
            volume: 1,
            subtitle: "오버라이드",
            styleOverride: { size: 72 },
          },
        ],
      }),
      "out.mp4",
    );
    expect(p.filterComplex).toContain("drawtext=text='기본':fontsize=48");
    expect(p.filterComplex).toContain("drawtext=text='오버라이드':fontsize=72");
  });

  it("applies a named preset on top of the global style (merge order: global < preset)", () => {
    const p = buildRenderPlan(
      make({
        subtitleStylePresets: { "inner-voice": { size: 30, color: "#aaaaaa" } },
        segments: [
          {
            clip: "a.mp4",
            in: 0,
            out: 5,
            speed: 1,
            volume: 1,
            subtitle: "속마음",
            stylePreset: "inner-voice",
          },
        ],
      }),
      "out.mp4",
    );
    // size/color come from the preset; outlineColor/outlineWidth/font/position/margin stay global.
    expect(p.filterComplex).toContain(
      "drawtext=text='속마음':fontsize=30:fontcolor=#aaaaaa" +
        ":borderw=3:bordercolor=#000000:font='Pretendard':x=(w-text_w)/2:y=h-text_h-40",
    );
  });

  it("applies the per-cut styleOverride on top of a preset (merge order: global < preset < override)", () => {
    const p = buildRenderPlan(
      make({
        subtitleStylePresets: { "inner-voice": { size: 30, color: "#aaaaaa", outlineWidth: 5 } },
        segments: [
          {
            clip: "a.mp4",
            in: 0,
            out: 5,
            speed: 1,
            volume: 1,
            subtitle: "속마음",
            stylePreset: "inner-voice",
            styleOverride: { color: "#ff00ff" },
          },
        ],
      }),
      "out.mp4",
    );
    // color comes from the override (wins over the preset); size/outlineWidth stay from the preset.
    expect(p.filterComplex).toContain(
      "drawtext=text='속마음':fontsize=30:fontcolor=#ff00ff" +
        ":borderw=5:bordercolor=#000000:font='Pretendard':x=(w-text_w)/2:y=h-text_h-40",
    );
  });

  describe("title cards", () => {
    it("throws a fieldpath-style error when a segment has a title but no prepared titleAssets entry", () => {
      const cue = make({
        segments: [
          {
            clip: "a.mp4",
            in: 0,
            out: 5,
            speed: 1,
            volume: 1,
            subtitle: "",
            title: { text: "Cast on", preset: "typing", durationS: 2 },
          },
        ],
      });
      expect(() => buildRenderPlan(cue, "out.mp4")).toThrowError(/segments\[0\]\.title:/);
    });

    it("wires a typing title into an extra image-sequence input + overlay filter, chained after the base scale/fps chain", () => {
      const cue = make({
        segments: [
          {
            clip: "a.mp4",
            in: 0,
            out: 5,
            speed: 1,
            volume: 1,
            subtitle: "",
            title: { text: "Cast on", preset: "typing", durationS: 2 },
          },
        ],
      });
      const p = buildRenderPlan(cue, "out.mp4", {
        titleAssets: { 0: { kind: "frames", dir: "/tmp/title-cache/abc123", frameCount: 60, fps: 30 } },
      });
      expect(p.filterComplex).toContain("scale=1920:1080,setsar=1,fps=30[v0]");
      expect(p.args.join(" ")).toContain("-framerate 30 -i /tmp/title-cache/abc123/frame_%04d.png");
      expect(p.filterComplex).toContain("[v0][1:v]overlay=0:0:format=auto:enable='between(t,0,2)'[vtitle0]");
      expect(p.filterComplex).toContain("[vtitle0][a0]concat=");
    });

    it("wires a fade/wordStagger/highlight title into an extra image-sequence input + overlay filter", () => {
      const cue = make({
        segments: [
          {
            clip: "a.mp4",
            in: 0,
            out: 5,
            speed: 1,
            volume: 1,
            subtitle: "",
            title: { text: "Cast on", preset: "fade", durationS: 3 },
          },
        ],
      });
      const p = buildRenderPlan(cue, "out.mp4", {
        titleAssets: { 0: { kind: "frames", dir: "/tmp/title-cache/abc123", frameCount: 90, fps: 30 } },
      });
      expect(p.args.join(" ")).toContain("-framerate 30 -i /tmp/title-cache/abc123/frame_%04d.png");
      expect(p.filterComplex).toContain("[v0][1:v]overlay=0:0:format=auto:enable='between(t,0,3)'[vtitle0]");
      expect(p.filterComplex).toContain("[vtitle0][a0]concat=");
    });

    it("adds a backdrop-dim color source + overlay before the title's own overlay step", () => {
      const cue = make({
        segments: [
          {
            clip: "a.mp4",
            in: 0,
            out: 5,
            speed: 1,
            volume: 1,
            subtitle: "",
            title: { text: "Cast on", preset: "typing", durationS: 2, backdrop: { dim: 0.5 } },
          },
        ],
      });
      const p = buildRenderPlan(cue, "out.mp4", {
        titleAssets: { 0: { kind: "frames", dir: "/tmp/title-cache/abc123", frameCount: 60, fps: 30 } },
      });
      expect(p.filterComplex).toContain(
        "color=black:size=1920x1080:duration=2:rate=30,format=yuva420p,fade=t=in:st=0:d=0.4:alpha=1,fade=t=out:st=1.6:d=0.4:alpha=1,colorchannelmixer=aa=0.5[dim0]",
      );
      expect(p.filterComplex).toContain("[v0][dim0]overlay=0:0:enable='between(t,0,2)'[vdim0]");
      expect(p.filterComplex).toContain("[vdim0][1:v]overlay=0:0:format=auto:enable='between(t,0,2)'[vtitle0]");
    });

    it("adds -filter_complex_threads 1 only when a captured-frames title is present", () => {
      const withoutTitle = buildRenderPlan(make(), "out.mp4");
      expect(withoutTitle.args).not.toContain("-filter_complex_threads");

      const withFrames = buildRenderPlan(
        make({
          segments: [
            {
              clip: "a.mp4",
              in: 0,
              out: 5,
              speed: 1,
              volume: 1,
              subtitle: "",
              title: { text: "Cast on", preset: "fade", durationS: 2 },
            },
          ],
        }),
        "out.mp4",
        { titleAssets: { 0: { kind: "frames", dir: "/tmp/title-cache/abc", frameCount: 60, fps: 30 } } },
      );
      const idx = withFrames.args.indexOf("-filter_complex_threads");
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(withFrames.args[idx + 1]).toBe("1");
    });

    it("produces an identical filter chain to the baseline when no segment has a title (regression)", () => {
      const withoutTitle = buildRenderPlan(make(), "out.mp4");
      const stillWithoutTitle = buildRenderPlan(make(), "out.mp4", { titleAssets: {} });
      expect(withoutTitle.filterComplex).toEqual(stillWithoutTitle.filterComplex);
      expect(withoutTitle.filterComplex).not.toContain("subtitles=");
      expect(withoutTitle.filterComplex).not.toContain("overlay=");
    });
  });

  describe("transitions (fade/dip, PRD backlog #3)", () => {
    it("produces an identical filter chain to the baseline when no segment has a transition (regression)", () => {
      const withoutTransitions = buildRenderPlan(make(), "out.mp4");
      expect(withoutTransitions.filterComplex).not.toContain("fade=");
      expect(withoutTransitions.filterComplex).not.toContain("afade=");
      expect(withoutTransitions.filterComplex).not.toContain("dipin");
      expect(withoutTransitions.filterComplex).not.toContain("dipout");
      expect(withoutTransitions.args.join(" ")).toContain("-map [vout]");
    });

    it("wires a fade-in at the segment's own output-time st=0, chained after the base scale/fps step", () => {
      const p = buildRenderPlan(
        make({
          segments: [
            {
              clip: "a.mp4",
              in: 0,
              out: 5,
              speed: 1,
              volume: 1,
              subtitle: "",
              transitionIn: { type: "fade", durationS: 0.5 },
            },
          ],
        }),
        "out.mp4",
      );
      expect(p.filterComplex).toContain("scale=1920:1080,setsar=1,fps=30[v0]");
      expect(p.filterComplex).toContain("[v0]fade=t=in:st=0:d=0.5[vtxin0]");
      expect(p.filterComplex).toContain("[vtxin0][a0]concat=");
      expect(p.filterComplex).toContain("afade=t=in:st=0:d=0.5");
    });

    it("wires a fade-out at st=outputDuration-durationS (no speed - source duration equals output duration)", () => {
      const p = buildRenderPlan(
        make({
          segments: [
            {
              clip: "a.mp4",
              in: 0,
              out: 5,
              speed: 1,
              volume: 1,
              subtitle: "",
              transitionOut: { type: "fade", durationS: 1 },
            },
          ],
        }),
        "out.mp4",
      );
      // outputDurationS = 5 (out-in, speed 1) -> st = 5-1 = 4
      expect(p.filterComplex).toContain("[v0]fade=t=out:st=4:d=1[vtxout0]");
      expect(p.filterComplex).toContain("afade=t=out:st=4:d=1");
    });

    it("computes the fade-out offset on OUTPUT time (post-setpts/speed), not source time", () => {
      const p = buildRenderPlan(
        make({
          segments: [
            {
              // Source range is 8s (0-8), speed 2x -> output duration = 4s
              clip: "a.mp4",
              in: 0,
              out: 8,
              speed: 2,
              volume: 1,
              subtitle: "",
              transitionOut: { type: "fade", durationS: 1 },
            },
          ],
        }),
        "out.mp4",
      );
      // st = outputDuration(4) - durationS(1) = 3, not 8-1=7 (source time)
      expect(p.filterComplex).toContain("fade=t=out:st=3:d=1[vtxout0]");
      expect(p.filterComplex).toContain("afade=t=out:st=3:d=1");
    });

    it("chains transitionIn then transitionOut in sequence on the same clip", () => {
      const p = buildRenderPlan(
        make({
          segments: [
            {
              clip: "a.mp4",
              in: 0,
              out: 5,
              speed: 1,
              volume: 1,
              subtitle: "",
              transitionIn: { type: "fade", durationS: 0.5 },
              transitionOut: { type: "fade", durationS: 0.5 },
            },
          ],
        }),
        "out.mp4",
      );
      expect(p.filterComplex).toContain("[v0]fade=t=in:st=0:d=0.5[vtxin0]");
      expect(p.filterComplex).toContain("[vtxin0]fade=t=out:st=4.5:d=0.5[vtxout0]");
      expect(p.filterComplex).toContain("[vtxout0][a0]concat=");
      expect(p.filterComplex).toContain("afade=t=in:st=0:d=0.5,afade=t=out:st=4.5:d=0.5");
    });

    it("wires a dip-in as a black-alpha overlay ramping from dim down to 0, defaulting dim to 1", () => {
      const p = buildRenderPlan(
        make({
          segments: [
            {
              clip: "a.mp4",
              in: 0,
              out: 5,
              speed: 1,
              volume: 1,
              subtitle: "",
              transitionIn: { type: "dip", durationS: 0.5 },
            },
          ],
        }),
        "out.mp4",
      );
      expect(p.filterComplex).toContain(
        "color=black:size=1920x1080:duration=5:rate=30,format=yuva420p,fade=t=out:st=0:d=0.5:alpha=1,colorchannelmixer=aa=1[dipin0]",
      );
      expect(p.filterComplex).toContain("[v0][dipin0]overlay=0:0[vdipin0]");
      expect(p.filterComplex).toContain("[vdipin0][a0]concat=");
    });

    it("wires a dip-out with a partial dim (0.6), ramping alpha from 0 up to dim by the segment's end", () => {
      const p = buildRenderPlan(
        make({
          segments: [
            {
              clip: "a.mp4",
              in: 0,
              out: 5,
              speed: 1,
              volume: 1,
              subtitle: "",
              transitionOut: { type: "dip", durationS: 0.5, dim: 0.6 },
            },
          ],
        }),
        "out.mp4",
      );
      expect(p.filterComplex).toContain(
        "color=black:size=1920x1080:duration=5:rate=30,format=yuva420p,fade=t=in:st=4.5:d=0.5:alpha=1,colorchannelmixer=aa=0.6[dipout0]",
      );
      expect(p.filterComplex).toContain("[v0][dipout0]overlay=0:0[vdipout0]");
      // Audio still gets a plain afade (same window) regardless of dip's partial dim.
      expect(p.filterComplex).toContain("afade=t=out:st=4.5:d=0.5");
    });

    it("clamps a transition longer than the cut's own output duration so the offset never goes negative", () => {
      const p = buildRenderPlan(
        make({
          segments: [
            {
              // outputDurationS = 0.3s, shorter than the transition's own 2s max
              clip: "a.mp4",
              in: 0,
              out: 0.3,
              speed: 1,
              volume: 1,
              subtitle: "",
              transitionOut: { type: "fade", durationS: 2 },
            },
          ],
        }),
        "out.mp4",
      );
      // d clamped to 0.3 -> st = 0.3-0.3 = 0
      expect(p.filterComplex).toContain("fade=t=out:st=0:d=0.3[vtxout0]");
    });

    it("cross-clamps transitionIn+transitionOut proportionally when their combined duration exceeds the cut (QA-2 #1)", () => {
      // 1.5s cut, 2s transitionIn + 2s transitionOut - each independently clamps to 1.5s (the old
      // behavior), so the two fade windows would span the ENTIRE cut and overlap. Cross-clamped:
      // ratio is 1:1, so both scale down to 0.75s each (1.5/(2+2)=0.375 scale -> 2*0.375=0.75),
      // summing to exactly the 1.5s cut with no overlap.
      const p = buildRenderPlan(
        make({
          segments: [
            {
              clip: "a.mp4",
              in: 0,
              out: 1.5,
              speed: 1,
              volume: 1,
              subtitle: "",
              transitionIn: { type: "fade", durationS: 2 },
              transitionOut: { type: "fade", durationS: 2 },
            },
          ],
        }),
        "out.mp4",
      );
      expect(p.filterComplex).toContain("[v0]fade=t=in:st=0:d=0.75[vtxin0]");
      expect(p.filterComplex).toContain("[vtxin0]fade=t=out:st=0.75:d=0.75[vtxout0]");
      expect(p.filterComplex).toContain("afade=t=in:st=0:d=0.75,afade=t=out:st=0.75:d=0.75");
    });

    it("cross-clamps an asymmetric transitionIn/transitionOut pair preserving their original ratio", () => {
      // 2s cut, transitionIn=2s (schema max), transitionOut=1s (sum=3, 1.5x the cut) ->
      // scale=2/3 -> dIn=2*(2/3)=1.3333, dOut=1*(2/3)=0.6667.
      const p = buildRenderPlan(
        make({
          segments: [
            {
              clip: "a.mp4",
              in: 0,
              out: 2,
              speed: 1,
              volume: 1,
              subtitle: "",
              transitionIn: { type: "fade", durationS: 2 },
              transitionOut: { type: "fade", durationS: 1 },
            },
          ],
        }),
        "out.mp4",
      );
      expect(p.filterComplex).toContain("[v0]fade=t=in:st=0:d=1.3333333333333333[vtxin0]");
      expect(p.filterComplex).toContain(
        "[vtxin0]fade=t=out:st=1.3333333333333335:d=0.6666666666666666[vtxout0]",
      );
      expect(p.filterComplex).toContain(
        "afade=t=in:st=0:d=1.3333333333333333,afade=t=out:st=1.3333333333333335:d=0.6666666666666666",
      );
    });

    it("does not cross-clamp when transitionIn+transitionOut already fit within the cut (regression, no change)", () => {
      const p = buildRenderPlan(
        make({
          segments: [
            {
              clip: "a.mp4",
              in: 0,
              out: 5,
              speed: 1,
              volume: 1,
              subtitle: "",
              transitionIn: { type: "fade", durationS: 0.5 },
              transitionOut: { type: "fade", durationS: 0.5 },
            },
          ],
        }),
        "out.mp4",
      );
      expect(p.filterComplex).toContain("[v0]fade=t=in:st=0:d=0.5[vtxin0]");
      expect(p.filterComplex).toContain("[vtxin0]fade=t=out:st=4.5:d=0.5[vtxout0]");
    });

    it("applies a transition on the title-composited frame (chained after the title/backdrop stage)", () => {
      const p = buildRenderPlan(
        make({
          segments: [
            {
              clip: "a.mp4",
              in: 0,
              out: 5,
              speed: 1,
              volume: 1,
              subtitle: "",
              title: { text: "Cast on", preset: "typing", durationS: 2 },
              transitionIn: { type: "fade", durationS: 0.5 },
            },
          ],
        }),
        "out.mp4",
        { titleAssets: { 0: { kind: "frames", dir: "/tmp/title-cache/abc", frameCount: 60, fps: 30 } } },
      );
      expect(p.filterComplex).toContain(
        "[v0][1:v]overlay=0:0:format=auto:enable='between(t,0,2)'[vtitle0]",
      );
      expect(p.filterComplex).toContain("[vtitle0]fade=t=in:st=0:d=0.5[vtxin0]");
      expect(p.filterComplex).toContain("[vtxin0][a0]concat=");
    });
  });

  describe("BGM ducking (narration.ducking, PRD backlog #4)", () => {
    it("is a byte-identical passthrough when narration.ducking is absent, even with narration+bgm present", () => {
      const withoutDucking = buildRenderPlan(
        make({
          bgm: [{ file: "/bgm.mp3", start: 0, end: 10, volume: 0.4 }],
          narration: { enabled: true, dir: "/narration", volume: 1 },
          segments: [
            { clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "", narration: "n0.mp3" },
            { clip: "b.mp4", in: 2, out: 6, speed: 1.5, volume: 0.3, subtitle: "안녕" },
          ],
        }),
        "out.mp4",
      );
      expect(withoutDucking.filterComplex).toContain("volume=0.4[bgm");
      expect(withoutDucking.filterComplex).not.toContain("eval=frame");
    });

    it("is a passthrough when narration is enabled+ducking is set but no segment carries a narration file", () => {
      const p = buildRenderPlan(
        make({
          bgm: [{ file: "/bgm.mp3", start: 0, end: 10, volume: 0.4 }],
          narration: { enabled: true, dir: "/narration", volume: 1, ducking: {} },
        }),
        "out.mp4",
      );
      expect(p.filterComplex).toContain("volume=0.4[bgm");
      expect(p.filterComplex).not.toContain("eval=frame");
      expect(p.warnings).toEqual([]);
    });

    it("multiplies the BGM's own volume by a volume=eval=frame gain expression over the narration window", () => {
      const p = buildRenderPlan(
        make({
          bgm: [{ file: "/bgm.mp3", start: 0, end: 10, volume: 0.4 }],
          narration: { enabled: true, dir: "/narration", volume: 1, ducking: { amount: 0.6, fadeS: 0.3 } },
          segments: [
            { clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "", narration: "n0.mp3" },
            { clip: "b.mp4", in: 2, out: 6, speed: 1.5, volume: 0.3, subtitle: "안녕" },
          ],
        }),
        "out.mp4",
        { narrationDurations: { 0: 3 } },
      );
      // Segment a starts at output t=0, narration duration 3s -> window [0,3].
      expect(p.filterComplex).toContain("volume=eval=frame:volume='0.4*(");
      expect(p.filterComplex).toContain("between(t,0,3)");
      // Ramp-down edge: 1 - 0.6*(t-0)/0.3
      expect(p.filterComplex).toContain("1-(0.6)*(t-0)/0.3");
      // Sustain floor: 1 - 0.6 = 0.4
      expect(p.filterComplex).toContain("lt(t,2.7),0.4");
      // Ramp-up edge back to 1
      expect(p.filterComplex).toContain("0.4+(0.6)*(t-(2.7))/0.3");
    });

    it("skips (with a warning) a narrated segment whose duration wasn't probed, rather than throwing", () => {
      const p = buildRenderPlan(
        make({
          bgm: [{ file: "/bgm.mp3", start: 0, end: 10, volume: 0.4 }],
          narration: { enabled: true, dir: "/narration", volume: 1, ducking: {} },
          segments: [
            { clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "", narration: "n0.mp3" },
            { clip: "b.mp4", in: 2, out: 6, speed: 1.5, volume: 0.3, subtitle: "안녕" },
          ],
        }),
        "out.mp4",
        // No narrationDurations option at all.
      );
      expect(p.filterComplex).not.toContain("eval=frame");
      expect(p.warnings.some((w) => w.includes("segments[0].narration") && w.includes("ducking skipped"))).toBe(true);
    });

    it("merges two overlapping/adjacent narration windows into one continuous dip", () => {
      const p = buildRenderPlan(
        make({
          bgm: [{ file: "/bgm.mp3", start: 0, end: 10, volume: 0.4 }],
          narration: { enabled: true, dir: "/narration", volume: 1, ducking: { amount: 0.6, fadeS: 0.3 } },
          segments: [
            // Segment a: output [0,5), narration duration 5.2s -> window [0, 5.2] overlaps segment b's start.
            { clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "", narration: "n0.mp3" },
            // Segment b starts at output t=5 (a's (out-in)/speed = 5), narration duration 1s -> window [5,6].
            { clip: "b.mp4", in: 0, out: 4, speed: 1, volume: 1, subtitle: "", narration: "n1.mp3" },
          ],
        }),
        "out.mp4",
        { narrationDurations: { 0: 5.2, 1: 1 } },
      );
      // Merged into a single [0, 6] window rather than two separate between() branches.
      expect(p.filterComplex).toContain("between(t,0,6)");
      expect(p.filterComplex.match(/between\(t,/g)?.length).toBe(1);
    });
  });

  describe("episode-level fadeIn/fadeOut (project.fadeInS/fadeOutS, PRD backlog #3)", () => {
    it("produces an identical plan to the baseline when fadeInS/fadeOutS are absent (regression)", () => {
      const withoutFades = buildRenderPlan(make(), "out.mp4");
      expect(withoutFades.filterComplex).not.toContain("vfadein");
      expect(withoutFades.filterComplex).not.toContain("vfadeout");
      expect(withoutFades.args.join(" ")).toContain("-map [vout]");
    });

    it("fades the final video+audio in from st=0 when project.fadeInS is set", () => {
      const p = buildRenderPlan(make({ project: { name: "t", fps: 30, width: 1920, height: 1080, fadeInS: 1 } }), "out.mp4");
      expect(p.filterComplex).toContain("[vout]fade=t=in:st=0:d=1[vfadein]");
      expect(p.filterComplex).toContain("[amain]afade=t=in:st=0:d=1[afadein]");
      expect(p.args.join(" ")).toContain("-map [vfadein]");
      expect(p.args.join(" ")).toContain("-map [afadein]");
    });

    it("fades the final video+audio out using the reverse-fade-in-reverse idiom when project.fadeOutS is set (total duration unknown)", () => {
      const p = buildRenderPlan(make({ project: { name: "t", fps: 30, width: 1920, height: 1080, fadeOutS: 1.5 } }), "out.mp4");
      expect(p.filterComplex).toContain("[vout]reverse,fade=t=in:st=0:d=1.5,reverse[vfadeout]");
      expect(p.filterComplex).toContain("[amain]areverse,afade=t=in:st=0:d=1.5,areverse[afadeout]");
      expect(p.args.join(" ")).toContain("-map [vfadeout]");
      expect(p.args.join(" ")).toContain("-map [afadeout]");
    });

    it("chains fadeIn then fadeOut, and fadeOut reads off the amix output when bgm is present", () => {
      const p = buildRenderPlan(
        make({
          project: { name: "t", fps: 30, width: 1920, height: 1080, fadeInS: 0.5, fadeOutS: 0.5 },
          bgm: [{ file: "/bgm.mp3", start: 0, end: 10, volume: 0.4 }],
        }),
        "out.mp4",
      );
      expect(p.filterComplex).toContain("[vout]fade=t=in:st=0:d=0.5[vfadein]");
      expect(p.filterComplex).toContain("[vfadein]reverse,fade=t=in:st=0:d=0.5,reverse[vfadeout]");
      expect(p.filterComplex).toContain("[aout]afade=t=in:st=0:d=0.5[afadein]");
      expect(p.filterComplex).toContain("[afadein]areverse,afade=t=in:st=0:d=0.5,areverse[afadeout]");
      expect(p.args.join(" ")).toContain("-map [vfadeout]");
      expect(p.args.join(" ")).toContain("-map [afadeout]");
    });
  });

  it("includes codec and fps in the output arguments", () => {
    const p = buildRenderPlan(make(), "final.mp4");
    const s = p.args.join(" ");
    expect(s).toContain("-map [vout]");
    expect(s).toContain("-r 30");
    expect(s).toContain("-c:v libx264");
    expect(s).toContain("-c:a aac");
    expect(s).toContain("-y final.mp4");
  });

  it("commands has exactly one byte-identical entry for a plain single-pass cuesheet", () => {
    const p = buildRenderPlan(make(), "final.mp4");
    expect(p.commands).toHaveLength(1);
    expect(p.commands[0]).toEqual({
      args: p.args,
      filterComplex: p.filterComplex,
      outputPath: p.outputPath,
      label: "single-pass",
    });
  });
});

describe("buildRenderPlan two-pass dispatch (needsTwoPassRender)", () => {
  function makeSegments(count: number, titleIndex?: number) {
    return Array.from({ length: count }, (_, i) =>
      i === titleIndex
        ? {
            clip: `c${i}.mp4`,
            in: 0,
            out: 3,
            speed: 1,
            volume: 1,
            subtitle: "",
            title: { text: "Hi", preset: "fade", durationS: 2 },
          }
        : { clip: `c${i}.mp4`, in: 0, out: 3, speed: 1, volume: 1, subtitle: "" },
    );
  }

  it("stays single-pass below TWO_PASS_INPUT_THRESHOLD even with a captured-frames title", () => {
    const cue = make({ segments: makeSegments(TWO_PASS_INPUT_THRESHOLD - 1, 0) });
    const p = buildRenderPlan(cue, "out.mp4", {
      titleAssets: { 0: { kind: "frames", dir: "/tmp/tc", frameCount: 60, fps: 30 } },
    });
    expect(p.commands).toHaveLength(1);
    expect(p.filterComplex).toContain("overlay=0:0:format=auto:enable='between(t,0,2)'");
  });

  it("dispatches to a two-pass plan at/above TWO_PASS_INPUT_THRESHOLD with a captured-frames title", () => {
    const cue = make({ segments: makeSegments(TWO_PASS_INPUT_THRESHOLD, 0) });
    const p = buildRenderPlan(cue, "out.mp4", {
      titleAssets: { 0: { kind: "frames", dir: "/tmp/tc", frameCount: 60, fps: 30 } },
    });
    expect(p.commands).toHaveLength(2);
    const [pass1, pass2] = p.commands;
    expect(pass1?.label).toBe("pass1-base");
    expect(pass2?.label).toBe("pass2-titles");
    // Pass 1 defers the title overlay entirely (it's applied in pass 2 instead) and encodes
    // near-lossless (crf 10) since it's a temporary intermediate, not the delivered output.
    expect(pass1?.filterComplex).not.toContain("overlay=0:0:format=auto");
    expect(pass1?.args.join(" ")).toContain("-crf 10");
    expect(pass1?.outputPath).toBe("out.pass1-intermediate.mp4");
    // Pass 2 reads the intermediate as its sole input and applies the overlay at the segment's
    // output-timeline offset (segment 0 starts at t=0 here).
    expect(pass2?.args).toEqual(expect.arrayContaining(["-i", "out.pass1-intermediate.mp4"]));
    expect(pass2?.filterComplex).toContain("overlay=0:0:format=auto:enable='between(t,0,2)'");
    expect(pass2?.outputPath).toBe("out.mp4");
    // Top-level fields are derived from the FINAL pass (pass 2) - see RenderPlan.commands's doc.
    expect(p.args).toEqual(pass2?.args);
    expect(p.outputPath).toBe("out.mp4");
  });

  it("dispatches to a two-pass plan at/above TWO_PASS_INPUT_THRESHOLD for a typing title too (every preset is frame-kind now)", () => {
    const segments = makeSegments(TWO_PASS_INPUT_THRESHOLD + 5, 0).map((s, i) =>
      i === 0 ? { ...s, title: { text: "Hi", preset: "typing", durationS: 2 } } : s,
    );
    const p = buildRenderPlan(make({ segments }), "out.mp4", {
      titleAssets: { 0: { kind: "frames", dir: "/tmp/t", frameCount: 60, fps: 30 } },
    });
    expect(p.commands).toHaveLength(2);
  });
});
