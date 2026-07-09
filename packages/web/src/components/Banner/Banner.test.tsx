// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Banner } from "./Banner.js";

afterEach(cleanup);

describe("Banner", () => {
  it("renders its message", () => {
    render(<Banner>Something changed</Banner>);
    expect(screen.getByText("Something changed")).not.toBeNull();
  });

  it("renders the actions slot when passed", () => {
    render(<Banner actions={<button>Reload</button>}>Something changed</Banner>);
    expect(screen.getByRole("button", { name: "Reload" })).not.toBeNull();
  });

  it("omits the actions wrapper when no actions are passed", () => {
    const { container } = render(<Banner>Something changed</Banner>);
    // Only one child (the text node) - no nested actions <div>.
    expect(container.firstElementChild?.children.length).toBe(0);
  });
});
