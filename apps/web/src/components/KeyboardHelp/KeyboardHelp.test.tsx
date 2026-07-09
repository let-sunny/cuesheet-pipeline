// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KeyboardHelp } from "./KeyboardHelp.js";

afterEach(cleanup);

describe("KeyboardHelp", () => {
  it("renders nothing when not visible", () => {
    const { container } = render(<KeyboardHelp visible={false} onToggle={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it("lists the shortcuts when visible", () => {
    render(<KeyboardHelp visible onToggle={() => {}} />);
    expect(screen.getByText("Play / pause")).not.toBeNull();
    expect(screen.getByText("Space")).not.toBeNull();
    expect(screen.getByText("Toggle this help panel")).not.toBeNull();
  });

  it("calls onToggle when Close is clicked", () => {
    const onToggle = vi.fn();
    render(<KeyboardHelp visible onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
