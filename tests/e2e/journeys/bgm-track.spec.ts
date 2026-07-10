import type { Page } from "@playwright/test";
import { test, expect } from "@playwright/test";

test("add a BGM track, the gutter bar appears, and its settings panel opens", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("step-tab-edit").click();

  await expect(page.getByTestId("bgm-bar-0")).toHaveCount(0);
  await expect(page.getByTestId("bgm-settings-panel")).toHaveCount(0);

  await page.getByTestId("bgm-add-track").click();

  await expect(page.getByTestId("bgm-bar-0")).toBeVisible();
  await expect(page.getByTestId("bgm-settings-panel")).toBeVisible();
  await expect(page.getByTestId("bgm-field-volume")).toHaveValue("100");
});

// Raw page.mouse.move/down/up (needed here for a custom drag gesture - a plain .click() won't do)
// operate on absolute viewport coordinates and do *not* auto-scroll the way locator actions
// (.click(), .hover()) do, so any row this test targets must be scrolled into view first -
// otherwise its boundingBox() coordinates can land partially or fully outside the viewport,
// where synthetic mouse events aren't reliably delivered to the right element. This only
// started to matter once the cut list grew tall enough (2026-07-10 13-inch density pass, see
// docs/screen-spec.md - CompactSegmentList rows moved their time/actions onto a second line,
// making each row taller) for row 4+ to fall outside the default 1280x720 test viewport.
async function rowCenter(page: Page, i: number): Promise<{ x: number; y: number }> {
  const locator = page.getByTestId(`cut-row-${i}`);
  await locator.scrollIntoViewIfNeeded();
  const box = (await locator.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test("a new track starts at cut 1, and its bar can be dragged (default placement + drag reliability)", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("step-tab-edit").click();

  // Grow the cut list (the fixture ships 3 cuts) so there's room below/around the default
  // track's span to drag into - "Duplicate selected cut" always duplicates the currently-selected
  // cut right after itself, so repeatedly clicking it grows the list regardless of which cut is
  // selected. 4 duplicates -> 7 cuts (rows 0-6).
  for (let i = 0; i < 4; i += 1) {
    await page.getByTestId("cut-list-add").click();
  }
  await expect(page.getByTestId("cut-row-6")).toBeVisible();

  await page.getByTestId("bgm-add-track").click();

  // Default placement (2026-07-09 fix): a new track always starts at cut 1 - previously it
  // anchored to whichever cut happened to be selected, so it could start mid-list instead.
  await expect(page.getByTestId("bgm-field-start")).toHaveValue("1");

  // Alignment regression guard (2026-07-10 fix): the bar's top edge must sit flush with its
  // covered row's top edge (cut 1 = row 0 here). Before the fix, the bar rendered a large
  // constant offset below every row it covered (a stale offsetTop-vs-gutter-containing-block
  // coordinate mismatch - see CompactSegmentList.tsx's measureRows comment), so this would have
  // failed regardless of which row the track actually started at.
  const row0Top = (await page.getByTestId("cut-row-0").boundingBox())!.y;
  const bar0TopAtCut1 = (await page.getByTestId("bgm-bar-0").boundingBox())!.y;
  expect(Math.abs(bar0TopAtCut1 - row0Top)).toBeLessThanOrEqual(1);

  // Drag the end handle down to cut row 4 (index 4, cut 5) - the range readout should extend.
  const endHandle = page.getByTestId("bgm-bar-0-handle-end");
  await endHandle.scrollIntoViewIfNeeded();
  const handleBox = (await endHandle.boundingBox())!;
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  const target1 = await rowCenter(page, 4);
  await page.mouse.move(target1.x, target1.y, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId("bgm-field-end")).toHaveValue("5");

  // Drag the whole bar (its body, not a handle) further down - both Start and End should shift
  // together, keeping the same span length. Grabbed at the bar's own vertical center (well clear
  // of the 9px resize handles at its top/bottom edges) and moved down by ~2 row-heights, computed
  // from an actual row's rendered height rather than assumed - this only asserts the values moved
  // in the right direction (not exact row numbers), since the precise row a given pixel offset
  // lands on depends on rendered row height, which isn't this test's concern.
  const startBefore = Number(await page.getByTestId("bgm-field-start").inputValue());
  const endBefore = Number(await page.getByTestId("bgm-field-end").inputValue());

  // Scroll the bottommost row into view first so the drag target (2 row-heights below the bar,
  // computed below) is guaranteed to land inside the viewport too - see rowCenter's comment above
  // on why raw page.mouse coordinates need this.
  await page.getByTestId("cut-row-6").scrollIntoViewIfNeeded();
  const bar = page.getByTestId("bgm-bar-0");
  const barBox = (await bar.boundingBox())!;
  const rowHeight = (await page.getByTestId("cut-row-0").boundingBox())!.height;
  const grabX = barBox.x + barBox.width / 2;
  const grabY = barBox.y + barBox.height / 2;
  await page.mouse.move(grabX, grabY);
  await page.mouse.down();
  await page.mouse.move(grabX, grabY + rowHeight * 2, { steps: 5 });
  await page.mouse.up();

  const startAfter = Number(await page.getByTestId("bgm-field-start").inputValue());
  const endAfter = Number(await page.getByTestId("bgm-field-end").inputValue());
  expect(startAfter).toBeGreaterThan(startBefore);
  expect(endAfter - startAfter).toBe(endBefore - startBefore);

  // Mid-list alignment (same regression guard as the cut-1 case above, now for a track that no
  // longer starts at cut 1): the bar's top must still track its actual covered row exactly, not
  // just the original default position.
  const midListRowIdx = startAfter - 1; // "Start" field is 1-based, row testids are 0-based.
  const midRow = page.getByTestId(`cut-row-${midListRowIdx}`);
  await midRow.scrollIntoViewIfNeeded();
  const midRowTop = (await midRow.boundingBox())!.y;
  const barTopMidList = (await bar.boundingBox())!.y;
  expect(Math.abs(barTopMidList - midRowTop)).toBeLessThanOrEqual(1);
});
