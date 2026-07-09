import { describe, expect, it } from "vitest";
import { findTestSelectorViolations } from "../lib/test-selector-matcher.mjs";

describe("findTestSelectorViolations", () => {
  it("flags querySelector with a class selector", () => {
    const files = [{ path: "Foo.test.tsx", content: "container.querySelector('.foo-bar')\n" }];

    expect(findTestSelectorViolations(files)).toEqual([
      "Foo.test.tsx:1: class-name DOM selection in a test (use data-testid or an ARIA role query instead)",
    ]);
  });

  it("flags querySelectorAll with a class selector", () => {
    const files = [{ path: "Foo.test.tsx", content: 'container.querySelectorAll(".row")\n' }];

    expect(findTestSelectorViolations(files)).toHaveLength(1);
  });

  it("flags getElementsByClassName", () => {
    const files = [{ path: "Foo.test.tsx", content: "container.getElementsByClassName('row')\n" }];

    expect(findTestSelectorViolations(files)).toHaveLength(1);
  });

  it("does not flag querySelector by tag name", () => {
    const files = [{ path: "Foo.test.tsx", content: 'container.querySelector("img")\n' }];

    expect(findTestSelectorViolations(files)).toEqual([]);
  });

  it("does not flag data-testid or ARIA-role queries", () => {
    const files = [
      {
        path: "Foo.test.tsx",
        content: 'container.querySelector(\'[data-testid="foo"]\')\nscreen.getByRole("button", { name: "Save" })\n',
      },
    ];

    expect(findTestSelectorViolations(files)).toEqual([]);
  });

  it("skips binary files (content === null)", () => {
    const files = [{ path: "Foo.test.tsx", content: null }];

    expect(findTestSelectorViolations(files)).toEqual([]);
  });
});
