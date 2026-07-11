// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SubtitleStyle } from "@cuesheet/schema";
import { SubtitleStyleSettings } from "./SubtitleStyleSettings.js";

afterEach(cleanup);

const baseStyle: SubtitleStyle = {
  font: "Pretendard",
  size: 36,
  color: "#ffffff",
  outlineColor: "#000000",
  outlineWidth: 3,
  position: "bottom",
  margin: 40,
};

function subtitleProps() {
  return {
    value: baseStyle,
    onChange: vi.fn(),
    projectWidth: 1920,
    projectHeight: 1080,
    previewClip: undefined as string | undefined,
    previewClipTimeS: 0,
  };
}

describe("SubtitleStyleSettings", () => {
  it("renders the current font/size/color values", () => {
    render(<SubtitleStyleSettings {...subtitleProps()} />);
    expect(screen.getByDisplayValue("Pretendard")).not.toBeNull();
    expect(screen.getByDisplayValue("36")).not.toBeNull();
    expect(screen.getAllByDisplayValue("#ffffff").length).toBe(2);
  });

  it("shows the background fields only once the background box is on", () => {
    render(<SubtitleStyleSettings {...subtitleProps()} />);
    expect(screen.queryByText(/Background opacity/)).toBeNull();

    const onChange = vi.fn();
    render(
      <SubtitleStyleSettings
        {...subtitleProps()}
        onChange={onChange}
        value={{ ...baseStyle, background: { color: "#000000", opacity: 0.75, padding: 8 } }}
      />,
    );
    // The slider's value is folded into its own label (2026-07-09 diagnosed fix - avoids the
    // thumb overlapping an adjacent same-row value display near its max), so the label text
    // includes the current percentage rather than being the bare group name.
    expect(screen.getByText("Background opacity (75%)")).not.toBeNull();
  });

  it("toggling the background box on passes the default background patch", () => {
    const onChange = vi.fn();
    render(<SubtitleStyleSettings {...subtitleProps()} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Background box"));
    expect(onChange.mock.calls[0]?.[0]).toEqual({ background: { color: "#000000", opacity: 0.75, padding: 8 } });
  });

  it("disables the edge margin slider when position is center", () => {
    render(<SubtitleStyleSettings {...subtitleProps()} value={{ ...baseStyle, position: "center" }} />);
    const slider = screen.getByRole("slider", { name: /Edge margin/ });
    expect(slider.getAttribute("aria-disabled")).toBe("true");
  });

  it("shows the clip thumbnail only when a preview clip is given", () => {
    const { rerender } = render(<SubtitleStyleSettings {...subtitleProps()} />);
    expect(document.querySelector("img")).toBeNull();
    rerender(<SubtitleStyleSettings {...subtitleProps()} previewClip="cut_01.mp4" previewClipTimeS={0.3} />);
    expect(document.querySelector("img")).not.toBeNull();
  });
});
