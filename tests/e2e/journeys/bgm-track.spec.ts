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
