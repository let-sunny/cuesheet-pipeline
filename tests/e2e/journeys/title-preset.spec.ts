import { test, expect } from "@playwright/test";

test("set title preset, and the preview overlay appears", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("step-tab-edit").click();
  await page.getByTestId("cut-row-0").click();
  // Title lives on the Effects tab (2026-07-11 Cut/Effects split, cut-settings-panel).
  await page.getByTestId("cut-settings-tab-effects").click();

  await expect(page.getByTestId("title-overlay")).toHaveCount(0);

  // CheckboxInput doesn't forward data-testid (see CLAUDE.md's testing section) - select by role/name.
  await page.getByRole("checkbox", { name: "Title card for this cut" }).click();
  await expect(page.getByTestId("title-overlay")).toBeVisible();

  await page.getByTestId("cut-field-title-preset").selectOption("highlight");
  await expect(page.getByTestId("title-overlay")).toBeVisible();
});
