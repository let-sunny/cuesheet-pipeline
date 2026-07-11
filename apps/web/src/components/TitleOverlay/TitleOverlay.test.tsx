// @vitest-environment jsdom
import { forwardRef, useImperativeHandle } from "react";
import type { ComponentProps, Ref } from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Title } from "@cuesheet/schema";
import { TITLE_FONT_SIZE_PX, TITLE_TEXT_COLOR } from "@cuesheet/render/remotion";
import { TitleOverlay } from "./TitleOverlay.js";

// @remotion/player's real <Player> can't run inside jsdom (it drives a real Remotion composition
// render loop) - mocked to a stub that (a) exposes the exact props it was given (so tests can
// assert TitleOverlay wires the composition/inputProps/duration/dimensions correctly) and (b)
// exposes a PlayerRef whose methods/event-registration the restart and play/pause controls are
// asserted to call.
const { mockSeekTo, mockToggle, mockAddEventListener, mockRemoveEventListener } = vi.hoisted(() => ({
  mockSeekTo: vi.fn(),
  mockToggle: vi.fn(),
  mockAddEventListener: vi.fn(),
  mockRemoveEventListener: vi.fn(),
}));

vi.mock("@remotion/player", () => ({
  Player: forwardRef(function MockPlayer(props: Record<string, unknown>, ref: Ref<unknown>) {
    useImperativeHandle(ref, () => ({
      seekTo: mockSeekTo,
      toggle: mockToggle,
      addEventListener: mockAddEventListener,
      removeEventListener: mockRemoveEventListener,
    }));
    return (
      <div
        data-testid="mock-player"
        data-input-props={JSON.stringify(props.inputProps)}
        data-duration-in-frames={String(props.durationInFrames)}
        data-composition-width={String(props.compositionWidth)}
        data-composition-height={String(props.compositionHeight)}
        data-fps={String(props.fps)}
      />
    );
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const baseTitle: Title = { text: "Cast on", preset: "typing", durationS: 2, color: "#3a3128", size: 72 };

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

  it("runs the real TitleCard composition through the Player, with the title's text/preset/duration and the project's dimensions/fps as inputProps", () => {
    const { getByTestId } = renderOverlay({
      title: { text: "Cast on today", preset: "wordStagger", durationS: 3, color: TITLE_TEXT_COLOR, size: TITLE_FONT_SIZE_PX },
      projectWidth: 1080,
      projectHeight: 1920,
      projectFps: 24,
    });
    const player = getByTestId("mock-player");
    const inputProps = JSON.parse(player.getAttribute("data-input-props")!);
    expect(inputProps).toEqual({
      text: "Cast on today",
      preset: "wordStagger",
      durationInSeconds: 3,
      fps: 24,
      color: TITLE_TEXT_COLOR,
      fontSize: TITLE_FONT_SIZE_PX,
      width: 1080,
      height: 1920,
    });
    expect(player.getAttribute("data-composition-width")).toBe("1080");
    expect(player.getAttribute("data-composition-height")).toBe("1920");
    expect(player.getAttribute("data-fps")).toBe("24");
  });

  it("passes the title's own color/size through to the Player's inputProps when set", () => {
    const { getByTestId } = renderOverlay({
      title: { text: "Cast on today", preset: "wordStagger", durationS: 3, color: "#ffffff", size: 90 },
    });
    const player = getByTestId("mock-player");
    const inputProps = JSON.parse(player.getAttribute("data-input-props")!);
    expect(inputProps.color).toBe("#ffffff");
    expect(inputProps.fontSize).toBe(90);
  });

  it("computes durationInFrames from durationS * fps, rounded and clamped to at least 1", () => {
    const normal = renderOverlay({ title: { ...baseTitle, durationS: 2 }, projectFps: 30 });
    expect(normal.getByTestId("mock-player").getAttribute("data-duration-in-frames")).toBe("60");
    normal.unmount();

    const tiny = renderOverlay({ title: { ...baseTitle, durationS: 0.01 }, projectFps: 30 });
    expect(tiny.getByTestId("mock-player").getAttribute("data-duration-in-frames")).toBe("1");
    tiny.unmount();
  });

  it("renders a backdrop dim layer only when title.backdrop is set", () => {
    const without = renderOverlay();
    // container has: stage + controls, no backdrop div.
    const overlayWithout = without.container.querySelector('[data-testid="title-overlay"]')!;
    expect(overlayWithout.children.length).toBe(2);
    without.unmount();

    const withDim = renderOverlay({ title: { ...baseTitle, backdrop: { dim: 0.5 } } });
    // container has: backdrop + stage + controls.
    const overlayWithDim = withDim.container.querySelector('[data-testid="title-overlay"]')!;
    expect(overlayWithDim.children.length).toBe(3);
    withDim.unmount();
  });

  it("restart control calls the player's seekTo(0)", () => {
    const { getByTestId } = renderOverlay();
    fireEvent.click(getByTestId("title-preview-restart"));
    expect(mockSeekTo).toHaveBeenCalledWith(0);
  });

  it("play/pause control calls the player's toggle()", () => {
    const { getByTestId } = renderOverlay();
    fireEvent.click(getByTestId("title-preview-playpause"));
    expect(mockToggle).toHaveBeenCalledOnce();
  });

  it("registers play/pause listeners on the player and flips the toggle control's label accordingly", () => {
    const { getByTestId } = renderOverlay();
    expect(mockAddEventListener).toHaveBeenCalledWith("play", expect.any(Function));
    expect(mockAddEventListener).toHaveBeenCalledWith("pause", expect.any(Function));

    const onPause = mockAddEventListener.mock.calls.find(([name]) => name === "pause")![1] as () => void;
    const onPlay = mockAddEventListener.mock.calls.find(([name]) => name === "play")![1] as () => void;

    expect(getByTestId("title-preview-playpause").getAttribute("aria-label")).toBe("Pause title preview");
    act(() => onPause());
    expect(getByTestId("title-preview-playpause").getAttribute("aria-label")).toBe("Play title preview");
    act(() => onPlay());
    expect(getByTestId("title-preview-playpause").getAttribute("aria-label")).toBe("Pause title preview");
  });
});
