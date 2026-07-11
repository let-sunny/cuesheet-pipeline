import { describe, expect, it } from "vitest";
import { toggleSegmentTitleAt, updateSegmentTitleAt } from "../../src/lib/titleEditing.js";
import { makeCueSheet } from "../helpers/fixtures.js";

describe("toggleSegmentTitleAt", () => {
  it("sets a default typing title (3s, white, size 500) when turned on", () => {
    const cue = makeCueSheet();
    const result = toggleSegmentTitleAt(cue, 0, true);
    expect(result.segments[0]?.title).toEqual({
      text: "Title",
      preset: "typing",
      durationS: 3,
      color: "#ffffff",
      size: 500,
    });
  });

  it("removes the title key entirely when turned off", () => {
    const cue = makeCueSheet({
      segments: [
        { clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "", title: { text: "Hi", preset: "typing", durationS: 3 } },
      ],
    });
    const result = toggleSegmentTitleAt(cue, 0, false);
    expect(result.segments[0]).not.toHaveProperty("title");
  });
});

describe("updateSegmentTitleAt", () => {
  it("patches the segment's title", () => {
    const cue = makeCueSheet({
      segments: [
        { clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "", title: { text: "Hi", preset: "typing", durationS: 3 } },
      ],
    });
    const result = updateSegmentTitleAt(cue, 0, { text: "Changed" });
    expect(result.segments[0]?.title).toMatchObject({ text: "Changed", durationS: 3 });
  });

  it("is a no-op when the segment has no title", () => {
    const cue = makeCueSheet();
    const result = updateSegmentTitleAt(cue, 0, { text: "Changed" });
    expect(result.segments[0]?.title).toBeUndefined();
  });
});
