import { test, expect } from "@playwright/test";

test("open export dialog and switch resolution presets", async ({ page }) => {
  await page.goto("/");

  await page.getByTestId("header-render").click();
  const dialog = page.getByTestId("render-dialog");
  await expect(dialog).toBeVisible();

  // Fixture project is 640x360, which doesn't match any preset - shown as "(custom)". (There are
  // two "640x360"-containing lines in the dialog - the custom-resolution note and the Summary's
  // "Resolution: ..." line - so match the specific custom-resolution note, not just the substring.)
  await expect(dialog.getByText("Current setting: 640x360 (custom)")).toBeVisible();

  await page.getByTestId("render-dialog-resolution-1920x1080").click();
  await expect(dialog.getByText("Resolution: 1920x1080")).toBeVisible();

  await page.getByTestId("render-dialog-cancel").click();
  // Astryx's Dialog keeps the native <dialog> element mounted in React's tree even after closing
  // (only the inline-rendering variant unmounts on `!isOpen` - see Dialog.tsx) - it just toggles
  // the native open/showModal()/close() state, which browsers treat as not-rendered/not-visible.
  // So the correct close assertion is "not visible", not "gone from the DOM".
  await expect(dialog).not.toBeVisible();
});
