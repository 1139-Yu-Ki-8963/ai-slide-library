#!/usr/bin/env node

import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const skillDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(skillDir, "..", "..", "..", "..");
const indexPath = join(projectRoot, "index.html");
const screenshotPath = process.env.CATALOG_PREVIEW_SCREENSHOT || "/tmp/ai-slide-catalog-preview.png";

if (!existsSync(indexPath)) {
  console.error(JSON.stringify({ status: "fail", failures: [`missing: ${indexPath}`] }, null, 2));
  process.exit(1);
}

const { chromium } = createRequire(join(projectRoot, "package.json"))("playwright");
const browser = await chromium.launch({ headless: true });
const failures = [];
let result;
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const browserErrors = [];
  page.on("console", message => { if (message.type() === "error") browserErrors.push(message.text()); });
  page.on("pageerror", error => browserErrors.push(error.message));
  await page.goto(`file://${indexPath}`, { waitUntil: "networkidle" });

  const loadMore = page.locator("#loadmore-btn");
  let expansions = 0;
  while (await loadMore.isVisible()) {
    await loadMore.click();
    await page.waitForTimeout(100);
    expansions += 1;
    if (expansions > 20) {
      failures.push("load-more did not converge");
      break;
    }
  }

  const images = page.locator("img");
  for (let index = 0; index < await images.count(); index += 1) {
    await images.nth(index).scrollIntoViewIfNeeded();
    await page.waitForTimeout(20);
  }
  await page.waitForFunction(() => [...document.images].every(image => image.complete), null, { timeout: 10000 });
  await page.evaluate(() => scrollTo(0, 0));

  const facts = await page.evaluate(() => {
    const imageItems = [...document.images];
    const statusText = document.querySelector("#hit-count")?.textContent ?? "";
    const match = statusText.match(/^(\d+)件中\s+(\d+)件を表示$/);
    return {
      cards: document.querySelectorAll("article.card, .card").length,
      images: imageItems.length,
      brokenImages: imageItems.filter(image => image.naturalWidth === 0).map(image => image.src),
      totalCount: match ? Number(match[1]) : null,
      visibleCount: match ? Number(match[2]) : null,
      statusText,
    };
  });

  if (facts.totalCount === null || facts.visibleCount === null) failures.push(`invalid status: ${facts.statusText}`);
  if (facts.totalCount !== facts.visibleCount) failures.push(`catalog is not fully expanded: ${facts.statusText}`);
  if (facts.cards !== facts.visibleCount) failures.push(`card count mismatch: cards=${facts.cards}, visible=${facts.visibleCount}`);
  if (facts.images !== facts.cards) failures.push(`image count mismatch: images=${facts.images}, cards=${facts.cards}`);
  if (facts.brokenImages.length) failures.push(`broken images: ${facts.brokenImages.join(", ")}`);
  if (browserErrors.length) failures.push(`browser errors: ${browserErrors.join(" | ")}`);

  await page.screenshot({ path: screenshotPath, fullPage: true });
  result = {
    status: failures.length ? "fail" : "pass",
    ...facts,
    browserErrors,
    expansions,
    screenshot: screenshotPath,
    failures,
  };
  await page.close();
} finally {
  await browser.close();
}

console.log(JSON.stringify(result, null, 2));
process.exitCode = failures.length ? 1 : 0;
