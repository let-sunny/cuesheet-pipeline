// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlaybackGroup } from "./PlaybackGroup.js";

afterEach(cleanup);

function numericField(value: string) {
  return { value, onChange: vi.fn(), onBlur: vi.fn(), onKeyDown: vi.fn() };
}

describe("PlaybackGroup", () => {
  it("shows the speed-cap note only when speedAtCap is true", () => {
    const { rerender } = render(
      <PlaybackGroup speedField={numericField("2")} volumeField={numericField("100")} speedAtCap={false} />,
    );
    expect(screen.queryByText(/Speed is capped at 16x/)).toBeNull();

    rerender(<PlaybackGroup speedField={numericField("16")} volumeField={numericField("100")} speedAtCap />);
    expect(screen.queryByText(/Speed is capped at 16x/)).not.toBeNull();
  });

  it("binds Speed/Volume field props to their inputs", () => {
    render(<PlaybackGroup speedField={numericField("2")} volumeField={numericField("80")} speedAtCap={false} />);
    expect(screen.getByTestId("cut-field-speed")).toHaveProperty("value", "2");
    expect(screen.getByTestId("cut-field-volume")).toHaveProperty("value", "80");
  });
});
