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
});
