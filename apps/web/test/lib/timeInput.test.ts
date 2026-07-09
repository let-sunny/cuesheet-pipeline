import { describe, expect, it } from "vitest";
import { parseTimeInput } from "../../src/lib/timeInput.js";

describe("parseTimeInput", () => {
  it("parses plain seconds", () => {
    expect(parseTimeInput("12.5", 0)).toBe(12.5);
    expect(parseTimeInput("0", 99)).toBe(0);
  });

  it("parses M:SS.s shorthand", () => {
    expect(parseTimeInput("1:23.4", 0)).toBeCloseTo(83.4, 5);
    expect(parseTimeInput("0:05", 0)).toBe(5);
    expect(parseTimeInput("10:00", 0)).toBe(600);
  });

  it("treats a leading + as a relative delta from current", () => {
    expect(parseTimeInput("+0.5", 10)).toBeCloseTo(10.5, 5);
    expect(parseTimeInput("+ 2", 10)).toBeCloseTo(12, 5);
  });

  it("treats a leading - as a relative delta from current, not a literal negative", () => {
    expect(parseTimeInput("-2", 10)).toBeCloseTo(8, 5);
  });

  it("supports M:SS.s magnitudes in a relative entry", () => {
    expect(parseTimeInput("+1:00", 10)).toBeCloseTo(70, 5);
  });

  it("returns null for empty or unparseable input", () => {
    expect(parseTimeInput("", 10)).toBeNull();
    expect(parseTimeInput("   ", 10)).toBeNull();
    expect(parseTimeInput("abc", 10)).toBeNull();
    expect(parseTimeInput("+abc", 10)).toBeNull();
    expect(parseTimeInput("1:2:3", 10)).toBeNull();
  });
});
