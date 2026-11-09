import { describe, expect, it } from "vitest";
import { validateCueSheet } from "@cuesheet/schema";
import type { CueSheet } from "@cuesheet/schema";
import { buildAss, secondsToAssTimestamp } from "../src/ass.js";

function make(overrides: Record<string, unknown> = {}): CueSheet {
  const base = {
    project: { name: "t", fps: 30, width: 1920, height: 1080 },
    clipDir: "/clips",
    intro: null,
    outro: null,
    segments: [
      { clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "안녕하세요" },
      { clip: "b.mp4", in: 2, out: 6, speed: 1.5, volume: 0.3, subtitle: "" },
      { clip: "c.mp4", in: 0, out: 4, speed: 2, volume: 1, subtitle: "빠른 컷: 100%" },
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

describe("secondsToAssTimestamp", () => {
  it("converts to H:MM:SS.cc format (centiseconds)", () => {
    expect(secondsToAssTimestamp(0)).toBe("0:00:00.00");
    expect(secondsToAssTimestamp(1.5)).toBe("0:00:01.50");
    expect(secondsToAssTimestamp(3661.234)).toBe("1:01:01.23");
  });

  it("clamps negative values to 0", () => {
    expect(secondsToAssTimestamp(-1)).toBe("0:00:00.00");
  });
});

describe("buildAss", () => {
  it("produces the expected [Script Info]/[V4+ Styles]/[Events] sections", () => {
    const ass = buildAss(make());
    expect(ass).toContain("[Script Info]");
    expect(ass).toContain("PlayResX: 1920");
    expect(ass).toContain("PlayResY: 1080");
    expect(ass).toContain("[V4+ Styles]");
    expect(ass).toContain("[Events]");
  });

  it("skips segments with an empty subtitle (same cumulative-timeline model as buildSrt)", () => {
    const ass = buildAss(make());
    expect(ass).not.toContain("b.mp4");
    const dialogueLines = ass.split("\n").filter((l) => l.startsWith("Dialogue:"));
    expect(dialogueLines).toHaveLength(2);
    // Segment 1: 0-5s, segment 3 starts after segment 2's output duration (4/1.5=2.667s) -> 7.667s
    expect(dialogueLines[0]).toContain("0:00:00.00,0:00:05.00");
    expect(dialogueLines[1]).toContain("0:00:07.67,0:00:09.67");
  });

  it("preserves text as-is aside from brace-stripping (no colon escaping needed, unlike drawtext)", () => {
    const ass = buildAss(make());
    expect(ass).toContain("빠른 컷: 100%");
  });

  it("dedupes identical resolved styles into a single named Style referenced by every matching Dialogue line", () => {
    const ass = buildAss(make());
    const styleLines = ass.split("\n").filter((l) => l.startsWith("Style:"));
    expect(styleLines).toHaveLength(1);
    expect(styleLines[0]).toContain("Style1,");
    const dialogueLines = ass.split("\n").filter((l) => l.startsWith("Dialogue:"));
    for (const line of dialogueLines) expect(line).toContain(",Style1,");
  });

  it("gives a per-cut styleOverride its own distinct Style entry", () => {
    const cue = make({
      segments: [
        { clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "one" },
        { clip: "b.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "two", styleOverride: { size: 72 } },
      ],
    });
    const ass = buildAss(cue);
    const styleLines = ass.split("\n").filter((l) => l.startsWith("Style:"));
    expect(styleLines).toHaveLength(2);
  });

  it("maps position to ASS alignment (bottom=2, top=8, center=5), horizontally centered", () => {
    const bottom = buildAss(make());
    expect(bottom).toMatch(/Style1,[^\n]*,2,10,10,\d+,1\n/);

    const top = buildAss(make({ subtitleStyle: { font: "P", size: 48, color: "#fff", outlineColor: "#000", outlineWidth: 3, position: "top" } }));
    expect(top).toMatch(/Style1,[^\n]*,8,10,10,\d+,1\n/);

    const center = buildAss(
      make({ subtitleStyle: { font: "P", size: 48, color: "#fff", outlineColor: "#000", outlineWidth: 3, position: "center" } }),
    );
    expect(center).toMatch(/Style1,[^\n]*,5,10,10,0,1\n/);
  });

  it("converts a #RRGGBB color to ASS's &HAABBGGRR (BGR order, inverted alpha)", () => {
    const ass = buildAss(make({ subtitleStyle: { font: "P", size: 48, color: "#ff0000", outlineColor: "#00ff00", outlineWidth: 3, position: "bottom" } }));
    // red (#ff0000) opaque -> &H000000FF (AA=00 opaque, BB=00, GG=00, RR=FF)
    expect(ass).toContain("&H000000FF");
    // outline/SecondaryColour are also set from color/outlineColor; green outline -> &H0000FF00 (BB=00,GG=FF,RR=00)
    expect(ass).toContain("&H0000FF00");
  });

  it("uses BorderStyle=1 (no box) when there is no background, BorderStyle=3 (opaque box) when there is", () => {
    const noBg = buildAss(make());
    expect(noBg).toMatch(/Style1,[^,]*,[^,]*,[^,]*,[^,]*,[^,]*,[^,]*,0,0,0,0,100,100,0,0,1,/);

    const withBg = buildAss(
      make({
        subtitleStyle: {
          font: "P",
          size: 48,
          color: "#fff",
          outlineColor: "#000",
          outlineWidth: 3,
          position: "bottom",
          background: { color: "#000000", opacity: 0.6, padding: 8 },
        },
      }),
    );
    expect(withBg).toMatch(/Style1,[^,]*,[^,]*,[^,]*,[^,]*,[^,]*,[^,]*,0,0,0,0,100,100,0,0,3,/);
  });

  it("returns a valid (empty [Events]) file when every segment has an empty subtitle", () => {
    const cue = make({
      segments: [{ clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "" }],
    });
    const ass = buildAss(cue);
    const dialogueLines = ass.split("\n").filter((l) => l.startsWith("Dialogue:"));
    expect(dialogueLines).toHaveLength(0);
    expect(ass).toContain("[Events]");
  });
});
