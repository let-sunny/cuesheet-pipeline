import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Title } from "@cuesheet/schema";
import { TitleOverlay } from "./TitleOverlay.js";

afterEach(cleanup);

const particleTitle: Title = { text: "Cast on", preset: "particle", durationS: 2 };

/**
 * Browser-mode companion to the jsdom TitleOverlay.test.tsx suite - the particle preset draws to a
 * real `<canvas>` 2D context (packages/web/src/components/TitleOverlay/TitleOverlay.tsx's
 * ParticleTitle), which jsdom cannot exercise at all ("Not implemented: HTMLCanvasElement's
 * getContext() method", visible as stderr noise in the jsdom run) - the existing test only checks
 * that a `<canvas>` element exists, not that anything was actually drawn. This mounts in a real
 * Chromium tab so the canvas draw effect actually runs, then reads the pixels back to confirm the
 * particle animation paints something once progress has advanced.
 */
describe("TitleOverlay particle preset (real <canvas>)", () => {
  it("draws non-transparent pixels once progress has advanced", async () => {
    const { container } = render(<TitleOverlay title={particleTitle} localTimeS={1.5} />);
    const canvas = container.querySelector("canvas");
    expect(canvas).not.toBeNull();

    // The draw effect runs in a useEffect after mount/paint - give it a tick.
    await vi.waitFor(() => {
      const ctx = canvas!.getContext("2d")!;
      const { data } = ctx.getImageData(0, 0, canvas!.width, canvas!.height);
      let nonTransparentPixels = 0;
      for (let i = 3; i < data.length; i += 4) {
        if ((data[i] ?? 0) > 0) {
          nonTransparentPixels += 1;
        }
      }
      expect(nonTransparentPixels).toBeGreaterThan(0);
    });
  });
});
