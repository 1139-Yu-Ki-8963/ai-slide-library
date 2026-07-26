#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { chromium } from "playwright";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const slidesDir = join(root, "slides");
const catalogPath = join(root, "index.html");
const canonicalPath = process.env.SLIDE_CANONICAL_CSS || join(homedir(), "agent-home/skills/generating-explanation-html-slides/references/shared-slide-shell.css");
const reportPath = "/tmp/slide-contract-report.json";
const thumbnailDir = "/tmp/slide-contract-thumbnails";
const expectedCount = 45;
const whiteRateThreshold = 0.985;
const canonicalCss = readFileSync(canonicalPath, "utf8").trim();

mkdirSync(thumbnailDir, { recursive: true });

const fail = (failures, key, check, detail) => failures.push({ key, check, detail });
const normalize = value => value.replace(/\r\n/g, "\n").trim();
const stripGeneratedComment = value => normalize(value).replace(/\/\* GENERATED FROM:[\s\S]*?\*\/\n?/, "").trim();

function listSlides() {
  return readdirSync(slidesDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => ({
      key: entry.name,
      path: join(slidesDir, entry.name, "解説スライド.html"),
    }))
    .filter(entry => existsSync(entry.path))
    .filter(entry => !readFileSync(entry.path, "utf8").includes('http-equiv="refresh"'))
    .sort((a, b) => a.key.localeCompare(b.key, "ja"));
}

function embeddedSharedCss(html) {
  const matches = [...html.matchAll(/<style\b[^>]*data-shared-slide-shell[^>]*>([\s\S]*?)<\/style>/gi)];
  return matches.map(match => stripGeneratedComment(match[1]));
}

