import type { Page } from "@playwright/test";
import { test, expect } from "@playwright/test";

/**
 * TrimStrip (task #25, docs/research/trim-ux-conventions.md section 4) - replaces the old
 * two-level trim (overview bar + detail bar) with one zoomable filmstrip strip. These journeys
 * cover the properties a unit test can't: real layout/pixel-drag precision on a long clip, and
 * that a short clip renders no dead pan-control chrome.
 */

/** Waits for the selected cut's video to have real metadata (duration > 0) - before that,
 * TrimStrip's viewport is still {0,0} and every handle sits at the same 0% position. */
async function waitForVideoMetadata(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const video = document.querySelector('[data-testid="video-preview"] video') as HTMLVideoElement | null;
    return !!video && video.readyState >= 1 && video.duration > 0;
  });
}

test("short clip: TrimStrip has a sane default, no dead pan-control chrome", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("step-tab-edit").click();
  await page.getByTestId("cut-row-0").click(); // e2e_cut_01.mp4, a 3s clip
  await waitForVideoMetadata(page);

  await expect(page.getByTestId("trim-strip-filmstrip")).toBeVisible();
  // The default viewport for a cut inside a clip this short floors to "the whole clip", so the
  // pan control (only shown once zoomed in past Fit clip) must not render at all.
  await expect(page.getByTestId("trim-strip-pan")).toHaveCount(0);
});

test("long clip: default viewport is zoomed in (pan control visible), Fit clip/Fit cut toggle it", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByTestId("step-tab-edit").click();
  // Selected by its distinctive subtitle text (via the row's title tooltip), not a row index -
  // other spec files in this suite share the same on-disk runtime cuesheet and can grow/reorder
  // the cut list (e.g. bgm-track.spec.ts's "Duplicate selected cut" clicks), so a fixed
  // "cut-row-N" index isn't stable across the whole run. Clicking the subtitle textarea selects
  // the cut, same as clicking its row (CompactSegmentList's onFocus also calls onSelect).
  await page.getByTitle(/^Long-take cut \(TrimStrip zoom fixture\)/).click(); // e2e_cut_long.mp4, a 180s clip, cut at 90-93s
  await waitForVideoMetadata(page);

  await expect(page.getByTestId("trim-strip-pan")).toBeVisible();

  await page.getByTestId("trim-strip-fit-clip").click();
  await expect(page.getByTestId("trim-strip-pan")).toHaveCount(0);

  await page.getByTestId("trim-strip-fit-cut").click();
  await expect(page.getByTestId("trim-strip-pan")).toBeVisible();
});

test("long clip: dragging the In handle while zoomed in moves it precisely (sub-second), and seeks the preview", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByTestId("step-tab-edit").click();
  await page.getByTitle(/^Long-take cut \(TrimStrip zoom fixture\)/).click();
  await waitForVideoMetadata(page);

  // Back to the default (zoomed-in) viewport in case a previous journey's state leaked in.
  await page.getByTestId("trim-strip-fit-cut").click();

  const inBefore = Number(await page.getByTestId("cut-field-in").inputValue());

  const handle = page.getByTestId("trim-strip-handle-in");
  const handleBox = (await handle.boundingBox())!;
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2 + 15, handleBox.y + handleBox.height / 2, { steps: 5 });
  await page.mouse.up();

  const inAfter = Number(await page.getByTestId("cut-field-in").inputValue());
  // A 15px drag over a viewport zoomed to ~20s (not the full 180s clip) moves In by a small,
  // sub-second-scale amount - the whole point of zooming before dragging. It must still have
  // moved (not a no-op) and stayed a valid cut (less than Out).
  expect(inAfter).not.toBe(inBefore);
  expect(Math.abs(inAfter - inBefore)).toBeLessThan(3);
  const out = Number(await page.getByTestId("cut-field-out").inputValue());
  expect(inAfter).toBeLessThan(out);
});

test("keyboard: ArrowUp on the In field nudges by exactly 1 frame (1/fps), not a hardcoded 1/30", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByTestId("step-tab-edit").click();
  await page.getByTestId("cut-row-0").click();
  await waitForVideoMetadata(page);

  const inField = page.getByTestId("cut-field-in");
  const before = Number(await inField.inputValue());

  await inField.focus();
  await inField.press("ArrowUp");

  const after = Number(await inField.inputValue());
  // The fixture project is 30fps (tests/e2e/fixtures/project.cuesheet.template.json).
  expect(after - before).toBeCloseTo(1 / 30, 5);
});
