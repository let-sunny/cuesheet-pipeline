import { describe, expect, it } from "vitest";
import { intervalFor } from "../src/scan.js";

// Length-based sampling interval (seconds), per STATUS.md: 2s under 15s / 5s under 60s /
// 15s under 300s / 60s otherwise. Pure logic with no direct unit test until now (only
// exercised indirectly, and only at short durations, via scan.test.ts's real-clip fixture).
describe("intervalFor", () => {
  it("uses a 2s interval for very short clips (< 15s)", () => {
    expect(intervalFor(3)).toBe(2);
  });

  it("uses a 5s interval just under 60s", () => {
    expect(intervalFor(59)).toBe(5);
  });

  it("uses a 15s interval just under 300s", () => {
    expect(intervalFor(299)).toBe(15);
  });

  it("uses a 60s interval at 300s and beyond (long takes)", () => {
    expect(intervalFor(300)).toBe(60);
    expect(intervalFor(920)).toBe(60);
  });

  it("switches to the next tier exactly at each boundary", () => {
    expect(intervalFor(15)).toBe(5);
    expect(intervalFor(60)).toBe(15);
  });

  it("treats 0 (degenerate/zero-length) as the shortest tier", () => {
    expect(intervalFor(0)).toBe(2);
  });
});
