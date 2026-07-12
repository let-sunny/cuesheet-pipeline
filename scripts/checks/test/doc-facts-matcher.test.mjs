import { describe, expect, it } from "vitest";
import { findDocScriptViolations } from "../lib/doc-facts-matcher.mjs";

const SCRIPTS = ["build", "test", "episode", "check:repo", "token-usage", "e2e", "e2e:ui"];

describe("findDocScriptViolations", () => {
  it("is clean when every pnpm script named is real", () => {
    const docs = [{ path: "README.md", text: "Run `pnpm episode <folder>`, then `pnpm check:repo` and `pnpm e2e:ui`." }];
    expect(findDocScriptViolations(docs, SCRIPTS)).toEqual([]);
  });

  it("skips flag forms (pnpm -r build, pnpm --filter X test)", () => {
    const docs = [{ path: "d.md", text: "`pnpm -r build` and `pnpm --filter @cuesheet/web test`" }];
    expect(findDocScriptViolations(docs, SCRIPTS)).toEqual([]);
  });

  it("allows pnpm builtins (install, exec, dlx)", () => {
    const docs = [{ path: "d.md", text: "`pnpm install`, then `pnpm exec astryx agent-docs`" }];
    expect(findDocScriptViolations(docs, SCRIPTS)).toEqual([]);
  });

  it("flags a pnpm script that isn't a root script", () => {
    const docs = [{ path: "docs/USER-GUIDE.md", text: "Run `pnpm epsiode <folder>` to start." }];
    const violations = findDocScriptViolations(docs, SCRIPTS);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/pnpm epsiode.*not a root package.json script/);
  });

  it("checks each doc independently and reports the offending file", () => {
    const docs = [
      { path: "ok.md", text: "`pnpm build`" },
      { path: "bad.md", text: "`pnpm nope`" },
    ];
    const violations = findDocScriptViolations(docs, SCRIPTS);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/^bad\.md:/);
  });

  it("handles hyphenated and colon script names", () => {
    const docs = [{ path: "d.md", text: "`pnpm token-usage` and `pnpm check:repo`" }];
    expect(findDocScriptViolations(docs, SCRIPTS)).toEqual([]);
  });
});
