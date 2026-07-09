// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@cuesheet/schema";
import { ProjectMetaFields } from "./ProjectMetaFields.js";

afterEach(cleanup);

function baseProject(): Project {
  return {
    name: "My Project",
    fps: 30,
    width: 1920,
    height: 1080,
  } as Project;
}

describe("ProjectMetaFields", () => {
  it("commits a Name edit immediately (no blur needed)", () => {
    const onChange = vi.fn();
    render(<ProjectMetaFields project={baseProject()} onChange={onChange} />);
    fireEvent.change(screen.getByDisplayValue("My Project"), { target: { value: "New Name" } });
    expect(onChange).toHaveBeenCalledWith({ name: "New Name" });
  });

  it("commits FPS on blur", () => {
    const onChange = vi.fn();
    render(<ProjectMetaFields project={baseProject()} onChange={onChange} />);
    const fps = screen.getByDisplayValue("30");
    fireEvent.change(fps, { target: { value: "24" } });
    fireEvent.blur(fps);
    expect(onChange).toHaveBeenCalledWith({ fps: 24 });
  });

  it("rounds an odd Width to the nearest even number and shows a transient note", () => {
    const onChange = vi.fn();
    render(<ProjectMetaFields project={baseProject()} onChange={onChange} />);
    const width = screen.getByDisplayValue("1920");
    fireEvent.change(width, { target: { value: "1921" } });
    fireEvent.blur(width);
    expect(onChange).toHaveBeenCalledWith({ width: 1922 });
    expect(screen.getByText(/Rounded to 1922/)).not.toBeNull();
  });

  it("clears the width note on focus", () => {
    const onChange = vi.fn();
    render(<ProjectMetaFields project={baseProject()} onChange={onChange} />);
    const width = screen.getByDisplayValue("1920");
    fireEvent.change(width, { target: { value: "1921" } });
    fireEvent.blur(width);
    expect(screen.getByText(/Rounded to 1922/)).not.toBeNull();
    fireEvent.focus(width);
    expect(screen.queryByText(/Rounded to 1922/)).toBeNull();
  });

  it("commits Height on blur", () => {
    const onChange = vi.fn();
    render(<ProjectMetaFields project={baseProject()} onChange={onChange} />);
    const height = screen.getByDisplayValue("1080");
    fireEvent.change(height, { target: { value: "720" } });
    fireEvent.blur(height);
    expect(onChange).toHaveBeenCalledWith({ height: 720 });
  });

  it("shows Fade in/Fade out as 0 when fadeInS/fadeOutS are absent (an existing cuesheet)", () => {
    const onChange = vi.fn();
    render(<ProjectMetaFields project={baseProject()} onChange={onChange} />);
    expect(screen.getAllByDisplayValue("0")).toHaveLength(2);
  });

  it("commits Fade in on blur", () => {
    const onChange = vi.fn();
    render(<ProjectMetaFields project={{ ...baseProject(), fadeInS: 0 }} onChange={onChange} />);
    const [fadeIn] = screen.getAllByDisplayValue("0");
    fireEvent.change(fadeIn!, { target: { value: "1.5" } });
    fireEvent.blur(fadeIn!);
    expect(onChange).toHaveBeenCalledWith({ fadeInS: 1.5 });
  });

  it("commits Fade out on blur", () => {
    const onChange = vi.fn();
    render(<ProjectMetaFields project={{ ...baseProject(), fadeOutS: 0 }} onChange={onChange} />);
    const [, fadeOut] = screen.getAllByDisplayValue("0");
    fireEvent.change(fadeOut!, { target: { value: "2" } });
    fireEvent.blur(fadeOut!);
    expect(onChange).toHaveBeenCalledWith({ fadeOutS: 2 });
  });

  it("clamps a fade value typed above 3 down to 3", () => {
    const onChange = vi.fn();
    render(<ProjectMetaFields project={{ ...baseProject(), fadeInS: 0 }} onChange={onChange} />);
    const [fadeIn] = screen.getAllByDisplayValue("0");
    fireEvent.change(fadeIn!, { target: { value: "5" } });
    fireEvent.blur(fadeIn!);
    expect(onChange).toHaveBeenCalledWith({ fadeInS: 3 });
  });
});
