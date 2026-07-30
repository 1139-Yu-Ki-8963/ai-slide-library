#!/usr/bin/env node
// サムネイル再生成用の開発ツール。playwright が必要（npm i -D playwright 等）。
// サイト配信には生成済み PNG のみで足り、本スクリプトの実行は不要。
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const slidesDir = join(root, "slides");
const writeEvidence = process.argv.includes("--evidence");
// キー指定実行を追加。全件一括のみだと対象外スライドの成果物まで再生成され、巻き戻し作業が発生するため（2026-07-30 実測: 38件生成→29件復元を2回）。
const requestedKeys = process.argv.slice(2).filter(arg => !arg.startsWith("--"));

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch (e) {
  console.error("エラー: playwright が見つかりません。npm i -D playwright を実行してください");
  process.exit(1);
}

async function main() {
  const allKeys = readdirSync(slidesDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .filter(key => existsSync(join(slidesDir, key, "解説スライド.html")))
    .sort();

  let keys = allKeys;
  if (requestedKeys.length > 0) {
    for (const key of requestedKeys) {
      if (!allKeys.includes(key)) {
        console.error(`エラー: 指定されたキー "${key}" のディレクトリ、または解説スライド.html が見つかりません`);
        process.exit(1);
      }
    }
    keys = requestedKeys;
  }

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
      await page.waitForFunction(() => (
        document.documentElement.dataset.sharedSlideShellReady === "true"
      ));
      await page.evaluate(() => document.fonts?.ready);
      await page.screenshot({ path: thumbFile });
      await page.close();
      if (evidenceContext) {
        const evidenceDir = join(slidesDir, key, "evidence");
        const evidenceFile = join(evidenceDir, "検証用スクリーンショット.png");
        mkdirSync(evidenceDir, { recursive: true });
        const evidencePage = await evidenceContext.newPage();
        await evidencePage.goto("file://" + slideFile, { waitUntil: "networkidle" });
        await evidencePage.waitForFunction(() => (
          document.documentElement.dataset.sharedSlideShellReady === "true"
        ));
        await evidencePage.evaluate(() => document.fonts?.ready);
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
