#!/usr/bin/env node
// サムネイル再生成用の開発ツール。playwright が必要（npm i -D playwright 等）。
// サイト配信には生成済み PNG のみで足り、本スクリプトの実行は不要。
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const slidesDir = join(root, "slides");
const writeEvidence = process.argv.includes("--evidence");

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch (e) {
  console.error("エラー: playwright が見つかりません。npm i -D playwright を実行してください");
  process.exit(1);
}

async function main() {
  const keys = readdirSync(slidesDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .filter(key => existsSync(join(slidesDir, key, "解説スライド.html")))
    .sort();

  if (keys.length === 0) {
    console.error("エラー: 解説スライド.html を持つスライドが見つかりませんでした");
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  try {
    // Render the canonical 1280x720 slide and downsample via the device scale.
    // Rendering at 640x360 activates the mobile CSS and can crop absolute
    // positioned shells before the thumbnail is captured.
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 0.5 });
    const evidenceContext = writeEvidence
      ? await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })
      : null;
    for (const key of keys) {
      const slideFile = join(slidesDir, key, "解説スライド.html");
      const thumbFile = join(slidesDir, key, "サムネイル.png");
      const page = await context.newPage();
      await page.goto("file://" + slideFile, { waitUntil: "networkidle" });
      await page.waitForTimeout(300);
      await page.screenshot({ path: thumbFile });
      await page.close();
      if (evidenceContext) {
        const evidenceDir = join(slidesDir, key, "evidence");
        const evidenceFile = join(evidenceDir, "検証用スクリーンショット.png");
        mkdirSync(evidenceDir, { recursive: true });
        const evidencePage = await evidenceContext.newPage();
        await evidencePage.goto("file://" + slideFile, { waitUntil: "networkidle" });
        await evidencePage.waitForTimeout(300);
        await evidencePage.screenshot({ path: evidenceFile });
        await evidencePage.close();
      }
    }
    await context.close();
    if (evidenceContext) await evidenceContext.close();
  } finally {
    await browser.close();
  }
  console.log(`${keys.length} 枚のサムネイル${writeEvidence ? "と検証用スクリーンショット" : ""}を生成しました`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
