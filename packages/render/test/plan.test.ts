import { describe, expect, it } from "vitest";
import { validateCueSheet } from "@cuesheet/schema";
import type { CueSheet } from "@cuesheet/schema";
import { buildRenderPlan } from "../src/plan.js";

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
  it("세그먼트 수만큼 concat 하고, 트림/스케일/fps를 넣는다", () => {
    const p = buildRenderPlan(make(), "out.mp4");
    expect(p.filterComplex).toContain("[v0][a0][v1][a1]concat=n=2:v=1:a=1[vout][amain]");
    expect(p.filterComplex).toContain("scale=1920:1080");
    expect(p.filterComplex).toContain("fps=30");
    // Segment b: -ss 2 -t 4 (out-in)
    expect(p.args.join(" ")).toContain("-ss 2 -t 4 -i /clips/b.mp4");
    expect(p.args.join(" ")).toContain("-ss 0 -t 5 -i /clips/a.mp4");
  });

  it("concat 입력은 세그먼트별 [v][a]가 번갈아 나온다(타입별로 묶이지 않는다)", () => {
    const p = buildRenderPlan(make({ intro: "/i.mp4", outro: "/o.mp4" }), "out.mp4");
    expect(p.filterComplex).toContain(
      "[v0][a0][v1][a1][v2][a2][v3][a3]concat=n=4:v=1:a=1[vout][amain]",
    );
  });

  it("volume 0.3과 speed 1.5(atempo)를 적용한다", () => {
    const p = buildRenderPlan(make(), "out.mp4");
    expect(p.filterComplex).toContain("volume=0.3");
    expect(p.filterComplex).toContain("atempo=1.5");
    expect(p.filterComplex).toContain("setpts=PTS/1.5");
  });

  it("자막이 있으면 drawtext, 없으면 넣지 않는다", () => {
    const p = buildRenderPlan(make(), "out.mp4");
    expect(p.filterComplex).toContain("drawtext=text='안녕'");
    // The first segment has an empty subtitle -> only one drawtext exists
    expect(p.filterComplex.match(/drawtext/g)?.length).toBe(1);
  });

  it("범위 밖 배속은 atempo 체인으로 분해한다", () => {
    const p = buildRenderPlan(make({ segments: [{ clip: "x.mp4", in: 0, out: 4, speed: 4, volume: 1, subtitle: "" }] }), "o.mp4");
    // 4x speed -> atempo=2,atempo=2
    expect(p.filterComplex).toContain("atempo=2,atempo=2");
  });

  it("intro/outro를 앞뒤로 붙여 concat 개수가 늘어난다", () => {
    const p = buildRenderPlan(make({ intro: "/i.mp4", outro: "/o.mp4" }), "out.mp4");
    // intro + 2 segments + outro = 4
    expect(p.filterComplex).toContain("concat=n=4:v=1:a=1");
    expect(p.args.join(" ")).toContain("-i /i.mp4");
    expect(p.args.join(" ")).toContain("-i /o.mp4");
  });

  it("bgm이 있으면 end-start만큼 atrim 후 adelay+volume, amix로 섞는다", () => {
    const p = buildRenderPlan(
      make({ bgm: [{ file: "/bgm.mp3", start: 1, end: 10, volume: 0.4 }] }),
      "out.mp4",
    );
    expect(p.filterComplex).toContain("atrim=0:9,adelay=1000|1000,volume=0.4");
    expect(p.filterComplex).toContain("amix=inputs=2:duration=first[aout]");
    expect(p.args.join(" ")).toContain("-map [aout]");
  });

  it("narration이 없으면(필드 자체 없음) 기존과 완전히 동일한 명령이 나온다", () => {
    const withNarration = buildRenderPlan(make(), "out.mp4");
    const withoutField = buildRenderPlan(make(), "out.mp4");
    expect(withNarration.args).toEqual(withoutField.args);
    expect(withNarration.filterComplex).toEqual(withoutField.filterComplex);
    expect(withNarration.filterComplex).not.toContain("nar");
  });

  it("narration.enabled가 false면 세그먼트에 파일명이 있어도 기존과 동일하다", () => {
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

  it("narration이 켜져 있고 세그먼트 2개 중 1개만 파일이 있으면 그 하나만 지연시각으로 amix에 포함된다", () => {
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

  it("배속 세그먼트가 앞에 있으면 출력 시작 시각이 (out-in)/speed 누적으로 계산된다", () => {
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

  it("bgm과 narration이 동시에 있으면 amix에 셋 다 포함된다", () => {
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

  it("crop이 없으면 기존과 완전히 동일한 필터가 나온다(crop 필터 없음)", () => {
    const withCropField = buildRenderPlan(make(), "out.mp4");
    const withoutCropField = buildRenderPlan(make(), "out.mp4");
    expect(withCropField.filterComplex).toEqual(withoutCropField.filterComplex);
    expect(withCropField.filterComplex).not.toContain("crop=");
  });

  it("crop이 있는 세그먼트는 트림 직후 스케일 전에 crop 필터가 들어간다", () => {
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
            crop: { x: 0, y: 0.25, w: 1, h: 0.75 },
          },
        ],
      }),
      "out.mp4",
    );
    expect(p.filterComplex).toContain(
      "setpts=PTS-STARTPTS,crop=w=iw*1:h=ih*0.75:x=iw*0:y=ih*0.25,scale=1920:1080",
    );
  });

  it("burnSubtitles: false면 drawtext를 생략하고 나머지 필터는 동일하다(CC/SRT용 클린 영상)", () => {
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

  it("burnSubtitles 옵션을 생략하면 기존과 완전히 동일한 렌더 명령이 나온다(회귀)", () => {
    const withoutOpts = buildRenderPlan(make(), "out.mp4");
    const withDefaultOpts = buildRenderPlan(make(), "out.mp4", {});
    const withExplicitTrue = buildRenderPlan(make(), "out.mp4", { burnSubtitles: true });
    expect(withDefaultOpts).toEqual(withoutOpts);
    expect(withExplicitTrue).toEqual(withoutOpts);
  });

  it("subtitleStyle.background가 없으면 기존과 완전히 동일하다(회귀, box 필터 없음)", () => {
    const p = buildRenderPlan(make(), "out.mp4");
    expect(p.filterComplex).not.toContain("box=1");
  });

  it("subtitleStyle.background가 있으면 drawtext에 box/boxcolor/boxborderw를 추가한다", () => {
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

  it("styleOverride가 없으면(생략) 기존과 완전히 동일한 drawtext가 나온다(회귀)", () => {
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

  it("styleOverride가 null이면 전역 스타일 그대로 적용된다(오버라이드 없음과 동일)", () => {
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

  it("styleOverride로 지정한 필드만 전역 스타일 위에 덮어써 drawtext에 반영된다(부분 병합)", () => {
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

  it("styleOverride.background가 있으면 전역 background를 부분 병합이 아니라 통짜 교체한다", () => {
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

  it("styleOverride가 있어도 다른 세그먼트는 전역 스타일 그대로 유지된다", () => {
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

  it("출력 인자에 코덱과 fps가 들어간다", () => {
    const p = buildRenderPlan(make(), "final.mp4");
    const s = p.args.join(" ");
    expect(s).toContain("-map [vout]");
    expect(s).toContain("-r 30");
    expect(s).toContain("-c:v libx264");
    expect(s).toContain("-c:a aac");
    expect(s).toContain("-y final.mp4");
  });
});
