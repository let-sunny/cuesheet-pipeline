import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
await page.goto("http://localhost:5199", { waitUntil: "networkidle" });
await page.locator('[data-testid="step-tab-finish"]').click();
await page.waitForTimeout(300);
await page.locator('[data-testid="export-section-intro-outro"]').screenshot({
  path: "/Users/minseon/Code/cuesheet-pipeline/.claude/scratchpad/qa-fix-screenshots/finish-intro-outro-crop.png",
});
await browser.close();
console.log("done");
