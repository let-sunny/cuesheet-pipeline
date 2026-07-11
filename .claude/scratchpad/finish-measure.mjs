import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
await page.goto("http://localhost:5199", { waitUntil: "networkidle" });
await page.locator('[data-testid="step-tab-finish"]').click();
await page.waitForTimeout(300);
const testids = [
  "export-step",
  "export-section-project-meta",
  "export-section-subtitle-style",
  "export-section-subtitle-presets",
  "export-section-intro-outro",
  "export-section-bgm-summary",
  "export-section-narration",
  "export-section-cta",
];
for (const id of testids) {
  const loc = page.locator(`[data-testid="${id}"]`);
  if (await loc.count()) {
    const box = await loc.boundingBox();
    console.log(id, box);
  } else {
    console.log(id, "NOT FOUND");
  }
}
await browser.close();
