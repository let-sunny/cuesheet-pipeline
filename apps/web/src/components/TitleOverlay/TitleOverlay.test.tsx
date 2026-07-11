// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Title } from "@cuesheet/schema";
import { TitleOverlay, backdropOpacity, isTitleVisible, typingRevealedCount } from "./TitleOverlay.js";

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

describe("typingRevealedCount", () => {
  it("reveals characters at a fixed fast pace (2/30s each), completing early then holding", () => {
    // Matches the render's CHAR_FRAMES=2 pace: ~15 chars/sec, independent of the title duration.
    expect(typingRevealedCount(4, 2, 0)).toBe(0);
    expect(typingRevealedCount(4, 2, 2 / 30)).toBe(1); // one char after 2 frames
    expect(typingRevealedCount(4, 2, 8 / 30)).toBe(4); // all four revealed by ~0.27s
    expect(typingRevealedCount(4, 2, 1)).toBe(4); // and held for the rest of the duration
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

  it("renders the typing preset's characters via string slicing, revealing more as localTimeS advances", () => {
    const early = render(<TitleOverlay title={baseTitle} localTimeS={0.1} />);
    const earlyText = early.container.querySelector('[data-testid="title-overlay"]')?.textContent ?? "";
    early.unmount();
    const late = render(<TitleOverlay title={baseTitle} localTimeS={1.9} />);
    const lateText = late.container.querySelector('[data-testid="title-overlay"]')?.textContent ?? "";
    late.unmount();
    expect(lateText.length).toBeGreaterThan(earlyText.length);
    expect(baseTitle.text.startsWith(lateText)).toBe(true);
  });

  it("renders the fade preset's text", () => {
    const { container } = render(<TitleOverlay title={{ ...baseTitle, preset: "fade" }} localTimeS={1} />);
    expect(container.textContent).toContain("Cast on");
  });

  it("renders one span per word for the wordStagger preset", () => {
    const { container } = render(
      <TitleOverlay title={{ ...baseTitle, text: "Cast on today", preset: "wordStagger" }} localTimeS={1} />,
    );
    // Words are separate sibling spans laid out with a CSS flex gap (no space character in the
    // DOM text itself), so each word's own span is queried individually rather than reading
    // container.textContent as one string.
    const words = Array.from(container.querySelectorAll("[data-testid='title-overlay'] div > span")).map(
      (el) => el.textContent,
    );
    expect(words).toEqual(["Cast", "on", "today"]);
  });

  it("renders a pastel marker behind the last word for the highlight preset", () => {
    const { container } = render(
      <TitleOverlay title={{ ...baseTitle, text: "Cast on", preset: "highlight" }} localTimeS={1} />,
    );
    expect(container.textContent).toBe("Caston");
    // jsdom normalizes the inline hex color to rgb() - #A7C7E7 === rgb(167, 199, 231).
    expect(container.innerHTML).toContain("rgb(167, 199, 231)");
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
