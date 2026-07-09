import { test, expect } from "@playwright/test";

test("select cut, edit its subtitle inline, then undo reverts it", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("step-tab-edit").click();

  const row = page.getByTestId("cut-row-0");
  await row.click();
  // Selecting a cut drives the video preview's context header to that cut's number - a functional
  // signal of selection, not a class-name probe (CLAUDE.md: select by testid/role, never class).
  await expect(page.getByTestId("video-context-index")).toHaveText("#1");

  const subtitleInput = page.getByTestId("cut-row-subtitle-0");
  await expect(subtitleInput).toHaveValue("First cut");

  await subtitleInput.fill("First cut, edited");
  await expect(subtitleInput).toHaveValue("First cut, edited");

  await page.getByTestId("header-undo").click();
  await expect(subtitleInput).toHaveValue("First cut");
});
