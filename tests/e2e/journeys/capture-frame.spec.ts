import { test, expect } from "@playwright/test";

test("capture frame button triggers a PNG download", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("step-tab-edit").click();
  await page.getByTestId("cut-row-0").click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("video-control-capture-frame").click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/\.png$/);
});
