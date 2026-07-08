// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { isBlockingOverlayOpen, useBlockingOverlay } from "../../src/lib/modalStack.js";

describe("modalStack (blocking overlay registry)", () => {
  it("starts closed", () => {
    expect(isBlockingOverlayOpen()).toBe(false);
  });

  it("reports open while a registrant's isOpen is true, and closed after it flips back to false", () => {
    const { rerender, unmount } = renderHook(({ isOpen }) => useBlockingOverlay(isOpen), {
      initialProps: { isOpen: false },
    });
    expect(isBlockingOverlayOpen()).toBe(false);

    rerender({ isOpen: true });
    expect(isBlockingOverlayOpen()).toBe(true);

    rerender({ isOpen: false });
    expect(isBlockingOverlayOpen()).toBe(false);

    unmount();
    expect(isBlockingOverlayOpen()).toBe(false);
  });

  it("supports more than one open registrant at once without an early close clobbering the other", () => {
    const a = renderHook(({ isOpen }) => useBlockingOverlay(isOpen), { initialProps: { isOpen: true } });
    const b = renderHook(({ isOpen }) => useBlockingOverlay(isOpen), { initialProps: { isOpen: true } });
    expect(isBlockingOverlayOpen()).toBe(true);

    a.unmount();
    expect(isBlockingOverlayOpen()).toBe(true); // b is still open

    b.unmount();
    expect(isBlockingOverlayOpen()).toBe(false);
  });

  it("decrements on unmount even if isOpen was never flipped back to false first", () => {
    const { unmount } = renderHook(() => useBlockingOverlay(true));
    expect(isBlockingOverlayOpen()).toBe(true);

    unmount();
    expect(isBlockingOverlayOpen()).toBe(false);
  });
});
