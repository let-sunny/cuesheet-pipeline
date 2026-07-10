// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RangeGroup } from "./RangeGroup.js";

afterEach(cleanup);

function numericField(value: string) {
  return { value, onChange: vi.fn(), onBlur: vi.fn(), onKeyDown: vi.fn() };
}

describe("RangeGroup", () => {
  it("shows the clip filename read-only (as a title-carrying span, not an input)", () => {
    render(
      <RangeGroup
        clip="cut_01.mp4"
        lengthS={7}
        inField={numericField("2")}
        outField={numericField("9")}
        rangeError={null}
      />,
    );
    expect(screen.getByTitle("cut_01.mp4")).not.toBeNull();
  });

  it("shows the computed length", () => {
    render(
      <RangeGroup clip="a.mp4" lengthS={7} inField={numericField("2")} outField={numericField("9")} rangeError={null} />,
    );
    expect(screen.getByText("Length 7.0s")).not.toBeNull();
  });

  it("binds the In/Out numeric field props to their inputs", () => {
    render(
      <RangeGroup clip="a.mp4" lengthS={7} inField={numericField("2")} outField={numericField("9")} rangeError={null} />,
    );
    expect(screen.getByTestId("cut-field-in")).toHaveProperty("value", "2");
    expect(screen.getByTestId("cut-field-out")).toHaveProperty("value", "9");
  });

  it("shows no error state when rangeError is null (valid in/out)", () => {
    render(
      <RangeGroup clip="a.mp4" lengthS={7} inField={numericField("2")} outField={numericField("9")} rangeError={null} />,
    );
    expect(screen.queryByTestId("cut-range-error")).toBeNull();
  });

  it("shows the schema's own message inline when rangeError is set (in >= out)", () => {
    const message = "in: in must be less than out (in < out) — swap to in=30, out=100";
    render(
      <RangeGroup
        clip="a.mp4"
        lengthS={-70}
        inField={numericField("100")}
        outField={numericField("30")}
        rangeError={message}
      />,
    );
    expect(screen.getByTestId("cut-range-error").textContent).toBe(message);
    expect(screen.getByTestId("cut-range-error").getAttribute("role")).toBe("alert");
    expect(screen.getByText("Length -70.0s")).not.toBeNull();
  });
});
