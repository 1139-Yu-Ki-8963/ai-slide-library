#!/usr/bin/env node
// サムネイル再生成用の開発ツール。playwright が必要（npm i -D playwright 等）。
// サイト配信には生成済み PNG のみで足り、本スクリプトの実行は不要。
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const slidesDir = join(root, "slides");

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
    }
  } finally {
    await browser.close();
  }
  console.log(`${keys.length} 枚のサムネイルを生成しました`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