function pngDimensions(buffer) {
  if (buffer.toString("ascii", 1, 4) !== "PNG") return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function fileUrl(file) {
  return pathToFileURL(file).href;
}

async function collectRuntime(page) {
  return page.evaluate(() => {
    const slide = document.querySelector(".slide");
    const viewport = document.querySelector(".slide-viewport, .viewport");
    const header = document.querySelector(".slide-header, header");
    const title = document.querySelector(".slide-title, .title, h1");
    // Ignore content footers such as step lists; the metadata footer is the
    // shared-shell contract target.
    const footer = document.querySelector("footer.slide-meta, footer.meta, .slide-footer, .bottom");
    const rect = element => element?.getBoundingClientRect().toJSON() ?? null;
    const computed = element => {
      if (!element) return null;
      const style = getComputedStyle(element);
      return {
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        height: style.height,
        paddingTop: style.paddingTop,
        borderTopWidth: style.borderTopWidth,
        borderTopStyle: style.borderTopStyle,
        borderTopColor: style.borderTopColor,
      };
    };
    const slideRect = rect(slide);
    const inside = target => {
      if (!target || !slideRect) return false;
      return target.left >= slideRect.left - 1 && target.top >= slideRect.top - 1 &&
        target.right <= slideRect.right + 1 && target.bottom <= slideRect.bottom + 1;
    };
    return {
      missing: { viewport: !viewport, slide: !slide, header: !header, title: !title, footer: !footer },
      slide: { rect: slideRect, computedWidth: slide ? getComputedStyle(slide).width : null, computedHeight: slide ? getComputedStyle(slide).height : null },
      viewport: rect(viewport),
      header: { rect: rect(header), inside: inside(rect(header)) },
      title: { rect: rect(title), inside: inside(rect(title)), computed: computed(title), html: title?.innerHTML ?? "" },
      footer: { rect: rect(footer), inside: inside(rect(footer)), computed: computed(footer), html: footer?.innerHTML ?? "" },
      page: { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, scrollHeight: document.documentElement.scrollHeight, clientHeight: document.documentElement.clientHeight },
    };
  });
}

async function canonicalExpected(page, titleHtml, footerHtml) {
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${canonicalCss}</style></head><body><main class="slide"><header class="slide-header"><h1 class="slide-title">${titleHtml}</h1></header><footer class="slide-meta">${footerHtml}</footer></main></body></html>`);
  return page.evaluate(() => {
    const title = document.querySelector(".slide-title");
    const footer = document.querySelector("footer.slide-meta");
    const read = element => {
      const style = getComputedStyle(element);
      return {
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        height: style.height,
        paddingTop: style.paddingTop,
        borderTopWidth: style.borderTopWidth,
        borderTopStyle: style.borderTopStyle,
        borderTopColor: style.borderTopColor,
      };
    };
    return { title: read(title), footer: read(footer) };
  });
}

async function imageWhiteRate(page, buffer) {
  const dataUrl = `data:image/png;base64,${buffer.toString("base64")}`;
  return page.evaluate(src => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let white = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] >= 248 && pixels[i + 1] >= 248 && pixels[i + 2] >= 248 && pixels[i + 3] >= 250) white++;
      }
      resolve({ width: image.naturalWidth, height: image.naturalHeight, whiteRate: white / (pixels.length / 4) });
    };
    image.onerror = () => reject(new Error("thumbnail PNG could not be decoded"));
    image.src = src;
  }), dataUrl);
}

async function main() {
  const entries = listSlides();
  const failures = [];
  const report = {
    generatedAt: new Date().toISOString(),
    expectedCount,
    actualCount: entries.length,
    canonicalPath,
    whiteRateThreshold,
    slides: [],
    catalog: null,
    failures,
  };

  if (entries.length !== expectedCount) fail(failures, "global", "slide-count", `expected ${expectedCount}, got ${entries.length}`);

  const browser = await chromium.launch({ headless: true });
  try {
    for (const entry of entries) {
      const html = readFileSync(entry.path, "utf8");
      const slideReport = { key: entry.key, path: `slides/${entry.key}/解説スライド.html`, css: {}, contract: {}, thumbnail: {} };
      const embedded = embeddedSharedCss(html);
      slideReport.css = { exact: embedded.length === 1 && embedded[0] === canonicalCss, blockCount: embedded.length, embeddedLength: embedded[0]?.length ?? null, canonicalLength: canonicalCss.length };
      if (embedded.length !== 1) fail(failures, entry.key, "shared-css-block-count", `expected exactly one data-shared-slide-shell style, got ${embedded.length}`);
      if (!slideReport.css.exact) fail(failures, entry.key, "shared-css-exact-match", embedded.length === 0 ? "missing data-shared-slide-shell style" : "embedded CSS differs after generated comment removal");

      const shellChecks = {
        viewport: /class="[^\"]*(?:slide-viewport|viewport)[^\"]*"/.test(html),
        slide: /class="[^\"]*\bslide\b[^\"]*"/.test(html),
        header: /class="[^\"]*\bslide-header\b[^\"]*"|<header\b/i.test(html),
        title: /class="[^\"]*\b(?:slide-title|title)\b[^\"]*"|<h1\b/i.test(html),
        footer: /class="[^\"]*\b(?:slide-meta|slide-footer|meta|bottom)\b[^\"]*"/i.test(html),
      };
      slideReport.contract.shellChecks = shellChecks;
      for (const [name, passed] of Object.entries(shellChecks)) if (!passed) fail(failures, entry.key, `${name}-contract`, `missing ${name} shell contract`);

      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      const errors = [];
      page.on("pageerror", error => errors.push(String(error)));
      page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
      await page.goto(fileUrl(entry.path), { waitUntil: "load" });
      await page.waitForTimeout(50);
      const runtime = await collectRuntime(page);
      slideReport.contract.desktop = { runtime, errors };
      for (const [name, missing] of Object.entries(runtime.missing)) if (missing) fail(failures, entry.key, `${name}-runtime`, `missing runtime element: ${name}`);
      if (errors.length) fail(failures, entry.key, "desktop-javascript-errors", JSON.stringify(errors));
      if (runtime.slide.computedWidth !== "1280px" || runtime.slide.computedHeight !== "720px") fail(failures, entry.key, "desktop-slide-size", JSON.stringify(runtime.slide));
      for (const name of ["header", "title", "footer"]) if (!runtime[name].inside) fail(failures, entry.key, `desktop-${name}-inside-slide`, JSON.stringify(runtime[name].rect));

      const expectedPage = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      const expected = await canonicalExpected(expectedPage, runtime.title.html, runtime.footer.html);
      await expectedPage.close();
      slideReport.contract.expected = expected;
      slideReport.contract.comparison = {
        title: { actual: runtime.title.computed, expected: expected.title },
        footer: { actual: runtime.footer.computed, expected: expected.footer },
      };
      for (const property of ["fontSize", "lineHeight"]) if (runtime.title.computed?.[property] !== expected.title[property]) fail(failures, entry.key, `title-${property}`, `${runtime.title.computed?.[property]} !== canonical ${expected.title[property]}`);
      for (const property of ["borderTopWidth", "borderTopStyle", "fontSize", "paddingTop", "height"]) if (runtime.footer.computed?.[property] !== expected.footer[property]) fail(failures, entry.key, `footer-${property}`, `${runtime.footer.computed?.[property]} !== canonical ${expected.footer[property]}`);
      await page.close();

      const thumbPage = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 0.5 });
      await thumbPage.goto(fileUrl(entry.path), { waitUntil: "load" });
      await thumbPage.waitForTimeout(50);
      const thumbRuntime = await collectRuntime(thumbPage);
      const buffer = await thumbPage.screenshot({ path: join(thumbnailDir, `${entry.key}.png`) });
      const dimensions = pngDimensions(buffer);
      const imageStats = await imageWhiteRate(thumbPage, buffer);
      slideReport.thumbnail = { dimensions, imageStats, runtime: thumbRuntime };
      if (!dimensions || dimensions.width !== 640 || dimensions.height !== 360) fail(failures, entry.key, "thumbnail-dimensions", JSON.stringify(dimensions));
      const slideRect = thumbRuntime.slide.rect;
      if (!slideRect || slideRect.left < -1 || slideRect.top < -1 || slideRect.right > 1281 || slideRect.bottom > 721) fail(failures, entry.key, "thumbnail-slide-inside-image", JSON.stringify(slideRect));
      for (const name of ["header", "title", "footer"]) if (!thumbRuntime[name].inside) fail(failures, entry.key, `thumbnail-${name}-inside-slide`, JSON.stringify(thumbRuntime[name].rect));
      if (imageStats.whiteRate > whiteRateThreshold) fail(failures, entry.key, "thumbnail-white-rate", `${imageStats.whiteRate} > ${whiteRateThreshold}`);
      await thumbPage.close();
      report.slides.push(slideReport);
    }

    const catalogPage = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const catalogErrors = [];
    catalogPage.on("pageerror", error => catalogErrors.push(String(error)));
    await catalogPage.goto(fileUrl(catalogPath), { waitUntil: "load" });
    await catalogPage.evaluate(async () => {
      const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
      for (;;) {
        const button = document.querySelector("#loadmore-btn");
        if (!button || button.offsetParent === null || button.disabled) break;
        button.click();
        await wait(25);
      }
      for (const image of [...document.images]) {
        image.scrollIntoView({ block: "center" });
        await wait(10);
      }
      window.scrollTo(0, 0);
      await wait(200);
    });
    const catalog = await catalogPage.evaluate(() => {
      const viewportWidth = document.documentElement.clientWidth;
      const images = [...document.images].map(image => {
        const rect = image.getBoundingClientRect();
        const parentRect = image.parentElement?.getBoundingClientRect();
        return {
          src: image.getAttribute("src"),
          complete: image.complete,
          naturalWidth: image.naturalWidth,
          width: rect.width,
          withinCatalogWidth: rect.left >= -1 && rect.right <= viewportWidth + 1 && (!parentRect || rect.width <= parentRect.width + 1),
        };
      });
      return { count: images.length, images, viewportWidth };
    });
    report.catalog = { ...catalog, errors: catalogErrors };
    if (catalog.count < expectedCount) fail(failures, "catalog", "image-count", `expected at least ${expectedCount}, got ${catalog.count}`);
    if (catalogErrors.length) fail(failures, "catalog", "javascript-errors", JSON.stringify(catalogErrors));
    if (catalog.images.some(image => !image.complete || image.naturalWidth <= 0)) fail(failures, "catalog", "image-load", JSON.stringify(catalog.images.filter(image => !image.complete || image.naturalWidth <= 0).slice(0, 5)));
    if (catalog.images.some(image => !image.withinCatalogWidth)) fail(failures, "catalog", "image-display-width", JSON.stringify(catalog.images.filter(image => !image.withinCatalogWidth).slice(0, 5)));
    await catalogPage.close();
  } finally {
    await browser.close();
  }

  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ entries: entries.length, failures: failures.length, report: reportPath, thumbnailDir, firstFailures: failures.slice(0, 20) }, null, 2));
  process.exitCode = failures.length ? 1 : 0;
}

main().catch(error => {
  try { writeFileSync(reportPath, JSON.stringify({ status: "error", error: String(error) }, null, 2)); } catch {}
  console.error(error);
  process.exitCode = 1;
});
