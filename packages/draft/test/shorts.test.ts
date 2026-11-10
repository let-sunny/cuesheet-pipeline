import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { buildShortsJsonResult, buildShortsReportLines } from "../src/cli.js";
import { buildShortFfmpegArgs, planShorts } from "../src/shorts.js";
import type { ShortPlan } from "../src/shorts.js";
import type { ClipMoments } from "../src/types.js";

const moment = (inS: number, outS: number, shotType: string, quality: number, memo = shotType) => ({
  inS,
  outS,
  shotType,
  quality,
  memo,
});

const EPISODE: ClipMoments[] = [
  {
    clip: "b_reveal.mp4",
    clipSummary: "",
    moments: [moment(0, 8, "reveal", 5, "finished vest"), moment(10, 12, "cat", 5, "cat on the vest")],
    monotonousRanges: [],
  },
  {
    clip: "a_process.mp4",
    clipSummary: "",
    moments: [
      moment(40, 50, "hand-closeup", 4, "ribbing"),
      moment(0, 4, "object", 4, "yarn"),
      moment(20, 22, "hand-closeup", 3, "blurry"),
      moment(60, 61, "change", 5, "sleeve joined"),
      moment(70, 80, "wearing", 5, "얼굴 노출 wearing"),
    ],
    monotonousRanges: [],
  },
];

describe("planShorts", () => {
  it("builds lead-in cuts in footage order followed by the hero", () => {
    const [first] = planShorts(EPISODE);
    expect(first?.hook).toBe("finished vest");
    expect(first?.cuts.map((c) => [c.clip, c.role, c.shotType])).toEqual([
      ["a_process.mp4", "lead-in", "object"],
      ["a_process.mp4", "lead-in", "hand-closeup"],
      ["a_process.mp4", "lead-in", "change"],
      ["b_reveal.mp4", "hero", "reveal"],
    ]);
  });

  it("caps cut lengths: lead-ins keep the middle, the hero keeps its start", () => {
    const [first] = planShorts(EPISODE);
    const ribbing = first?.cuts.find((c) => c.memo === "ribbing");
    expect([ribbing?.inS, ribbing?.outS]).toEqual([43.75, 46.25]);
    const short = first?.cuts.find((c) => c.memo === "sleeve joined");
    expect([short?.inS, short?.outS]).toEqual([60, 61]);
    const hero = first?.cuts.at(-1);
    expect([hero?.inS, hero?.outS]).toEqual([0, 5]);
    expect(first?.durationS).toBe(2.5 + 2.5 + 1 + 5);
  });

  it("picks one hero per shot type before repeating a type", () => {
    const plans = planShorts(EPISODE);
    expect(plans.map((p) => [p.id, p.cuts.at(-1)?.shotType])).toEqual([
      ["01", "reveal"],
      ["02", "cat"],
    ]);
  });

  it("excludes face-risky moments and below-threshold lead-ins", () => {
    const memos = planShorts(EPISODE).flatMap((p) => p.cuts.map((c) => c.memo));
    expect(memos).not.toContain("얼굴 노출 wearing");
    expect(memos).not.toContain("blurry");
  });

  it("prefers quality-5 heroes and falls back to minQuality only when none exist", () => {
    const withTop: ClipMoments[] = [
      {
        clip: "c.mp4",
        clipSummary: "",
        moments: [moment(0, 3, "reveal", 4, "ok reveal"), moment(5, 8, "reveal", 5, "best reveal")],
        monotonousRanges: [],
      },
    ];
    expect(planShorts(withTop).map((p) => p.hook)).toEqual(["best reveal"]);
    const onlyFour: ClipMoments[] = [
      { clip: "c.mp4", clipSummary: "", moments: [moment(0, 3, "reveal", 4, "ok reveal")], monotonousRanges: [] },
    ];
    expect(planShorts(onlyFour).map((p) => p.hook)).toEqual(["ok reveal"]);
  });

  it("on equal quality prefers the last occurrence, and honors maxShorts", () => {
    const two: ClipMoments[] = [
      {
        clip: "c.mp4",
        clipSummary: "",
        moments: [moment(0, 3, "reveal", 5, "first"), moment(5, 8, "reveal", 5, "final")],
        monotonousRanges: [],
      },
    ];
    expect(planShorts(two).map((p) => p.hook)).toEqual(["final", "first"]);
    expect(planShorts(two, { maxShorts: 1 }).map((p) => p.hook)).toEqual(["final"]);
  });

  it("returns nothing when there is no hero moment", () => {
    const none: ClipMoments[] = [
      { clip: "c.mp4", clipSummary: "", moments: [moment(0, 3, "hand-closeup", 5)], monotonousRanges: [] },
    ];
    expect(planShorts(none)).toEqual([]);
  });
});

