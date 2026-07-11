import { test, expect } from "@playwright/test";

test("transitions group toggle reveals type/duration fields", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("step-tab-edit").click();
  await page.getByTestId("cut-row-0").click();
  // Transitions lives on the Effects tab (2026-07-11 Cut/Effects split, cut-settings-panel).
  await page.getByTestId("cut-settings-tab-effects").click();

  const group = page.getByTestId("cut-settings-group-transitions");
  await expect(group).toBeVisible();

  // CheckboxInput doesn't forward data-testid (see CLAUDE.md's testing section) - select by role/name.
  const transitionInToggle = group.getByRole("checkbox", { name: "Transition in" });
  await transitionInToggle.click();
  // Turning "Transition in" on reveals its Type/Duration row - functional evidence the toggle
  // actually did something, not just that the checkbox itself changed state.
  await expect(group.getByText("Type")).toBeVisible();
  await expect(group.getByText("Dur.")).toBeVisible();

  await transitionInToggle.click();
  await expect(group.getByText("Type")).toHaveCount(0);
});
