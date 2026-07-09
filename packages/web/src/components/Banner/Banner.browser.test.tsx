import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "@vitest/browser/context";
import { Banner } from "./Banner.js";

afterEach(cleanup);

/**
 * Browser-mode companion to the jsdom Banner.test.tsx suite - covers the restore-session banner's
 * two action buttons (App.tsx's "Continue editing" / "Discard and use saved") with real clicks and
 * real Tab-key focus movement. jsdom does not implement focus movement on Tab at all (a known jsdom
 * limitation - Tab is a no-op there), so a real Chromium tab is the only way to actually verify the
 * two actions are reachable in a sane order.
 */
describe("Banner restore-session actions (real browser)", () => {
  it("invokes only the clicked action's handler", async () => {
    const onContinue = vi.fn();
    const onDiscard = vi.fn();
    const { getByText } = render(
      <Banner
        actions={
          <>
            <button onClick={onContinue}>Continue editing</button>
            <button onClick={onDiscard}>Discard and use saved</button>
          </>
        }
      >
        You have unsaved edits from the last session.
      </Banner>,
    );

    await userEvent.click(getByText("Continue editing"));
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onDiscard).not.toHaveBeenCalled();

    await userEvent.click(getByText("Discard and use saved"));
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("reaches the primary action before the secondary one via Tab", async () => {
    const { getByText } = render(
      <Banner
        actions={
          <>
            <button>Continue editing</button>
            <button>Discard and use saved</button>
          </>
        }
      >
        Message
      </Banner>,
    );

    await userEvent.tab();
    expect(document.activeElement).toBe(getByText("Continue editing"));
    await userEvent.tab();
    expect(document.activeElement).toBe(getByText("Discard and use saved"));
  });
});
