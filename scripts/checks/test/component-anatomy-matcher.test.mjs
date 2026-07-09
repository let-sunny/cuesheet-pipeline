import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findComponentAnatomyViolations } from "../lib/component-anatomy-matcher.mjs";

describe("findComponentAnatomyViolations", () => {
  let componentsRoot;

  beforeEach(() => {
    componentsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "component-anatomy-"));
  });

  afterEach(() => {
    fs.rmSync(componentsRoot, { recursive: true, force: true });
  });

  it("is clean for a folder with Component.tsx + Component.test.tsx + index.ts", () => {
    writeFiles(componentsRoot, {
      "Banner/Banner.tsx": "",
      "Banner/Banner.test.tsx": "",
      "Banner/index.ts": "",
    });

    expect(findComponentAnatomyViolations(componentsRoot)).toEqual([]);
  });

  it("accepts a .browser.test.tsx in place of .test.tsx", () => {
    writeFiles(componentsRoot, {
      "Banner/Banner.tsx": "",
      "Banner/Banner.browser.test.tsx": "",
      "Banner/index.ts": "",
    });

    expect(findComponentAnatomyViolations(componentsRoot)).toEqual([]);
  });

  it("flags a missing index.ts and a missing test file", () => {
    writeFiles(componentsRoot, {
      "Banner/Banner.tsx": "",
    });

    const violations = findComponentAnatomyViolations(componentsRoot);
    expect(violations).toHaveLength(2);
    expect(violations.some((v) => v.endsWith("Banner/index.ts: missing (every component folder needs an export gate)"))).toBe(true);
    expect(
      violations.some((v) => v.endsWith("Banner/Banner.test.tsx: missing (every component folder needs a co-located test)")),
    ).toBe(true);
  });

  it("flags a flat .tsx file directly under components/", () => {
    writeFiles(componentsRoot, { "Stray.tsx": "" });

    const violations = findComponentAnatomyViolations(componentsRoot);
    expect(violations).toEqual([
      `${path.join(componentsRoot, "Stray.tsx")}: flat .tsx file directly under components/ (give it its own Component/ folder with index.ts + test)`,
    ]);
  });

  it("descends into ui/ one extra level and checks each entry as its own component folder", () => {
    writeFiles(componentsRoot, {
      "ui/ToolbarButton/ToolbarButton.tsx": "",
    });

    const violations = findComponentAnatomyViolations(componentsRoot);
    expect(violations).toHaveLength(2); // missing index.ts + missing test
  });

  it("honors testAllowlist to exempt a folder from the co-located-test requirement", () => {
    writeFiles(componentsRoot, {
      "ui/ToolbarButton/ToolbarButton.tsx": "",
      "ui/ToolbarButton/index.ts": "",
    });

    expect(
      findComponentAnatomyViolations(componentsRoot, { testAllowlist: new Set(["ui/ToolbarButton"]) }),
    ).toEqual([]);
  });

  it("ignores folders that do not hold an eponymous Component.tsx", () => {
    writeFiles(componentsRoot, {
      "Banner/helpers.ts": "",
    });

    expect(findComponentAnatomyViolations(componentsRoot)).toEqual([]);
  });
});

function writeFiles(root, files) {
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = path.join(root, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }
}
