import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "@vitest/browser/context";
import { useNumericField } from "./useNumericField.js";

afterEach(cleanup);

function NumberFieldHarness({
  initial,
  onCommit,
}: {
  initial: number;
  onCommit: (n: number) => void;
}) {
  const field = useNumericField({ value: initial, onCommit });
  return (
    <>
      <input type="number" aria-label="value" {...field} />
      {/* A second focusable element so Tab has somewhere real to move focus to, triggering blur/commit. */}
      <button type="button">elsewhere</button>
    </>
  );
}

/**
 * Browser-mode variant of the clear-then-type regression test covered under jsdom
 * (test/hooks/useNumericField.test.tsx) - this one drives a REAL `<input type="number">` through a
 * real browser's keyboard/selection/blur behavior (via the Playwright-backed `userEvent`), rather
 * than jsdom's simulated input events. Reproduces the exact bug scenario from the hook's own
 * module doc: typing "12", clearing, then typing "2.5" used to commit "12.5" because clearing fired
 * a NaN-fallback straight into (parent) state mid-edit, desyncing the DOM's actual in-progress text
 * from what React thought it had rendered.
 */
describe("useNumericField clear-then-type (real browser input)", () => {
  it("commits exactly the freshly typed value after clearing, not a mix of old and new digits", async () => {
    const commits: number[] = [];
    const { getByLabelText, getByText } = render(
      <NumberFieldHarness initial={12} onCommit={(n) => commits.push(n)} />,
    );
    const input = getByLabelText("value") as HTMLInputElement;

    await userEvent.click(input);
    await userEvent.clear(input);
    await userEvent.type(input, "2.5");
    await userEvent.click(getByText("elsewhere")); // blur -> commit

    expect(input.value).toBe("2.5");
    expect(commits).toEqual([2.5]);
  });
});
