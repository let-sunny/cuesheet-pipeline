import { existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getCuesheet, updateCuesheet } from "../src/store.js";

const TMP = join(tmpdir(), "cuesheet-bridge-test.json");

function sample() {
  return {
    project: { name: "t", fps: 30, width: 1920, height: 1080 },
    clipDir: "/x/clips",
    intro: null,
    outro: null,
    segments: [{ clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "" }],
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
}

afterEach(() => {
  if (existsSync(TMP)) rmSync(TMP);
});

describe("updateCuesheet", () => {
  it("saves on validation pass and reads back via get", () => {
    const r = updateCuesheet(TMP, sample());
    expect(r.ok).toBe(true);
    expect(existsSync(TMP)).toBe(true);

    const got = getCuesheet(TMP);
    expect(got.ok).toBe(true);
    if (got.ok) expect(got.data.segments[0]?.volume).toBe(1);
  });

  it('"lower volume to 30%" edit: rewrites every segment volume to 0.3 and saves', () => {
    updateCuesheet(TMP, sample());
    const cur = getCuesheet(TMP);
    expect(cur.ok).toBe(true);
    if (!cur.ok) return;

    const edited = {
      ...cur.data,
      segments: cur.data.segments.map((s) => ({ ...s, volume: 0.3 })),
    };
    const r = updateCuesheet(TMP, edited);
    expect(r.ok).toBe(true);

    const saved = JSON.parse(readFileSync(TMP, "utf-8"));
    expect(saved.segments[0].volume).toBe(0.3);
  });

  it("does not save and gives an error on validation failure", () => {
    const bad = sample();
    bad.segments[0].out = -1; // in >= out
    const r = updateCuesheet(TMP, bad);
    expect(r.ok).toBe(false);
    expect(existsSync(TMP)).toBe(false);
  });

  it("refuses to save when a field unknown to the schema is mixed in (lost via zod strip)", () => {
    const withUnknown = {
      ...sample(),
      segments: [
        { clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "", totallyUnknownField: "x" },
      ],
    };
    const r = updateCuesheet(TMP, withUnknown);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.includes("segments[0].totallyUnknownField"))).toBe(true);
      expect(r.errors.some((e) => e.includes("Field loss detected"))).toBe(true);
    }
    expect(existsSync(TMP)).toBe(false);
  });
});

describe("getCuesheet", () => {
  it("gives ok:false when the file does not exist", () => {
    const r = getCuesheet(TMP);
    expect(r.ok).toBe(false);
  });
});
