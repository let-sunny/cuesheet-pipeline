// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Title } from "@cuesheet/schema";
import {
  TitleOverlay,
  backdropOpacity,
  isTitleVisible,
  lineFadeOpacity,
  typingRevealedCount,
} from "./TitleOverlay.js";

afterEach(cleanup);

const baseTitle: Title = { text: "Cast on", preset: "typing", durationS: 2 };

describe("isTitleVisible", () => {
  it("is true only within [0, durationS]", () => {
    expect(isTitleVisible(-0.1, 2)).toBe(false);
    expect(isTitleVisible(0, 2)).toBe(true);
    expect(isTitleVisible(1, 2)).toBe(true);
    expect(isTitleVisible(2, 2)).toBe(true);
    expect(isTitleVisible(2.1, 2)).toBe(false);
  });
});

describe("backdropOpacity", () => {
  it("is 0 when dim is 0 or the title isn't visible", () => {
    expect(backdropOpacity(0, 2, 1)).toBe(0);
    expect(backdropOpacity(0.5, 2, 3)).toBe(0);
  });

  it("ramps up from 0 to the requested dim over the fade-in window", () => {
    expect(backdropOpacity(0.5, 2, 0)).toBeCloseTo(0, 5);
    // fadeT = min(durationS/2, 0.4) = 0.4 for durationS=2 -> at t=0.2 (half of fadeT), opacity is half of dim
    expect(backdropOpacity(0.5, 2, 0.2)).toBeCloseTo(0.25, 5);
    expect(backdropOpacity(0.5, 2, 0.4)).toBeCloseTo(0.5, 5);
  });

  it("holds at the requested dim during the middle, then ramps back down to 0 by durationS", () => {
    expect(backdropOpacity(0.5, 2, 1)).toBeCloseTo(0.5, 5);
    expect(backdropOpacity(0.5, 2, 2)).toBeCloseTo(0, 5);
  });
});

describe("lineFadeOpacity", () => {
  it("fades in, holds at 1, and fades out, mirroring the ASS \\fad envelope", () => {
    expect(lineFadeOpacity(2, 0)).toBeCloseTo(0, 5);
    expect(lineFadeOpacity(2, 1)).toBeCloseTo(1, 5);
    expect(lineFadeOpacity(2, 2)).toBeCloseTo(0, 5);
  });
});

describe("typingRevealedCount", () => {
  it("reveals characters proportionally to elapsed time", () => {
    expect(typingRevealedCount(4, 2, 0)).toBe(0);
    expect(typingRevealedCount(4, 2, 1)).toBe(2);
    expect(typingRevealedCount(4, 2, 2)).toBe(4);
  });

  it("never exceeds the text length", () => {
    expect(typingRevealedCount(4, 2, 999)).toBe(4);
  });
});

describe("TitleOverlay", () => {
  it("renders nothing when there is no title", () => {
    const { container } = render(<TitleOverlay title={undefined} localTimeS={0} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing once localTimeS is past durationS", () => {
    const { container } = render(<TitleOverlay title={baseTitle} localTimeS={3} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the typing preset's characters, revealing more as localTimeS advances", () => {
    const early = render(<TitleOverlay title={baseTitle} localTimeS={0.1} />);
    const earlyVisible = early.container.querySelectorAll("span span[style*='opacity: 1']").length;
    early.unmount();
    const late = render(<TitleOverlay title={baseTitle} localTimeS={1.9} />);
    const lateVisible = late.container.querySelectorAll("span span[style*='opacity: 1']").length;
    late.unmount();
    expect(lateVisible).toBeGreaterThan(earlyVisible);
  });

  it("renders an SVG stage for gooey and melt, and a canvas stage for particle", () => {
    const gooey = render(<TitleOverlay title={{ ...baseTitle, preset: "gooey" }} localTimeS={1} />);
    expect(gooey.container.querySelector("svg")).not.toBeNull();
    gooey.unmount();

    const melt = render(<TitleOverlay title={{ ...baseTitle, preset: "melt" }} localTimeS={1} />);
    expect(melt.container.querySelector("svg")).not.toBeNull();
    melt.unmount();

    const particle = render(<TitleOverlay title={{ ...baseTitle, preset: "particle" }} localTimeS={1} />);
    expect(particle.container.querySelector("canvas")).not.toBeNull();
    particle.unmount();
  });

  it("renders a backdrop dim layer only when title.backdrop is set", () => {
    const without = render(<TitleOverlay title={baseTitle} localTimeS={1} />);
    expect(without.container.querySelectorAll("div").length).toBe(2); // container + stage, no backdrop div
    without.unmount();

    const withDim = render(
      <TitleOverlay title={{ ...baseTitle, backdrop: { dim: 0.5 } }} localTimeS={1} />,
    );
    expect(withDim.container.querySelectorAll("div").length).toBe(3); // container + backdrop + stage
    withDim.unmount();
  });
});
