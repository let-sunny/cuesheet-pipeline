import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateComponent, validateComponentName } from "../lib/component-template.mjs";

const templatesDir = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../templates/component");

describe("validateComponentName", () => {
  it("accepts a PascalCase name", () => {
    expect(() => validateComponentName("MyWidget")).not.toThrow();
  });

  it.each(["myWidget", "my-widget", "123Widget", "My_Widget", ""])("rejects %j", (name) => {
    expect(() => validateComponentName(name)).toThrow(/must be PascalCase/);
  });
});

describe("generateComponent", () => {
  let componentsRoot;

  beforeEach(() => {
    componentsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "new-component-"));
  });

  afterEach(() => {
    fs.rmSync(componentsRoot, { recursive: true, force: true });
  });

  it("writes the four anatomy files with placeholders substituted", () => {
    const written = generateComponent({ name: "MyWidget", componentsRoot, templatesDir });
    const dir = path.join(componentsRoot, "MyWidget");

    expect(written.slice().sort()).toEqual(
      [
        path.join(dir, "MyWidget.tsx"),
        path.join(dir, "MyWidget.styles.ts"),
        path.join(dir, "MyWidget.test.tsx"),
        path.join(dir, "index.ts"),
      ].sort(),
    );

    for (const file of written) {
      const content = fs.readFileSync(file, "utf8");
      expect(content).not.toContain("__NAME__");
      expect(content).not.toContain("__TEST_ID__");
    }

    expect(fs.readFileSync(path.join(dir, "MyWidget.tsx"), "utf8")).toContain('data-testid="my-widget"');
    expect(fs.readFileSync(path.join(dir, "MyWidget.test.tsx"), "utf8")).toContain('getByTestId("my-widget")');
    expect(fs.readFileSync(path.join(dir, "index.ts"), "utf8")).toBe('export { MyWidget } from "./MyWidget.js";\n');
  });

  it("refuses when the target folder already exists", () => {
    fs.mkdirSync(path.join(componentsRoot, "MyWidget"));
    expect(() => generateComponent({ name: "MyWidget", componentsRoot, templatesDir })).toThrow(/already exists/);
  });

  it("refuses an invalid name before touching the filesystem", () => {
    expect(() => generateComponent({ name: "my-widget", componentsRoot, templatesDir })).toThrow(/must be PascalCase/);
    expect(fs.existsSync(path.join(componentsRoot, "my-widget"))).toBe(false);
  });
});
