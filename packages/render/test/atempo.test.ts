import { describe, expect, it } from "vitest";
import { atempoChain } from "../src/atempo.js";

describe("atempoChain", () => {
  it("returns a single atempo filter for a speed already within 0.5-2.0", () => {
    expect(atempoChain(1.5)).toEqual(["atempo=1.5"]);
  });

  it("decomposes a speed above 2.0 into a chain of atempo=2 steps plus a remainder", () => {
    expect(atempoChain(4)).toEqual(["atempo=2", "atempo=2"]);
  });

  it("decomposes a speed below 0.5 into a chain of atempo=0.5 steps plus a remainder", () => {
    expect(atempoChain(0.125)).toEqual(["atempo=0.5", "atempo=0.5", "atempo=0.5"]);
  });

  it("handles a speed far outside the range with both a whole chain and a remainder step", () => {
    expect(atempoChain(14)).toEqual(["atempo=2", "atempo=2", "atempo=2", "atempo=1.75"]);
  });
});
