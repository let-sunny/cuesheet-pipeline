import { test, expect } from "@playwright/test";

test("app loads and shows all 3 steps", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("step-tab-compose")).toBeVisible();
  await expect(page.getByTestId("step-tab-edit")).toBeVisible();
  await expect(page.getByTestId("step-tab-finish")).toBeVisible();

  // Starts on Compose (① Scenes) by default.
  await expect(page.getByTestId("step-tab-compose")).toHaveAttribute("aria-current", "page");

  await page.getByTestId("step-tab-edit").click();
  await expect(page.getByTestId("cut-row-0")).toBeVisible();

  await page.getByTestId("step-tab-finish").click();
  await expect(page.getByTestId("export-step")).toBeVisible();
});
