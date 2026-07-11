import { chromium } from "@playwright/test";

const url = "http://localhost:5410";
const outDir = "/Users/minseon/Code/cuesheet-pipeline/.claude/scratchpad/styles-purge";
const themes = ["stone", "y2k"];

const browser = await chromium.launch();
for (const theme of themes) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") console.log(`[console.error][${theme}]`, msg.text());
  });
  await page.addInitScript((themeName) => {
    localStorage.setItem("cuesheet-theme-name", themeName);
  }, theme);
  await page.goto(url, { waitUntil: "networkidle" });
  await page.locator('[data-testid="step-tab-finish"]').click();
  await page.waitForTimeout(500);
  await page.locator('[data-testid="export-step"]').waitFor({ state: "visible", timeout: 10000 });
  await page.screenshot({ path: `${outDir}/finish-${theme}.png`, fullPage: true });

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
  }));
  console.log(theme, "overflow:", JSON.stringify(overflow));

  await context.close();
}
await browser.close();
console.log("done");
