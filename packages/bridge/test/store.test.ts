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
  it("검증 통과 시 저장하고, get으로 다시 읽힌다", () => {
    const r = updateCuesheet(TMP, sample());
    expect(r.ok).toBe(true);
    expect(existsSync(TMP)).toBe(true);

    const got = getCuesheet(TMP);
    expect(got.ok).toBe(true);
    if (got.ok) expect(got.data.segments[0]?.volume).toBe(1);
  });

  it('"음성 30%" 편집: 모든 segment volume을 0.3으로 바꿔 저장', () => {
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

  it("검증 실패 시 저장하지 않고 에러를 준다", () => {
    const bad = sample();
    bad.segments[0].out = -1; // in >= out
    const r = updateCuesheet(TMP, bad);
    expect(r.ok).toBe(false);
    expect(existsSync(TMP)).toBe(false);
  });
});

describe("getCuesheet", () => {
  it("파일이 없으면 ok:false", () => {
    const r = getCuesheet(TMP);
    expect(r.ok).toBe(false);
  });
});
