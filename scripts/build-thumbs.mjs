#!/usr/bin/env node
// サムネイル再生成用の開発ツール。playwright が必要（npm i -D playwright 等）。
// サイト配信には生成済み PNG のみで足り、本スクリプトの実行は不要。
// --evidence: 640×360 サムネイルに加え、1280×720 の検証用スクリーンショットを
//   各スライドの evidence/ に出力する（commit 時に hook が存在・寸法を検査する）。
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const slidesDir = join(root, "slides");
const evidenceMode = process.argv.includes("--evidence");

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
    for (const key of keys) {
      const slideFile = join(slidesDir, key, "解説スライド.html");
      const thumbFile = join(slidesDir, key, "サムネイル.png");
      const page = await browser.newPage();
      await page.setViewportSize({ width: 640, height: 360 });
      await page.goto("file://" + slideFile, { waitUntil: "networkidle" });
      await page.waitForTimeout(300);
      await page.screenshot({ path: thumbFile });
      await page.close();

      if (evidenceMode) {
        const evidenceDir = join(slidesDir, key, "evidence");
        mkdirSync(evidenceDir, { recursive: true });
        const evidencePage = await browser.newPage();
        await evidencePage.setViewportSize({ width: 1280, height: 720 });
        await evidencePage.goto("file://" + slideFile, { waitUntil: "networkidle" });
        await evidencePage.waitForTimeout(300);
        await evidencePage.screenshot({ path: join(evidenceDir, "検証用スクリーンショット.png") });
        await evidencePage.close();
      }
    }
  } finally {
    await browser.close();
  }
  const msg = `${keys.length} 枚のサムネイルを生成しました`;
  console.log(evidenceMode ? msg + "（検証用スクリーンショットを evidence/ に出力しました）" : msg);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
