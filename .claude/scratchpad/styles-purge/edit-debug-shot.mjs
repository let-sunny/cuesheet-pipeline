import { chromium } from "@playwright/test";

const url = "http://localhost:5410";
const outDir = "/Users/minseon/Code/cuesheet-pipeline/.claude/scratchpad/styles-purge";

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
await page.goto(url, { waitUntil: "networkidle" });
await page.locator('[data-testid="step-tab-edit"]').click();
await page.waitForTimeout(1500);
await page.screenshot({ path: `${outDir}/edit-debug.png`, fullPage: true });
console.log(await page.locator("body").innerText());
await browser.close();
