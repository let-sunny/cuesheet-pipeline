// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NarrationConfig } from "@cuesheet/schema";
import { NarrationSettings } from "./NarrationSettings.js";

afterEach(cleanup);

describe("NarrationSettings", () => {
  it("shows only the enable checkbox when narration is off/unset", () => {
    render(<NarrationSettings narration={undefined} onNarrationChange={vi.fn()} />);
    const checkbox = screen.getByLabelText("Enable narration") as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    expect(screen.queryByText(/Overall volume/)).toBeNull();
  });

  it("shows folder/volume fields once narration is enabled", () => {
    const narration: NarrationConfig = { enabled: true, dir: "media/narration", volume: 0.8 };
    render(<NarrationSettings narration={narration} onNarrationChange={vi.fn()} />);
    expect(screen.getByDisplayValue("media/narration")).not.toBeNull();
    // The slider's value is folded into its own label (2026-07-09 diagnosed fix), not a bare
    // group name.
    expect(screen.getByText("Overall volume (80%)")).not.toBeNull();
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
    expect(screen.queryByText(/Duck amount/)).toBeNull();
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
    expect(screen.getByRole("slider", { name: /Duck amount/ })).not.toBeNull();
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
    const slider = screen.getByRole("slider", { name: /Duck amount/ });
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(onNarrationChange.mock.calls[0]?.[0]).toEqual({ ducking: { amount: 0.65, fadeS: 0.3 } });
  });
});
