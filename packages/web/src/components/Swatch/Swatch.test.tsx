// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Swatch } from "./Swatch.js";

afterEach(cleanup);

describe("Swatch", () => {
  it("renders a span with the given color as its inline background", () => {
    const { container } = render(<Swatch color="red" />);
    const span = container.querySelector("span");
    expect(span).not.toBeNull();
    expect(span?.style.background).toBe("red");
  });
});
