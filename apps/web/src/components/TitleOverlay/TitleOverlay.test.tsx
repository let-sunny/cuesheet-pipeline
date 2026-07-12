// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import type { Title } from "@cuesheet/schema";
import { TITLE_FONT_SIZE_PX, TITLE_TEXT_COLOR } from "@cuesheet/render/remotion";
import { TitleOverlay } from "./TitleOverlay.js";

// TitlePreview itself is unit-tested separately (its own frame-advance/pause/restart behavior) -
// stubbed here to a props-echoing marker so these tests can assert TitleOverlay wires the right
// content/duration/dimensions/playing/restartToken down to it, without needing to drive a real
// rAF loop from this file.
const { mockTitlePreview } = vi.hoisted(() => ({
  mockTitlePreview: vi.fn((props: Record<string, unknown>) => (
    <div
      data-testid="mock-title-preview"
      data-text={String(props.text)}
      data-preset={String(props.preset)}
      data-color={String(props.color)}
      data-font-size={String(props.fontSize)}
      data-duration-in-frames={String(props.durationInFrames)}
      data-fps={String(props.fps)}
      data-project-width={String(props.projectWidth)}
      data-project-height={String(props.projectHeight)}
      data-playing={String(props.playing)}
      data-restart-token={String(props.restartToken)}
    />
  )),
}));

vi.mock("../TitlePreview/index.js", () => ({
  TitlePreview: (props: Record<string, unknown>) => mockTitlePreview(props),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const baseTitle: Title = { text: "Cast on", preset: "typing", durationS: 2, color: "#3a3128", size: 72, highlightColor: "#a7c7e7" };

function renderOverlay(overrides: Partial<ComponentProps<typeof TitleOverlay>> = {}) {
  return render(
    <TitleOverlay title={baseTitle} projectWidth={1920} projectHeight={1080} projectFps={30} {...overrides} />,
  );
}

describe("TitleOverlay", () => {
  it("renders nothing when there is no title", () => {
    const { container } = renderOverlay({ title: undefined });
    expect(container.firstChild).toBeNull();
  });

  it("renders TitlePreview with the title's text/preset/duration and the project's dimensions/fps", () => {
    const { getByTestId } = renderOverlay({
      title: { text: "Cast on today", preset: "wordStagger", durationS: 3, color: TITLE_TEXT_COLOR, size: TITLE_FONT_SIZE_PX, highlightColor: "#a7c7e7" },
      projectWidth: 1080,
      projectHeight: 1920,
      projectFps: 24,
    });
    const preview = getByTestId("mock-title-preview");
    expect(preview.getAttribute("data-text")).toBe("Cast on today");
    expect(preview.getAttribute("data-preset")).toBe("wordStagger");
    expect(preview.getAttribute("data-color")).toBe(TITLE_TEXT_COLOR);
    expect(preview.getAttribute("data-font-size")).toBe(String(TITLE_FONT_SIZE_PX));
    expect(preview.getAttribute("data-project-width")).toBe("1080");
    expect(preview.getAttribute("data-project-height")).toBe("1920");
    expect(preview.getAttribute("data-fps")).toBe("24");
  });

  it("passes the title's own color/size through when set", () => {
    const { getByTestId } = renderOverlay({
      title: { text: "Cast on today", preset: "wordStagger", durationS: 3, color: "#ffffff", size: 90, highlightColor: "#a7c7e7" },
    });
    const preview = getByTestId("mock-title-preview");
    expect(preview.getAttribute("data-color")).toBe("#ffffff");
    expect(preview.getAttribute("data-font-size")).toBe("90");
  });

  it("computes durationInFrames from durationS * fps, rounded and clamped to at least 1", () => {
    const normal = renderOverlay({ title: { ...baseTitle, durationS: 2 }, projectFps: 30 });
    expect(normal.getByTestId("mock-title-preview").getAttribute("data-duration-in-frames")).toBe("60");
    normal.unmount();

    const tiny = renderOverlay({ title: { ...baseTitle, durationS: 0.01 }, projectFps: 30 });
    expect(tiny.getByTestId("mock-title-preview").getAttribute("data-duration-in-frames")).toBe("1");
    tiny.unmount();
  });

  it("renders a backdrop dim layer only when title.backdrop is set", () => {
    const without = renderOverlay();
    // container has just the stage (no controls of its own - the preview auto-loops).
    const overlayWithout = without.container.querySelector('[data-testid="title-overlay"]')!;
    expect(overlayWithout.children.length).toBe(1);
    without.unmount();

    const withDim = renderOverlay({ title: { ...baseTitle, backdrop: { dim: 0.5 } } });
    // container has: backdrop + stage.
    const overlayWithDim = withDim.container.querySelector('[data-testid="title-overlay"]')!;
    expect(overlayWithDim.children.length).toBe(2);
    withDim.unmount();
  });

  it("drives the auto-looping preview (always playing, never externally restarted)", () => {
    const { getByTestId } = renderOverlay();
    const preview = getByTestId("mock-title-preview");
    expect(preview.getAttribute("data-playing")).toBe("true");
    expect(preview.getAttribute("data-restart-token")).toBe("0");
  });
});