describe("buildShortFfmpegArgs", () => {
  it("seeks before each input and center-crops every cut to the vertical frame", () => {
    const args = buildShortFfmpegArgs(
      [
        { path: "/src/a.mp4", inS: 43.75, outS: 46.25, hasAudio: true },
        { path: "/src/b.mp4", inS: 0, outS: 5, hasAudio: false },
      ],
      "/out/short-01.mp4",
    );
    expect(args.slice(0, 13)).toEqual(
      ["-y", "-ss", "43.75", "-t", "2.5", "-i", "/src/a.mp4", "-ss", "0", "-t", "5", "-i", "/src/b.mp4"],
    );
    const filter = args[args.indexOf("-filter_complex") + 1] as string;
    expect(filter).toContain("[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920");
    expect(filter).toContain("[0:a]aresample=48000");
    expect(filter).toContain("anullsrc=r=48000:cl=stereo,atrim=duration=5[a1]");
    expect(filter).toContain("[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]");
    expect(args.at(-1)).toBe("/out/short-01.mp4");
  });

  it("rejects an empty Short", () => {
    expect(() => buildShortFfmpegArgs([], "/out/x.mp4")).toThrow(/at least one cut/);
  });
});

describe("shorts CLI report builders", () => {
  const plans: ShortPlan[] = planShorts(EPISODE);

  it("summarizes each plan, hero last", () => {
    const lines = buildShortsReportLines(plans);
    expect(lines[0]).toBe("Short 01 (11s, 4 cuts): finished vest");
    expect(lines[4]).toBe("  hero    b_reveal.mp4 0-5s [reveal]");
  });

  it("says so when nothing qualifies", () => {
    expect(buildShortsReportLines([])).toHaveLength(1);
  });

  it("reports outPath only for rendered Shorts", () => {
    const r = buildShortsJsonResult(plans, "/o/shorts-plan.json", { "01": "/o/short-01.mp4" });
    expect(r.shorts.map((s) => s.outPath)).toEqual(["/o/short-01.mp4", null]);
  });
});

/**
 * End to end against real ffmpeg: a landscape clip with audio plus a portrait clip without,
 * rendered into one vertical Short.
 */
describe("cuesheet-draft shorts --render (e2e)", () => {
  const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const cli = join(pkgDir, "dist", "cli.js");
  const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

  beforeAll(() => {
    if (!existsSync(cli)) execFileSync("pnpm", ["build"], { cwd: pkgDir, stdio: "ignore" });
  });

  it.skipIf(!hasFfmpeg)("renders a 1080x1920 mp4 of the planned duration", () => {
    const dir = mkdtempSync(join(tmpdir(), "shorts-e2e-"));
    try {
      execFileSync("ffmpeg", [
        "-y", "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30:duration=6",
        "-f", "lavfi", "-i", "sine=frequency=440:duration=6",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", join(dir, "a_process.mp4"),
      ], { stdio: "ignore" });
      execFileSync("ffmpeg", [
        "-y", "-f", "lavfi", "-i", "smptebars=size=720x1280:rate=30:duration=6",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", join(dir, "b_reveal.mp4"),
      ], { stdio: "ignore" });
      const moments: ClipMoments[] = [
        { clip: "a_process.mp4", clipSummary: "", moments: [moment(1, 5, "hand-closeup", 4)], monotonousRanges: [] },
        { clip: "b_reveal.mp4", clipSummary: "", moments: [moment(0, 3, "reveal", 5)], monotonousRanges: [] },
      ];
      writeFileSync(join(dir, "moments.json"), JSON.stringify(moments));

      const stdout = execFileSync(
        "node",
        [cli, "shorts", "--moments", join(dir, "moments.json"), "--clip-dir", dir, "--out-dir", join(dir, "out"), "--render", "--json"],
        { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] },
      );
      const result = JSON.parse(stdout) as { shorts: Array<{ outPath: string; durationS: number }> };
      expect(result.shorts).toHaveLength(1);
      expect(JSON.parse(readFileSync(join(dir, "out", "shorts-plan.json"), "utf-8"))).toHaveLength(1);

      const probe = execFileSync(
        "ffprobe",
        ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "csv=p=0", result.shorts[0]?.outPath as string],
        { encoding: "utf-8" },
      ).trim().split("\n");
      expect(probe[0]).toBe("1080,1920");
      expect(Number(probe[1])).toBeCloseTo(5.5, 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
