// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActionsGroup } from "./ActionsGroup.js";

afterEach(cleanup);

function baseProps(overrides: Partial<Parameters<typeof ActionsGroup>[0]> = {}) {
  return {
    mergeEligibility: { eligible: true } as const,
    onMergeNext: vi.fn(),
    onSplit: vi.fn(),
    onDuplicate: vi.fn(),
    onSetIntro: vi.fn(),
    onSetOutro: vi.fn(),
    tooLongForIntroOutro: false,
    introOutroDisabledTitle: null,
    ...overrides,
  };
}

describe("ActionsGroup", () => {
  it("disables Merge with next cut when ineligible, showing the reason as its tooltip", () => {
    render(<ActionsGroup {...baseProps({ mergeEligibility: { eligible: false, reason: "Only one cut left" } })} />);
    const button = screen.getByText("Merge with next cut").closest("button")!;
    expect(button.getAttribute("aria-disabled")).toBe("true");
  });

  it("disables Set as intro/outro when the clip is too long for it", () => {
    render(<ActionsGroup {...baseProps({ tooLongForIntroOutro: true })} />);
    expect(screen.getByText("Set as intro").closest("button")!.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText("Set as outro").closest("button")!.getAttribute("aria-disabled")).toBe("true");
  });

  it("calls each action's handler", () => {
    const onSplit = vi.fn();
    const onMergeNext = vi.fn();
    const onDuplicate = vi.fn();
    const onSetIntro = vi.fn();
    const onSetOutro = vi.fn();
    render(
      <ActionsGroup {...baseProps({ onSplit, onMergeNext, onDuplicate, onSetIntro, onSetOutro })} />,
    );
    fireEvent.click(screen.getByTestId("cut-action-split"));
    fireEvent.click(screen.getByTestId("cut-action-merge"));
    fireEvent.click(screen.getByTestId("cut-action-duplicate"));
    fireEvent.click(screen.getByTestId("cut-action-set-intro"));
    fireEvent.click(screen.getByTestId("cut-action-set-outro"));
    expect(onSplit).toHaveBeenCalledOnce();
    expect(onMergeNext).toHaveBeenCalledOnce();
    expect(onDuplicate).toHaveBeenCalledOnce();
    expect(onSetIntro).toHaveBeenCalledOnce();
    expect(onSetOutro).toHaveBeenCalledOnce();
  });
});
