// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TitlePreview } from "./TitlePreview.js";
import type { TitlePreviewProps } from "./TitlePreview.js";

afterEach(cleanup);

const baseProps: TitlePreviewProps = {
  text: "Cast on today",
  preset: "fade",
  color: "#3a3128",
  fontSize: 72,
  frame: 0,
  durationInFrames: 300,
  fps: 30,
  projectWidth: 1920,
  projectHeight: 1080,
};

describe("TitlePreview", () => {
  it("renders the real TitleCardView composition (the title's text appears in the DOM)", () => {
    render(<TitlePreview {...baseProps} />);
    expect(screen.getByTestId("title-preview")).not.toBeNull();
    expect(screen.getByText("Cast on today")).not.toBeNull();
  });

  it("renders exactly the frame it is given (the typing preset reveals more at a later frame)", () => {
    // Frame is fully controlled now (no internal clock). Frame 0: nothing revealed yet.
    const { rerender } = render(<TitlePreview {...baseProps} preset="typing" durationInFrames={60} frame={0} />);
    expect(screen.queryByText("Cast on today")).toBeNull();

    // Frame 15 of 60 reveals partway through -> "Cast on" is on screen.
    rerender(<TitlePreview {...baseProps} preset="typing" durationInFrames={60} frame={15} />);
    expect(screen.getByText("Cast on", { exact: false })).not.toBeNull();
  });
});
