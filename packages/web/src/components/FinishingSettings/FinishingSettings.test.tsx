// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NarrationConfig, SubtitleStyle } from "@cuesheet/schema";
import { NarrationSettings, SubtitleStyleSettings } from "./FinishingSettings.js";

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
    subtitleStyle: baseStyle,
    onSubtitleStyleChange: vi.fn(),
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
    expect(screen.queryByText("Background opacity")).toBeNull();

    const onChange = vi.fn();
    render(
      <SubtitleStyleSettings
        {...subtitleProps()}
        onSubtitleStyleChange={onChange}
        subtitleStyle={{ ...baseStyle, background: { color: "#000000", opacity: 0.75, padding: 8 } }}
      />,
    );
    expect(screen.getByText("Background opacity")).not.toBeNull();
  });

  it("toggling the background box on passes the default background patch", () => {
    const onChange = vi.fn();
    render(<SubtitleStyleSettings {...subtitleProps()} onSubtitleStyleChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Background box"));
    expect(onChange.mock.calls[0]?.[0]).toEqual({ background: { color: "#000000", opacity: 0.75, padding: 8 } });
  });

  it("disables the edge margin slider when position is center", () => {
    render(<SubtitleStyleSettings {...subtitleProps()} subtitleStyle={{ ...baseStyle, position: "center" }} />);
    const slider = screen.getByRole("slider", { name: "Edge margin" });
    expect(slider.getAttribute("aria-disabled")).toBe("true");
  });

  it("shows the clip thumbnail only when a preview clip is given", () => {
    const { rerender } = render(<SubtitleStyleSettings {...subtitleProps()} />);
    expect(document.querySelector("img")).toBeNull();
    rerender(<SubtitleStyleSettings {...subtitleProps()} previewClip="cut_01.mp4" previewClipTimeS={0.3} />);
    expect(document.querySelector("img")).not.toBeNull();
  });
});

describe("NarrationSettings", () => {
  it("shows only the enable checkbox when narration is off/unset", () => {
    render(<NarrationSettings narration={undefined} onNarrationChange={vi.fn()} />);
    const checkbox = screen.getByLabelText("Enable narration") as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    expect(screen.queryByText("Overall volume")).toBeNull();
  });

  it("shows folder/volume fields once narration is enabled", () => {
    const narration: NarrationConfig = { enabled: true, dir: "media/narration", volume: 0.8 };
    render(<NarrationSettings narration={narration} onNarrationChange={vi.fn()} />);
    expect(screen.getByDisplayValue("media/narration")).not.toBeNull();
    expect(screen.getByText("Overall volume")).not.toBeNull();
  });

  it("calls onNarrationChange when the enable checkbox is toggled", () => {
    const onNarrationChange = vi.fn();
    render(<NarrationSettings narration={undefined} onNarrationChange={onNarrationChange} />);
    fireEvent.click(screen.getByLabelText("Enable narration"));
    expect(onNarrationChange.mock.calls[0]?.[0]).toEqual({ enabled: true });
  });

  it("shows the ducking toggle once narration is enabled, off by default, with no amount/fade fields", () => {
    const narration: NarrationConfig = { enabled: true, dir: "media/narration", volume: 0.8 };
    render(<NarrationSettings narration={narration} onNarrationChange={vi.fn()} />);
    const toggle = screen.getByLabelText("Duck background music during narration") as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    expect(screen.queryByText("Duck amount")).toBeNull();
    expect(screen.queryByText("Fade duration (s)")).toBeNull();
  });

  it("turning the ducking toggle on patches in the schema defaults (amount 0.6, fadeS 0.3)", () => {
    const narration: NarrationConfig = { enabled: true, dir: "media/narration", volume: 0.8 };
    const onNarrationChange = vi.fn();
    render(<NarrationSettings narration={narration} onNarrationChange={onNarrationChange} />);
    fireEvent.click(screen.getByLabelText("Duck background music during narration"));
    expect(onNarrationChange.mock.calls[0]?.[0]).toEqual({ ducking: { amount: 0.6, fadeS: 0.3 } });
  });

  it("turning the ducking toggle off clears the ducking field", () => {
    const narration: NarrationConfig = {
      enabled: true,
      dir: "media/narration",
      volume: 0.8,
      ducking: { amount: 0.6, fadeS: 0.3 },
    };
    const onNarrationChange = vi.fn();
    render(<NarrationSettings narration={narration} onNarrationChange={onNarrationChange} />);
    fireEvent.click(screen.getByLabelText("Duck background music during narration"));
    expect(onNarrationChange.mock.calls[0]?.[0]).toEqual({ ducking: undefined });
  });

  it("shows amount/fade fields with their current values once ducking is on", () => {
    const narration: NarrationConfig = {
      enabled: true,
      dir: "media/narration",
      volume: 0.8,
      ducking: { amount: 0.9, fadeS: 0.5 },
    };
    render(<NarrationSettings narration={narration} onNarrationChange={vi.fn()} />);
    expect(screen.getByRole("slider", { name: "Duck amount" })).not.toBeNull();
    expect(screen.getByDisplayValue("0.5")).not.toBeNull();
  });

  it("changing the duck amount slider patches only the amount", () => {
    const narration: NarrationConfig = {
      enabled: true,
      dir: "media/narration",
      volume: 0.8,
      ducking: { amount: 0.6, fadeS: 0.3 },
    };
    const onNarrationChange = vi.fn();
    render(<NarrationSettings narration={narration} onNarrationChange={onNarrationChange} />);
    const slider = screen.getByRole("slider", { name: "Duck amount" });
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(onNarrationChange.mock.calls[0]?.[0]).toEqual({ ducking: { amount: 0.65, fadeS: 0.3 } });
  });
});
