// @vitest-environment jsdom
import { useRef } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useStickyColumnMaxHeight } from "./useStickyColumnMaxHeight.js";

afterEach(cleanup);

function Probe({ offsetTop }: { offsetTop: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const maxHeight = useStickyColumnMaxHeight(ref);
  return (
    <div
      ref={(el) => {
        ref.current = el;
        if (el) {
          Object.defineProperty(el, "offsetTop", { value: offsetTop, configurable: true });
        }
      }}
      data-testid="probe"
      data-max-height={maxHeight ?? ""}
    />
  );
}

describe("useStickyColumnMaxHeight", () => {
  it("subtracts the element's actual (pre-stick) offsetTop from the viewport height, not a fixed small constant", () => {
    window.innerHeight = 800;
    const { getByTestId } = render(<Probe offsetTop={178} />);
    // 800 - 178 (natural top, e.g. header+stepnav+timeline above the sticky column) - 20 (margin) = 602
    expect(getByTestId("probe").dataset.maxHeight).toBe("602");
  });

  it("never returns less than the minimum floor, even for a very large offsetTop", () => {
    window.innerHeight = 800;
    const { getByTestId } = render(<Probe offsetTop={900} />);
    expect(getByTestId("probe").dataset.maxHeight).toBe("200");
  });

  it("recomputes when the viewport is resized", () => {
    window.innerHeight = 800;
    const { getByTestId } = render(<Probe offsetTop={178} />);
    expect(getByTestId("probe").dataset.maxHeight).toBe("602");

    act(() => {
      window.innerHeight = 900;
      window.dispatchEvent(new Event("resize"));
    });
    expect(getByTestId("probe").dataset.maxHeight).toBe("702");
  });
});
