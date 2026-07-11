import { describe, expect, it } from "vitest";
import { formatMinSec, renderOutputPathFor, sanitizeFileName } from "../../../src/server/routes/fileNaming.js";

describe("sanitizeFileName", () => {
  it("replaces filesystem-unsafe characters with underscores", () => {
    expect(sanitizeFileName('a/b\\c:d*e?f"g<h>i|j')).toBe("a_b_c_d_e_f_g_h_i_j");
  });

  it("collapses internal whitespace runs to a single space and trims the ends", () => {
    expect(sanitizeFileName("  My   Project  ")).toBe("My Project");
  });

  it("falls back to 'export' when the cleaned name is empty", () => {
    expect(sanitizeFileName("   ")).toBe("export");
  });
});

describe("formatMinSec", () => {
  it("formats whole minutes and zero-padded seconds", () => {
    expect(formatMinSec(125.3)).toBe("2.05");
  });

  it("formats sub-minute values with a leading 0", () => {
    expect(formatMinSec(9.9)).toBe("0.09");
  });

  it("truncates (does not round) fractional seconds", () => {
    expect(formatMinSec(59.999)).toBe("0.59");
  });
});

describe("renderOutputPathFor", () => {
  it("builds a path under outputDir using the sanitized project name plus a timestamp suffix", () => {
    const path = renderOutputPathFor("/tmp/out", "My/Project");

    expect(path.startsWith("/tmp/out/My_Project ")).toBe(true);
    expect(path.endsWith(".mp4")).toBe(true);
  });

  it("falls back to 'export' as the base name when the project name sanitizes to empty", () => {
    const path = renderOutputPathFor("/tmp/out", "   ");

    expect(path.startsWith("/tmp/out/export ")).toBe(true);
  });
});
