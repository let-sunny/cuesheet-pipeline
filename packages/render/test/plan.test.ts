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
    // 세그먼트 b: -ss 2 -t 4 (out-in)
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
    // 첫 세그먼트는 빈 자막 → drawtext 하나만 존재
    expect(p.filterComplex.match(/drawtext/g)?.length).toBe(1);
  });

  it("범위 밖 배속은 atempo 체인으로 분해한다", () => {
    const p = buildRenderPlan(make({ segments: [{ clip: "x.mp4", in: 0, out: 4, speed: 4, volume: 1, subtitle: "" }] }), "o.mp4");
    // 4배속 → atempo=2,atempo=2
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
    // 세그먼트 a(0~5초, speed 1)가 먼저 끝나므로 세그먼트 b의 출력 시작 시각은 5초 = 5000ms
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
          // (out-in)/speed = (6-2)/2 = 2초
          { clip: "a.mp4", in: 2, out: 6, speed: 2, volume: 1, subtitle: "" },
          // (out-in)/speed = (9-3)/1.5 = 4초 → 누적 2+4 = 6초 지점에서 시작
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
