import { describe, expect, it } from "vitest";
import { formatStartupBanner } from "../src/banner.js";

const TOOLS = ["get_cuesheet", "update_cuesheet", "validate_cuesheet"];

describe("formatStartupBanner", () => {
  it("reports version, mode, resolved path, and the tool count/names", () => {
    const banner = formatStartupBanner({
      cuesheetPath: "/abs/project.cuesheet.json",
      toolNames: TOOLS,
      version: "1.2.3",
      readOnly: false,
    });
    expect(banner).toContain("cuesheet-bridge v1.2.3 (read-write)");
    expect(banner).toContain("editing: /abs/project.cuesheet.json");
    expect(banner).toContain(`tools (${TOOLS.length}): get_cuesheet, update_cuesheet, validate_cuesheet`);
  });

  it("labels read-only mode", () => {
    const banner = formatStartupBanner({ cuesheetPath: "/x.json", toolNames: TOOLS, version: "0.0.0", readOnly: true });
    expect(banner).toContain("(read-only)");
  });

  it("carries the restart-after-rebuild reminder", () => {
    const banner = formatStartupBanner({ cuesheetPath: "/x.json", toolNames: TOOLS, version: "0.0.0", readOnly: false });
    expect(banner).toMatch(/restart this bridge after any .*pnpm -r build/);
  });
});
