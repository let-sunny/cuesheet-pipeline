// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExportOutputSection } from "./ExportOutputSection.js";
import type { RenderState } from "./ExportOutputSection.js";

afterEach(cleanup);

function baseProps(overrides: Partial<Parameters<typeof ExportOutputSection>[0]> = {}) {
  return {
    dirty: false,
    renderState: { status: "idle" } as RenderState,
    onOpenRenderDialog: vi.fn(),
    onDownloadSrt: vi.fn(),
    ...overrides,
  };
}

describe("ExportOutputSection", () => {
  it("shows 'Export' and calls onOpenRenderDialog when clicked", () => {
    const onOpenRenderDialog = vi.fn();
    render(<ExportOutputSection {...baseProps({ onOpenRenderDialog })} />);
    fireEvent.click(screen.getByTestId("export-button"));
    expect(onOpenRenderDialog).toHaveBeenCalledOnce();
  });

  it("shows the exporting label and disables the button while rendering", () => {
    render(<ExportOutputSection {...baseProps({ renderState: { status: "rendering", progress: 42 } })} />);
    const button = screen.getByTestId("export-button") as HTMLButtonElement;
    expect(button.textContent).toContain("Exporting… 42%");
  });

  it("shows a download link on success", () => {
    render(<ExportOutputSection {...baseProps({ renderState: { status: "success", path: "out.mp4" } })} />);
    expect(screen.getByText("Download out.mp4")).not.toBeNull();
  });

  it("shows the error message, and the detail (behind an expand toggle) only if provided", () => {
    const { rerender } = render(
      <ExportOutputSection {...baseProps({ renderState: { status: "error", error: "ffmpeg failed" } })} />,
    );
    expect(screen.getByText("Export failed: ffmpeg failed")).not.toBeNull();
    // No errorDetail -> Banner gets no children, so it renders no expand/collapse toggle at all.
    expect(screen.queryByRole("button", { name: "Expand" })).toBeNull();

    rerender(
      <ExportOutputSection
        {...baseProps({ renderState: { status: "error", error: "ffmpeg failed", errorDetail: "stack trace" } })}
      />,
    );
    // Banner's collapsible content only mounts once expanded (see Banner's dist source: `showContent
    // = hasChildren && isExpanded`) - collapsed by default, same as the old <details>/<summary>.
    expect(screen.queryByText("stack trace")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    expect(screen.getByText("stack trace")).not.toBeNull();
  });

  it("disables the srt download and shows a note while dirty", () => {
    render(<ExportOutputSection {...baseProps({ dirty: true })} />);
    const button = screen.getByTestId("export-download-srt") as HTMLButtonElement;
    expect(button.getAttribute("aria-disabled") ?? button.disabled).toBeTruthy();
    expect(screen.getByText(/save first, then download/)).not.toBeNull();
  });

  it("calls onDownloadSrt when the srt button is clicked", () => {
    const onDownloadSrt = vi.fn();
    render(<ExportOutputSection {...baseProps({ onDownloadSrt })} />);
    fireEvent.click(screen.getByTestId("export-download-srt"));
    expect(onDownloadSrt).toHaveBeenCalledOnce();
  });
});
