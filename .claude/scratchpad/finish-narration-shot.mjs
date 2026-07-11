import { chromium } from "@playwright/test";

const url = "http://localhost:5199";
const outPrefix = "/Users/minseon/Code/cuesheet-pipeline/.claude/scratchpad/qa-fix-screenshots/finish-narration-enabled";

const sizes = [
  { w: 1280, h: 800, label: "1280x800" },
  { w: 1440, h: 900, label: "1440x900" },
];

const browser = await chromium.launch();
for (const { w, h, label } of sizes) {
  const context = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "networkidle" });
  await page.locator('[data-testid="step-tab-finish"]').click();
  await page.waitForTimeout(300);
  await page.getByRole("checkbox", { name: "Enable narration" }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${outPrefix}-${label}.png`, fullPage: true });
  await context.close();
}
await browser.close();
console.log("done");
