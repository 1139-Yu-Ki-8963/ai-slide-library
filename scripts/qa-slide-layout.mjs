#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const root = resolve(new URL("..", import.meta.url).pathname);
const slidesDir = join(root, "slides");
const outDir = process.env.SLIDE_QA_DIR || "/tmp/ai-slide-library-qa";
mkdirSync(outDir, { recursive: true });

const entries = readdirSync(slidesDir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => ({ key: e.name, html: join(slidesDir, e.name, "解説スライド.html") }))
  .filter((e) => existsSync(e.html))
  .filter((e) => !readFileSync(e.html, "utf8").includes('http-equiv="refresh"'));

const viewports = [
  { name: "desktop", width: 1280, height: 720 },
  { name: "mobile", width: 375, height: 667 },
];

const browser = await chromium.launch({ headless: true });
const results = [];
for (const entry of entries) {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto(`file://${entry.html}`, { waitUntil: "load" });
    await page.waitForTimeout(50);
    const metrics = await page.evaluate(() => {
      const slide = document.querySelector(".slide");
      const viewport = document.querySelector(".slide-viewport, .viewport");
      if (!slide || !viewport) return { missingShell: true };
      const sr = slide.getBoundingClientRect();
      const vr = viewport.getBoundingClientRect();
      const cs = getComputedStyle(slide);
      const clipped = [];
      for (const el of slide.querySelectorAll("*")) {
        // Chromium reports SVG <tspan> getBoundingClientRect() in the SVG user
        // coordinate space on transformed pages. The parent SVG bounds are the
        // authoritative rendered bounds for this check.
        if (el.tagName.toLowerCase() === "tspan") continue;
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        const style = getComputedStyle(el);
        if ((style.overflow === "hidden" || style.overflowX === "hidden" || style.overflowY === "hidden") && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)) {
          clipped.push({ tag: el.tagName, className: String(el.className?.baseVal || el.className || ""), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight });
        }
        const outside = r.left < sr.left - 1 || r.top < sr.top - 1 || r.right > sr.right + 1 || r.bottom > sr.bottom + 1;
        if (outside) clipped.push({ tag: el.tagName, className: String(el.className?.baseVal || el.className || ""), outside: true, left: r.left, top: r.top, right: r.right, bottom: r.bottom });
      }
      return {
        missingShell: false,
        slide: { x: sr.x, y: sr.y, width: sr.width, height: sr.height, cssWidth: cs.width, cssHeight: cs.height, transform: cs.transform },
        viewport: { x: vr.x, y: vr.y, width: vr.width, height: vr.height },
        page: { scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight, clientWidth: document.documentElement.clientWidth, clientHeight: document.documentElement.clientHeight },
        clipped,
        titleCount: document.querySelectorAll(".slide-title, .title").length,
        footerCount: document.querySelectorAll("footer.slide-meta, .slide-footer, .bottom").length,
      };
    });
    const screenshot = join(outDir, `${entry.key}-${viewport.name}.png`);
    await page.screenshot({ path: screenshot });
    results.push({ key: entry.key, viewport: viewport.name, screenshot, errors, ...metrics });
    await page.close();
  }
}
await browser.close();
const report = { generatedAt: new Date().toISOString(), count: entries.length, results };
writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2));
const failures = results.filter((r) => r.errors.length || r.missingShell || r.clipped?.length || (r.viewport === "desktop" && (r.slide?.cssWidth !== "1280px" || r.slide?.cssHeight !== "720px")) || (r.viewport === "mobile" && r.page?.scrollWidth > r.page?.clientWidth));
console.log(JSON.stringify({ count: entries.length, renders: results.length, failures: failures.length, failureKeys: [...new Set(failures.map((r) => `${r.key}:${r.viewport}`))], report: join(outDir, "report.json") }, null, 2));
process.exitCode = failures.length ? 1 : 0;
