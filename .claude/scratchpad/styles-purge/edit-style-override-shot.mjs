import { chromium } from "@playwright/test";

const url = "http://localhost:5410";
const outDir = "/Users/minseon/Code/cuesheet-pipeline/.claude/scratchpad/styles-purge";

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
await page.goto(url, { waitUntil: "networkidle" });
await page.locator('[data-testid="step-tab-edit"]').click();
await page.waitForTimeout(800);
await page.locator('[data-testid="cut-settings-tab-effects"]').click();
await page.waitForTimeout(500);
const subtitleGroup = page.locator('[data-testid="cut-settings-group-subtitle"]');
await subtitleGroup.waitFor({ state: "visible", timeout: 10000 });
await subtitleGroup.scrollIntoViewIfNeeded();
const toggle = page.getByLabel("Custom style for this cut");
await toggle.click();
await page.waitForTimeout(400);
await subtitleGroup.screenshot({ path: `${outDir}/edit-style-override.png` });
await browser.close();
console.log("done");
