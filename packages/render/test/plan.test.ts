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
