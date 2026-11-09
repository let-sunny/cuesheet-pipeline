import { describe, expect, it } from "vitest";
import { proxyFileName } from "../../src/server/media/proxyGeneration.js";

describe("proxyFileName", () => {
  it("unifies the extension to .mp4 for a flat clip name", () => {
    expect(proxyFileName("clip.MOV")).toBe("clip.mp4");
  });

  it("flattens a raw-footage-sorting event-subfolder path into a single safe filename", () => {
    expect(proxyFileName("001_label_260609/VID_20260609_224617_001.mp4")).toBe(
      "001_label_260609__VID_20260609_224617_001.mp4",
    );
  });

  it("avoids collisions between same-named files in different event-subfolders", () => {
    const a = proxyFileName("001_a_260609/IMG_0001.MOV");
    const b = proxyFileName("002_b_260610/IMG_0001.MOV");
    expect(a).not.toBe(b);
  });
});
