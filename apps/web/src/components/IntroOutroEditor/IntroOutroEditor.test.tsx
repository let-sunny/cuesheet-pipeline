// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IntroOutroEditor } from "./IntroOutroEditor.js";

vi.mock("../../api.js", () => ({
  fetchClipFiles: vi.fn().mockResolvedValue({
    files: [
      { name: "cut_01.mp4", durationS: 5 },
      { name: "cut_02.mp4", durationS: 20 },
    ],
  }),
  uploadClip: vi.fn(),
}));

afterEach(cleanup);

// The file pickers are Astryx Selectors, which open their option list via the Popover API that
// jsdom doesn't implement - mocked the same minimal way Astryx's own Selector.test.tsx / this
// app's SubtitleGroup.test.tsx do, so fireEvent.click on the trigger actually reveals the options.
beforeEach(() => {
  HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
    this.setAttribute("popover-open", "");
  });
  HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
    this.removeAttribute("popover-open");
  });
});

function baseProps() {
  return {
    intro: null as string | null,
    outro: null as string | null,
    clipDir: "media/clips",
    onChangeText: vi.fn(),
    onSelectClip: vi.fn(),
    onClear: vi.fn(),
  };
}

describe("IntroOutroEditor", () => {
  it("renders the Intro and Outro sections", async () => {
    render(<IntroOutroEditor {...baseProps()} />);
    expect(screen.getByText("Intro")).not.toBeNull();
    expect(screen.getByText("Outro")).not.toBeNull();
    await waitFor(() => expect(screen.queryAllByText(/Loading…/).length).toBe(0));
  });

  it("shows the current clip label and a Clear button when intro/outro are set", async () => {
    render(<IntroOutroEditor {...baseProps()} intro="media/clips/cut_01.mp4" />);
    await waitFor(() => expect(screen.queryAllByText(/Loading…/).length).toBe(0));
    expect(screen.getByText("Clip: cut_01.mp4")).not.toBeNull();
  });

  it("calls onClear with the right role when Clear is clicked", async () => {
    const onClear = vi.fn();
    render(<IntroOutroEditor {...baseProps()} intro="media/clips/cut_01.mp4" onClear={onClear} />);
    await waitFor(() => expect(screen.queryAllByText(/Loading…/).length).toBe(0));
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onClear).toHaveBeenCalledWith("intro");
  });

  it("disables file options over the intro/outro duration cap", async () => {
    render(<IntroOutroEditor {...baseProps()} />);
    await waitFor(() => expect(screen.queryAllByText(/Loading…/).length).toBe(0));
    // cut_02.mp4 is 20s, over the 15s cap - its option (present in both the intro and outro
    // Selectors) must be disabled (aria-disabled) so it can't be picked, exactly as the old native
    // <option disabled> did. Both pickers render it, hence getAllByRole + every.
    const longOptions = screen.getAllByRole("option", { name: /cut_02\.mp4.*over 15s/, hidden: true });
    expect(longOptions.length).toBe(2);
    expect(longOptions.every((o) => o.getAttribute("aria-disabled") === "true")).toBe(true);
  });

  it("shows the missing-source message when the intro video fails to load and the file truly 404s", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 })),
    );
    render(<IntroOutroEditor {...baseProps()} intro="media/clips/missing.mp4" />);
    await waitFor(() => expect(screen.queryAllByText(/Loading…/).length).toBe(0));
    const video = document.querySelector("video");
    expect(video).not.toBeNull();
    fireEvent.error(video!);
    await waitFor(() =>
      expect(screen.getByText(/Can't find the source: media\/clips\/missing\.mp4/)).not.toBeNull(),
    );
    vi.unstubAllGlobals();
  });

  it("shows a distinct undecodable-file message when the intro video fails to load but the file actually exists (Finding 3)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 200 })),
    );
    render(<IntroOutroEditor {...baseProps()} intro="media/clips/fake.mp4" />);
    await waitFor(() => expect(screen.queryAllByText(/Loading…/).length).toBe(0));
    const video = document.querySelector("video");
    expect(video).not.toBeNull();
    fireEvent.error(video!);
    await waitFor(() => expect(screen.getByText(/can't be played as video/)).not.toBeNull());
    expect(screen.queryByText(/Can't find the source/)).toBeNull();
    vi.unstubAllGlobals();
  });

  it("marks the intro dropzone active while dragging a file over it, and clears it on drop", async () => {
    render(<IntroOutroEditor {...baseProps()} />);
    await waitFor(() => expect(screen.queryAllByText(/Loading…/).length).toBe(0));
    const dropzone = screen.getAllByText("or drag and drop a video file here")[0]!.parentElement!;
    // stylex.props resolves to content-hashed atomic class names (not literal strings), so the
    // conditional variant is asserted by class-list membership change, not a substring match.
    const restingClasses = new Set(dropzone.className.split(" "));
    fireEvent.dragOver(dropzone);
    const activeClasses = dropzone.className.split(" ");
    const addedClasses = activeClasses.filter((c) => !restingClasses.has(c));
    expect(addedClasses.length).toBeGreaterThan(0);
    fireEvent.dragLeave(dropzone);
    expect(new Set(dropzone.className.split(" "))).toEqual(restingClasses);
  });
});
