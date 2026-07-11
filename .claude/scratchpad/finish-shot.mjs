import { chromium } from "@playwright/test";

const url = process.argv[2] || "http://localhost:5199";
const outPrefix = process.argv[3] || "/Users/minseon/Code/cuesheet-pipeline/.claude/scratchpad/qa-fix-screenshots/finish";
const suffix = process.argv[4] || "before";

const sizes = [
  { w: 1280, h: 800, label: "1280x800" },
  { w: 1440, h: 900, label: "1440x900" },
];

const browser = await chromium.launch();
for (const { w, h, label } of sizes) {
  const context = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await context.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") console.log(`[console.error][${label}]`, msg.text());
  });
  await page.goto(url, { waitUntil: "networkidle" });
  // Navigate to the Finish/Export step via its step-nav tab.
  await page.locator('[data-testid="step-tab-finish"]').click();
  await page.waitForTimeout(500);
  await page.locator('[data-testid="export-step"]').waitFor({ state: "visible", timeout: 10000 });
  await page.screenshot({ path: `${outPrefix}-${suffix}-${label}.png`, fullPage: true });
  await context.close();
}
await browser.close();
console.log("done");
