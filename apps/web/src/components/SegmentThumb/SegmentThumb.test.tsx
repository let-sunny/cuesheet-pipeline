// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { SegmentThumb } from "./SegmentThumb.js";

let ioCallback: IntersectionObserverCallback | undefined;

// jsdom doesn't implement IntersectionObserver - stub it and capture the callback so tests can
// simulate the thumbnail scrolling into view.
beforeAll(() => {
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = class {
    constructor(cb: IntersectionObserverCallback) {
      ioCallback = cb;
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(cleanup);

function fireIntersect() {
  act(() => {
    ioCallback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
  });
}

describe("SegmentThumb", () => {
  it("renders an empty placeholder before it scrolls into view", () => {
    const { container } = render(<SegmentThumb clip="cut_01.mp4" t={1} />);
    expect(container.querySelector("img")).toBeNull();
  });

  it("renders the thumbnail img once it intersects the viewport", () => {
    const { container } = render(<SegmentThumb clip="cut_01.mp4" t={1} />);
    fireIntersect();
    expect(container.querySelector("img")).not.toBeNull();
  });

  it("stays an empty placeholder without a clip filename, even once visible", () => {
    const { container } = render(<SegmentThumb clip="" t={1} />);
    fireIntersect();
    expect(container.querySelector("img")).toBeNull();
  });

  it("falls back to the empty placeholder after the thumbnail request 404s", () => {
    const { container } = render(<SegmentThumb clip="cut_01.mp4" t={1} />);
    fireIntersect();
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    act(() => {
      img!.dispatchEvent(new Event("error"));
    });
    expect(container.querySelector("img")).toBeNull();
  });

  it("appends the consumer className alongside its own base class", () => {
    const { container } = render(<SegmentThumb clip="cut_01.mp4" t={1} className="mini-strip-thumb" />);
    expect(container.firstElementChild?.className).toContain("mini-strip-thumb");
  });
});
