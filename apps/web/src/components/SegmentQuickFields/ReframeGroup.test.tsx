// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReframeGroup } from "./ReframeGroup.js";

afterEach(cleanup);

describe("ReframeGroup", () => {
  it("shows 'Not applied' and no Clear button when there's no crop", () => {
    render(<ReframeGroup hasCrop={false} onEditCrop={vi.fn()} onClearCrop={vi.fn()} />);
    expect(screen.getByText("Not applied")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Reframe" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
  });

  it("shows 'Applied' and a Clear button once a crop is applied", () => {
    render(<ReframeGroup hasCrop onEditCrop={vi.fn()} onClearCrop={vi.fn()} />);
    expect(screen.getByText("Applied")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Adjust again" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Clear" })).not.toBeNull();
  });

  it("calls onEditCrop/onClearCrop", () => {
    const onEditCrop = vi.fn();
    const onClearCrop = vi.fn();
    render(<ReframeGroup hasCrop onEditCrop={onEditCrop} onClearCrop={onClearCrop} />);
    fireEvent.click(screen.getByRole("button", { name: "Adjust again" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onEditCrop).toHaveBeenCalledOnce();
    expect(onClearCrop).toHaveBeenCalledOnce();
  });
});
